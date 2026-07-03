import { SOCIAL_SITES, formatSiteDomains } from "./shared/sites.js";
import {
  getState,
  updateState,
  type AccessAttempt,
  type ExtensionState,
} from "./shared/storage.js";

const globalToggle = queryElement<HTMLInputElement>("#global-toggle");
const siteList = queryElement<HTMLElement>("#site-list");
const attemptsEmpty = queryElement<HTMLElement>("#popup-attempts-empty");
const attemptsList = queryElement<HTMLOListElement>("#popup-attempts-list");

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

  for (const site of SOCIAL_SITES) {
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
    siteList.append(label);
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
