import {
  BLOCKED_SITE_CATEGORIES,
  formatSiteDomains,
  getSitesForCategory,
  type BlockedSite,
  type BlockedSiteCategory,
} from "./shared/sites.js";
import {
  getState,
  updateState,
  type AccessAttempt,
  type ExtensionState,
} from "./shared/storage.js";

const CATEGORY_EXPANSION_STORAGE_KEY =
  "social-media-blocker-popup-category-expansion-v1";

const globalToggle = queryElement<HTMLInputElement>("#global-toggle");
const siteList = queryElement<HTMLElement>("#site-list");
const attemptsEmpty = queryElement<HTMLElement>("#popup-attempts-empty");
const attemptsList = queryElement<HTMLOListElement>("#popup-attempts-list");
const expandedCategoryIds = readExpandedCategoryIds();

void render();

globalToggle.addEventListener("change", () => {
  const enabled = globalToggle.checked;
  void updateState((state) => ({ ...state, globalEnabled: enabled })).then(render);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && Object.keys(changes).length > 0) {
    void render();
  }
});

async function render(): Promise<void> {
  const state = await getState();
  globalToggle.checked = state.globalEnabled;
  renderSites(state);
  renderAttempts(state.attempts);
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
  categoryElement.setAttribute("aria-labelledby", `category-${category.id}-label`);

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
  const name = document.createElement("strong");
  name.id = `category-${category.id}-label`;
  name.textContent = category.name;
  const summary = document.createElement("small");
  summary.className = "category-summary";
  summary.textContent = `${enabledCount}/${sites.length} enabled · ${category.description}`;

  labelText.append(name, summary);
  toggleLabel.append(checkbox, labelText);

  const expandButton = document.createElement("button");
  expandButton.type = "button";
  expandButton.className = "category-expander";
  expandButton.setAttribute("aria-controls", panelId);
  expandButton.setAttribute("aria-expanded", String(isExpanded));
  expandButton.setAttribute(
    "aria-label",
    `${isExpanded ? "Minimise" : "Expand"} ${category.name} sites`,
  );
  expandButton.textContent = isExpanded ? "Minimise" : "Expand";
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

function createSiteToggle(site: BlockedSite, state: ExtensionState): HTMLLabelElement {
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
  const defaultExpandedIds = BLOCKED_SITE_CATEGORIES.map((category) => category.id);

  try {
    const storedValue = window.localStorage.getItem(CATEGORY_EXPANSION_STORAGE_KEY);
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
