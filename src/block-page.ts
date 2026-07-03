import { getCurrentTab, sendRuntimeMessage } from "./shared/chrome.js";
import type { GrantAccessMessage, GrantAccessResponse } from "./shared/messages.js";
import { findMatchingSite, getSiteById } from "./shared/sites.js";
import { getState, type AccessAttempt } from "./shared/storage.js";

const siteName = queryElement<HTMLElement>("#site-name");
const targetUrlElement = queryElement<HTMLElement>("#target-url");
const reasonForm = queryElement<HTMLFormElement>("#reason-form");
const reasonInput = queryElement<HTMLTextAreaElement>("#reason-input");
const formError = queryElement<HTMLElement>("#form-error");
const continueButton = queryElement<HTMLButtonElement>("#continue-button");
const attemptsEmpty = queryElement<HTMLElement>("#attempts-empty");
const attemptsList = queryElement<HTMLOListElement>("#attempts-list");

const params = new URLSearchParams(window.location.search);
const requestedUrl = params.get("url") ?? "";
const requestedSiteId = params.get("site") ?? "";
const matchedSite = findMatchingSite(requestedUrl);
const configuredSite = getSiteById(requestedSiteId);
const site = configuredSite && configuredSite.id === matchedSite?.id ? configuredSite : matchedSite;

void initialise();

async function initialise(): Promise<void> {
  if (!site || !requestedUrl) {
    siteName.textContent = "Nothing to unblock";
    targetUrlElement.textContent = "No valid blocked URL was provided.";
    reasonForm.hidden = true;
    await renderAttempts();
    return;
  }

  siteName.textContent = site.name;
  targetUrlElement.textContent = requestedUrl;
  await renderAttempts();

  reasonForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitReason();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && Object.keys(changes).length > 0) {
      void renderAttempts();
    }
  });
}

async function submitReason(): Promise<void> {
  if (!site) {
    return;
  }

  const reason = reasonInput.value.trim();
  if (!reason) {
    showError("Write a reason before continuing.");
    reasonInput.focus();
    return;
  }

  setSubmitting(true);
  showError("");

  try {
    const currentTab = await getCurrentTab();
    if (typeof currentTab?.id !== "number") {
      throw new Error("Could not identify this tab.");
    }

    const message: GrantAccessMessage = {
      type: "grant-access",
      tabId: currentTab.id,
      siteId: site.id,
      url: requestedUrl,
      reason,
    };
    const response = await sendRuntimeMessage<GrantAccessResponse>(message);

    if (!response?.ok) {
      throw new Error(response?.error ?? "Could not continue to the site.");
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not continue.");
    setSubmitting(false);
  }
}

async function renderAttempts(): Promise<void> {
  const state = await getState();
  attemptsList.replaceChildren();
  attemptsEmpty.hidden = state.attempts.length > 0;

  for (const attempt of state.attempts) {
    attemptsList.append(createAttemptElement(attempt));
  }
}

function createAttemptElement(attempt: AccessAttempt): HTMLLIElement {
  const item = document.createElement("li");

  const meta = document.createElement("div");
  meta.className = "attempt-meta";
  meta.textContent = `${attempt.siteName} · ${formatDate(attempt.createdAt)}`;

  const url = document.createElement("div");
  url.className = "attempt-url";
  url.textContent = attempt.url;

  const reason = document.createElement("p");
  reason.className = "attempt-reason";
  reason.textContent = attempt.reason;

  item.append(meta, url, reason);
  return item;
}

function showError(message: string): void {
  formError.textContent = message;
  formError.hidden = !message;
}

function setSubmitting(isSubmitting: boolean): void {
  continueButton.disabled = isSubmitting;
  reasonInput.disabled = isSubmitting;
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
