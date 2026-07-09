import { getCurrentTab, sendRuntimeMessage, updateTab } from "./shared/chrome.js";
import type { GrantAccessMessage, GrantAccessResponse } from "./shared/messages.js";
import { findMatchingSite, getMainDomain, getSiteById } from "./shared/sites.js";
import { getState, type AccessAttempt } from "./shared/storage.js";

const EMPTY_ATTEMPTS_TEXT = "No reasons recorded yet.";
const LAST_OUTDOOR_PHOTO_KEY = "social-media-blocker-last-outdoor-photo-v1";
const TWO_WEEK_DAY_COUNT = 14;
const WEEK_DAY_COUNT = 7;
const MONTH_DAY_COUNT = 30;
const ALLOWED_BYPASS_DURATIONS_MINUTES = [15, 30, 60, 120] as const;

interface DailyBypassCount {
  key: string;
  label: string;
  displayLabel: string;
  count: number;
}

interface OutdoorPhoto {
  id: string;
  src: string;
  alt: string;
}

const OUTDOOR_PHOTOS: OutdoorPhoto[] = [
  {
    id: "alpine-trail",
    src: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1800&q=85",
    alt: "A winding trail through bright green mountains beneath a soft sky.",
  },
  {
    id: "quiet-lake",
    src: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1800&q=85",
    alt: "A calm mountain lake reflecting trees and a clear blue sky.",
  },
  {
    id: "forest-light",
    src: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1800&q=85",
    alt: "Sunlight filtering through a lush green forest path.",
  },
  {
    id: "valley-river",
    src: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1800&q=85",
    alt: "A wide valley river surrounded by granite cliffs and pine trees.",
  },
  {
    id: "waterfall-mist",
    src: "https://images.unsplash.com/photo-1433086966358-54859d0ed716?auto=format&fit=crop&w=1800&q=85",
    alt: "A waterfall dropping through green cliffs into mist below.",
  },
  {
    id: "desert-road",
    src: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1800&q=85",
    alt: "A quiet road stretching through warm desert hills at sunset.",
  },
  {
    id: "starry-peaks",
    src: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1800&q=85",
    alt: "Snowy mountain peaks under a clear, starry night sky.",
  },
  {
    id: "coastal-cliffs",
    src: "https://images.unsplash.com/photo-1519904981063-b0cf448d479e?auto=format&fit=crop&w=1800&q=85",
    alt: "Rugged coastal cliffs meeting deep blue ocean water.",
  },
];

const pageShell = queryElement<HTMLElement>("#block-page");
const outdoorPhoto = queryElement<HTMLImageElement>("#outdoor-photo");
const siteName = queryElement<HTMLElement>("#site-name");
const leadText = queryElement<HTMLElement>("#lead-text");
const targetUrlElement = queryElement<HTMLElement>("#target-url");
const bypassButton = queryElement<HTMLButtonElement>("#bypass-button");
const reasonForm = queryElement<HTMLFormElement>("#reason-form");
const reasonInput = queryElement<HTMLTextAreaElement>("#reason-input");
const durationInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="durationMinutes"]'),
);
const formError = queryElement<HTMLElement>("#form-error");
const continueButton = queryElement<HTMLButtonElement>("#continue-button");
const attemptsEmpty = queryElement<HTMLElement>("#attempts-empty");
const attemptsList = queryElement<HTMLOListElement>("#attempts-list");
const dayBypassCount = queryElement<HTMLElement>("#bypass-stat-day");
const weekBypassCount = queryElement<HTMLElement>("#bypass-stat-week");
const monthBypassCount = queryElement<HTMLElement>("#bypass-stat-month");
const bypassGraph = queryElement<HTMLOListElement>("#bypass-graph");

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
    renderOutdoorPhoto();
    renderInvalidRequest();
    await renderAttemptsSafely();
    revealPage();
    return;
  }

  renderBlockRequest();

  if (await continueIfBlockingDisabled()) {
    return;
  }

  renderOutdoorPhoto();
  await renderAttemptsSafely();
  revealPage();

  bypassButton.addEventListener("click", revealReasonForm);

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

  renderAccessData(state.attempts);
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

  const durationMinutes = readSelectedDurationMinutes();
  if (!durationMinutes) {
    showError("Choose how long the bypass should stay active.");
    durationInputs[0]?.focus();
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
      durationMinutes,
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
    renderAccessData(state.attempts);
  } catch (error) {
    showAttemptsError("Could not load previous access reasons.");
    renderBypassStats([]);
    console.error("Failed to render access attempts", error);
  }
}

function renderAccessData(attempts: AccessAttempt[]): void {
  renderAttempts(attempts);
  renderBypassStats(attempts);
}

function renderAttempts(attempts: AccessAttempt[]): void {
  attemptsList.replaceChildren();
  attemptsEmpty.textContent = EMPTY_ATTEMPTS_TEXT;
  attemptsEmpty.hidden = attempts.length > 0;

  for (const attempt of attempts) {
    attemptsList.append(createAttemptElement(attempt));
  }
}

function renderBypassStats(attempts: AccessAttempt[]): void {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const weekStart = addDays(todayStart, -(WEEK_DAY_COUNT - 1));
  const monthStart = addDays(todayStart, -(MONTH_DAY_COUNT - 1));
  const datedAttempts = attempts.flatMap((attempt) => {
    const date = new Date(attempt.createdAt);
    return Number.isNaN(date.getTime()) || date > now ? [] : [date];
  });

  dayBypassCount.textContent = String(
    datedAttempts.filter((date) => date >= todayStart).length,
  );
  weekBypassCount.textContent = String(
    datedAttempts.filter((date) => date >= weekStart).length,
  );
  monthBypassCount.textContent = String(
    datedAttempts.filter((date) => date >= monthStart).length,
  );

  const dailyCounts = getDailyBypassCounts(datedAttempts, todayStart);
  const maxCount = Math.max(1, ...dailyCounts.map((day) => day.count));
  bypassGraph.replaceChildren(
    ...dailyCounts.map((day) => createBypassGraphBar(day, maxCount)),
  );
}

function getDailyBypassCounts(
  attemptDates: Date[],
  todayStart: Date,
): DailyBypassCount[] {
  const days = Array.from({ length: TWO_WEEK_DAY_COUNT }, (_, index) => {
    const date = addDays(todayStart, index - (TWO_WEEK_DAY_COUNT - 1));
    return {
      key: formatLocalDateKey(date),
      label: formatDayLabel(date),
      displayLabel: formatDayDisplayLabel(date),
      count: 0,
    };
  });
  const daysByKey = new Map(days.map((day) => [day.key, day]));

  for (const date of attemptDates) {
    const day = daysByKey.get(formatLocalDateKey(date));
    if (day) {
      day.count += 1;
    }
  }

  return days;
}

function createBypassGraphBar(
  day: DailyBypassCount,
  maxCount: number,
): HTMLLIElement {
  const item = document.createElement("li");
  item.title = `${day.label}: ${formatBypassCount(day.count)}`;
  item.setAttribute("aria-label", item.title);

  const bar = document.createElement("span");
  bar.className = "bypass-graph-bar";
  bar.style.setProperty("--bar-height", `${(day.count / maxCount) * 100}%`);
  bar.style.setProperty("--bar-min-height", day.count > 0 ? "2px" : "0");

  const label = document.createElement("span");
  label.className = "bypass-graph-label";
  label.textContent = day.displayLabel;

  item.append(bar, label);
  return item;
}

function renderOutdoorPhoto(): void {
  const photo = selectOutdoorPhoto();
  outdoorPhoto.hidden = false;
  outdoorPhoto.alt = photo.alt;
  outdoorPhoto.src = photo.src;
  outdoorPhoto.addEventListener(
    "error",
    () => {
      outdoorPhoto.hidden = true;
    },
    { once: true },
  );
}

function renderBlockRequest(): void {
  siteName.textContent = site?.name ?? "";
  targetUrlElement.textContent = formatDisplayDomain(requestedUrl);
  bypassButton.hidden = false;
  bypassButton.setAttribute("aria-expanded", "false");
  reasonForm.hidden = true;
}

function renderInvalidRequest(): void {
  siteName.textContent = "Nothing to unblock";
  leadText.textContent = "No valid blocked URL was provided.";
  bypassButton.hidden = true;
  reasonForm.hidden = true;
}

function formatDisplayDomain(url: string): string {
  return getMainDomain(url) ?? "this site";
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
  renderOutdoorPhoto();
  siteName.textContent = "Could not load block page";
  leadText.textContent = "Refresh this tab or try opening the original URL again.";
  bypassButton.hidden = true;
  reasonForm.hidden = true;
  showAttemptsError("Could not load previous access reasons.");
  renderBypassStats([]);
  revealPage();
}

function showRefreshError(error: unknown): void {
  console.error("Failed to refresh block page", error);
  showAttemptsError("Could not refresh previous access reasons.");
}

function revealReasonForm(): void {
  bypassButton.hidden = true;
  bypassButton.setAttribute("aria-expanded", "true");
  reasonForm.hidden = false;
  showError("");
  reasonInput.focus();
}

function setSubmitting(isSubmitting: boolean): void {
  bypassButton.disabled = isSubmitting;
  continueButton.disabled = isSubmitting;
  reasonInput.disabled = isSubmitting;
  for (const input of durationInputs) {
    input.disabled = isSubmitting;
  }
}

function readSelectedDurationMinutes(): number | null {
  const selectedInput = durationInputs.find((input) => input.checked);
  const durationMinutes = Number(selectedInput?.value);

  return ALLOWED_BYPASS_DURATIONS_MINUTES.some(
    (allowedDuration) => allowedDuration === durationMinutes,
  )
    ? durationMinutes
    : null;
}

function selectOutdoorPhoto(): OutdoorPhoto {
  const lastPhotoId = readLastOutdoorPhotoId();
  const lastPhotoIndex = OUTDOOR_PHOTOS.findIndex(
    (photo) => photo.id === lastPhotoId,
  );
  const nextPhotoIndex =
    lastPhotoIndex >= 0
      ? (lastPhotoIndex + 1) % OUTDOOR_PHOTOS.length
      : randomIndex(OUTDOOR_PHOTOS.length);
  const photo = OUTDOOR_PHOTOS[nextPhotoIndex] ?? OUTDOOR_PHOTOS[0];

  writeLastOutdoorPhotoId(photo.id);
  return photo;
}

function readLastOutdoorPhotoId(): string | null {
  try {
    return window.localStorage.getItem(LAST_OUTDOOR_PHOTO_KEY);
  } catch {
    return null;
  }
}

function writeLastOutdoorPhotoId(photoId: string): void {
  try {
    window.localStorage.setItem(LAST_OUTDOOR_PHOTO_KEY, photoId);
  } catch {
    // The page can still show a fresh random photo when local storage is unavailable.
  }
}

function randomIndex(length: number): number {
  if (length <= 1) {
    return 0;
  }

  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % length;
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

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "numeric",
  });
}

function formatDayDisplayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
  });
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatBypassCount(count: number): string {
  return `${count} ${count === 1 ? "bypass" : "bypasses"}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function queryElement<TElement extends Element>(selector: string): TElement {
  const element = document.querySelector<TElement>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}
