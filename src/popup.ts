import { sendRuntimeMessage } from "./shared/chrome.js";
import type {
  SetGlobalBlockingMessage,
  SetGlobalBlockingResponse,
} from "./shared/messages.js";
import {
  BLOCKED_SITE_CATEGORIES,
  formatSiteDomains,
  getSitesForCategory,
  type BlockedSite,
  type BlockedSiteCategory,
} from "./shared/sites.js";
import {
  STORAGE_KEY,
  getActiveGlobalDisableUntil,
  getState,
  isBlockingEnabled,
  updateState,
  type AccessAttempt,
  type ExtensionState,
} from "./shared/storage.js";

const CATEGORY_EXPANSION_STORAGE_KEY =
  "social-media-blocker-popup-category-expansion-v1";

const globalToggle = queryElement<HTMLInputElement>("#global-toggle");
const globalToggleLabel = queryElement<HTMLElement>("#global-toggle-label");
const globalToggleDescription = queryElement<HTMLElement>(
  "#global-toggle-description",
);
const siteList = queryElement<HTMLElement>("#site-list");
const attemptsEmpty = queryElement<HTMLElement>("#popup-attempts-empty");
const attemptsList = queryElement<HTMLOListElement>("#popup-attempts-list");
const expandedCategoryIds = readExpandedCategoryIds();

void render();

globalToggle.addEventListener("change", () => {
  void setGlobalBlocking(globalToggle.checked).catch((error: unknown) => {
    console.error("Failed to update global blocking", error);
    void render();
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && STORAGE_KEY in changes) {
    void render();
  }
});

async function setGlobalBlocking(enabled: boolean): Promise<void> {
  const message: SetGlobalBlockingMessage = {
    type: "set-global-blocking",
    enabled,
  };
  const response = await sendRuntimeMessage<SetGlobalBlockingResponse>(message);
  if (!response?.ok) {
    throw new Error(
      response?.error ?? "Could not update the blocking setting.",
    );
  }

  await render();
}

async function render(): Promise<void> {
  const state = await getState();
  renderGlobalToggle(state);
  renderSites(state);
  renderAttempts(state.attempts);
}

function renderGlobalToggle(state: ExtensionState): void {
  const activeDisableUntil = getActiveGlobalDisableUntil(state);
  globalToggle.checked = isBlockingEnabled(state);

  if (state.globalEnabled && activeDisableUntil !== null) {
    globalToggleLabel.textContent = "Blocking paused";
    globalToggleDescription.textContent =
      `All blocking resumes at ${formatDisableEnd(activeDisableUntil)}. ` +
      "Check to resume now.";
    return;
  }

  if (!state.globalEnabled) {
    globalToggleLabel.textContent = "Blocking disabled";
    globalToggleDescription.textContent =
      "All blocked-site controls are off. Check to enable them.";
    return;
  }

  globalToggleLabel.textContent = "Blocking enabled";
  globalToggleDescription.textContent =
    "Turns all blocked-site controls on or off.";
}

function renderSites(state: ExtensionState): void {
  siteList.replaceChildren();

  for (const category of BLOCKED_SITE_CATEGORIES) {
    const categorySites = getSitesForCategory(category);
    if (categorySites.length === 0) {
      continue;
    }

    siteList.append(createCategoryElement(category, categorySites, state));
  }
}

function createCategoryElement(
  category: BlockedSiteCategory,
  sites: readonly BlockedSite[],
  state: ExtensionState,
): HTMLElement {
  const isExpanded = expandedCategoryIds.has(category.id);
  const enabledCount = countEnabledSites(sites, state);
  const categoryElement = document.createElement("section");
  const panelId = `category-${category.id}-sites`;

  categoryElement.className = "site-category";
  categoryElement.setAttribute(
    "aria-labelledby",
    `category-${category.id}-label`,
  );

  const header = document.createElement("div");
  header.className = "site-category-header";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "category-toggle";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = enabledCount === sites.length;
  checkbox.indeterminate = enabledCount > 0 && enabledCount < sites.length;
  checkbox.addEventListener("change", () => {
    const isEnabled = checkbox.checked;
    void updateState((currentState) => ({
      ...currentState,
      sites: applyCategorySetting(currentState.sites, sites, isEnabled),
    })).then(render);
  });

  const labelText = document.createElement("span");
  labelText.className = "category-copy";

  const name = document.createElement("strong");
  name.id = `category-${category.id}-label`;
  name.textContent = category.name;

  const meta = document.createElement("span");
  meta.className = "category-meta";

  const enabledSummary = document.createElement("span");
  enabledSummary.className = "category-enabled-summary";
  enabledSummary.textContent = `${enabledCount}/${sites.length} enabled`;

  const description = document.createElement("small");
  description.className = "category-summary";
  description.textContent = category.description;

  meta.append(enabledSummary, description);
  labelText.append(name, meta);
  toggleLabel.append(checkbox, labelText);

  const expandButton = document.createElement("button");
  expandButton.type = "button";
  expandButton.className = "category-expander";
  expandButton.setAttribute("aria-controls", panelId);
  expandButton.setAttribute("aria-expanded", String(isExpanded));
  expandButton.setAttribute(
    "aria-label",
    `${isExpanded ? "Collapse" : "Expand"} ${category.name} sites`,
  );
  expandButton.append(createChevronIcon());
  expandButton.addEventListener("click", () => {
    setCategoryExpanded(category.id, !isExpanded);
    renderSites(state);
  });

  header.append(toggleLabel, expandButton);

  const sitePanel = document.createElement("div");
  sitePanel.id = panelId;
  sitePanel.className = "category-site-list";
  sitePanel.hidden = !isExpanded;

  for (const site of sites) {
    sitePanel.append(createSiteToggle(site, state));
  }

  categoryElement.append(header, sitePanel);
  return categoryElement;
}

function createChevronIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("category-expander-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("focusable", "false");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M4 6l4 4 4-4");
  svg.append(path);

  return svg;
}

function createSiteToggle(
  site: BlockedSite,
  state: ExtensionState,
): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "toggle-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.sites[site.id] ?? true;
  checkbox.addEventListener("change", () => {
    const isEnabled = checkbox.checked;
    void updateState((currentState) => ({
      ...currentState,
      sites: { ...currentState.sites, [site.id]: isEnabled },
    })).then(render);
  });

  const text = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = site.name;
  const domains = document.createElement("small");
  domains.className = "site-domains";
  domains.textContent = formatSiteDomains(site);

  text.append(name, domains);
  label.append(checkbox, text);
  return label;
}

function countEnabledSites(
  sites: readonly BlockedSite[],
  state: ExtensionState,
): number {
  return sites.filter((site) => state.sites[site.id] ?? true).length;
}

function applyCategorySetting(
  currentSites: Record<string, boolean>,
  sites: readonly BlockedSite[],
  isEnabled: boolean,
): Record<string, boolean> {
  const nextSites = { ...currentSites };

  for (const site of sites) {
    nextSites[site.id] = isEnabled;
  }

  return nextSites;
}

function setCategoryExpanded(categoryId: string, isExpanded: boolean): void {
  if (isExpanded) {
    expandedCategoryIds.add(categoryId);
  } else {
    expandedCategoryIds.delete(categoryId);
  }

  writeExpandedCategoryIds(expandedCategoryIds);
}

function readExpandedCategoryIds(): Set<string> {
  const defaultExpandedIds = BLOCKED_SITE_CATEGORIES.map(
    (category) => category.id,
  );

  try {
    const storedValue = window.localStorage.getItem(
      CATEGORY_EXPANSION_STORAGE_KEY,
    );
    if (storedValue === null) {
      return new Set(defaultExpandedIds);
    }

    const parsedValue: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) {
      return new Set(defaultExpandedIds);
    }

    const validIds = new Set(defaultExpandedIds);
    return new Set(
      parsedValue.filter(
        (categoryId): categoryId is string =>
          typeof categoryId === "string" && validIds.has(categoryId),
      ),
    );
  } catch {
    return new Set(defaultExpandedIds);
  }
}

function writeExpandedCategoryIds(categoryIds: Set<string>): void {
  try {
    window.localStorage.setItem(
      CATEGORY_EXPANSION_STORAGE_KEY,
      JSON.stringify([...categoryIds]),
    );
  } catch {
    // Category expansion is only a popup preference; rendering can continue.
  }
}

function renderAttempts(attempts: AccessAttempt[]): void {
  const recentAttempts = attempts.slice(0, 5);
  attemptsList.replaceChildren();
  attemptsEmpty.hidden = recentAttempts.length > 0;

  for (const attempt of recentAttempts) {
    attemptsList.append(createAttemptElement(attempt));
  }
}

function createAttemptElement(attempt: AccessAttempt): HTMLLIElement {
  const item = document.createElement("li");

  const meta = document.createElement("div");
  meta.className = "attempt-meta";
  meta.textContent = `${attempt.siteName} · ${formatDate(attempt.createdAt)}`;

  const reason = document.createElement("p");
  reason.className = "attempt-reason";
  reason.textContent = attempt.reason;

  item.append(meta, reason);
  return item;
}

function formatDisableEnd(value: number): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function queryElement<TElement extends Element>(selector: string): TElement {
  const element = document.querySelector<TElement>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}
