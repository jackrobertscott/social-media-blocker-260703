import { getCurrentTab, sendRuntimeMessage, updateTab } from "./shared/chrome.js";
import type { GrantAccessMessage, GrantAccessResponse } from "./shared/messages.js";
import { findMatchingSite, getSiteById } from "./shared/sites.js";
import { getState, type AccessAttempt } from "./shared/storage.js";

const EMPTY_ATTEMPTS_TEXT = "No reasons recorded yet.";

const pageShell = queryElement<HTMLElement>("#block-page");
const siteName = queryElement<HTMLElement>("#site-name");
const leadText = queryElement<HTMLElement>("#lead-text");
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
const site =
  configuredSite && configuredSite.id === matchedSite?.id
    ? configuredSite
    : matchedSite;

let isRedirecting = false;
let refreshSequence = 0;

void initialise().catch(showInitialisationError);

async function initialise(): Promise<void> {
  if (!site || !requestedUrl) {
    renderInvalidRequest();
    await renderAttemptsSafely();
    revealPage();
    return;
  }

  renderBlockRequest();

  if (await continueIfBlockingDisabled()) {
    return;
  }

  await renderAttemptsSafely();
  revealPage();

  reasonForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitReason();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && Object.keys(changes).length > 0) {
      void refreshAfterStateChange().catch(showRefreshError);
    }
  });
}

async function refreshAfterStateChange(): Promise<void> {
  const refreshId = ++refreshSequence;

  if (await continueIfBlockingDisabled()) {
    return;
  }

  const state = await getState();
  if (refreshId !== refreshSequence || isRedirecting) {
    return;
  }

  renderAttempts(state.attempts);
}

async function continueIfBlockingDisabled(): Promise<boolean> {
  if (isRedirecting) {
    return true;
  }

  if (!site || !requestedUrl) {
    return false;
  }

  const state = await getState();
  const siteIsEnabled = state.sites[site.id] ?? true;
  if (state.globalEnabled && siteIsEnabled) {
    return false;
  }

  const wasVisible = !pageShell.hidden;
  isRedirecting = true;
  hidePage();

  try {
    const currentTab = await getCurrentTab();
    if (typeof currentTab?.id !== "number") {
      throw new Error("Blocking is disabled, but this tab could not be reopened.");
    }

    await updateTab(currentTab.id, { url: requestedUrl });
    return true;
  } catch (error) {
    isRedirecting = false;
    if (wasVisible) {
      revealPage();
    }
    showError(error instanceof Error ? error.message : "Could not reopen this page.");
    return false;
  }
}

async function submitReason(): Promise<void> {
  if (!site || isRedirecting) {
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

async function renderAttemptsSafely(): Promise<void> {
  try {
    const state = await getState();
    renderAttempts(state.attempts);
  } catch (error) {
    showAttemptsError("Could not load previous access reasons.");
    console.error("Failed to render access attempts", error);
  }
}

function renderAttempts(attempts: AccessAttempt[]): void {
  attemptsList.replaceChildren();
  attemptsEmpty.textContent = EMPTY_ATTEMPTS_TEXT;
  attemptsEmpty.hidden = attempts.length > 0;

  for (const attempt of attempts) {
    attemptsList.append(createAttemptElement(attempt));
  }
}

function renderBlockRequest(): void {
  siteName.textContent = site?.name ?? "";
  targetUrlElement.textContent = requestedUrl;
  reasonForm.hidden = false;
}

function renderInvalidRequest(): void {
  siteName.textContent = "Nothing to unblock";
  leadText.textContent = "No valid blocked URL was provided.";
  reasonForm.hidden = true;
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

function showAttemptsError(message: string): void {
  attemptsList.replaceChildren();
  attemptsEmpty.textContent = message;
  attemptsEmpty.hidden = false;
}

function showInitialisationError(error: unknown): void {
  console.error("Failed to initialise block page", error);
  siteName.textContent = "Could not load block page";
  leadText.textContent = "Refresh this tab or try opening the original URL again.";
  reasonForm.hidden = true;
  showAttemptsError("Could not load previous access reasons.");
  revealPage();
}

function showRefreshError(error: unknown): void {
  console.error("Failed to refresh block page", error);
  showAttemptsError("Could not refresh previous access reasons.");
}

function setSubmitting(isSubmitting: boolean): void {
  continueButton.disabled = isSubmitting;
  reasonInput.disabled = isSubmitting;
}

function revealPage(): void {
  pageShell.hidden = false;
}

function hidePage(): void {
  pageShell.hidden = true;
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
