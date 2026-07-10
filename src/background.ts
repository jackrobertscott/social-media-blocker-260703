import {
  getAllStorageValues,
  getStorageValue,
  getTab,
  queryTabs,
  removeStorageValue,
  setStorageValue,
  updateTab,
} from "./shared/chrome.js";
import { normaliseTemporaryDurationMinutes } from "./shared/durations.js";
import {
  isGrantAccessMessage,
  isPauseBlockingMessage,
  isSetGlobalBlockingMessage,
  type GrantAccessResponse,
  type PauseBlockingResponse,
  type SetGlobalBlockingResponse,
} from "./shared/messages.js";
import { findMatchingSite } from "./shared/sites.js";
import {
  MAX_ATTEMPTS,
  createAccessAttempt,
  getState,
  isBlockingEnabled,
  updateState,
} from "./shared/storage.js";

interface StoredGrant {
  siteId: string;
  expiresAt: number;
  grantId: string;
}

type ClearGrantResult = "cleared" | "missing" | "mismatched";

const MILLISECONDS_PER_MINUTE = 60_000;
const GRANT_STORAGE_KEY_PREFIX = "social-media-blocker-active-grant:";
const GRANT_EXPIRY_ALARM_PREFIX = "social-media-blocker-grant-expiry:";
const GLOBAL_DISABLE_EXPIRY_ALARM_PREFIX =
  "social-media-blocker-global-disable-expiry:";

void restoreExpiryAlarms().catch((error: unknown) => {
  console.error("Failed to restore expiry alarms", error);
});

chrome.runtime.onInstalled.addListener(() => {
  void updateState((state) => state).catch((error: unknown) => {
    console.error("Failed to initialise extension state", error);
  });

  void restoreExpiryAlarms().catch((error: unknown) => {
    console.error("Failed to restore expiry alarms", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  void restoreExpiryAlarms().catch((error: unknown) => {
    console.error("Failed to restore expiry alarms", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isGrantAccessMessage(message)) {
    void grantAccess(message)
      .then(() => {
        sendResponse({ ok: true } satisfies GrantAccessResponse);
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not grant access.",
        } satisfies GrantAccessResponse);
      });

    return true;
  }

  if (isPauseBlockingMessage(message)) {
    void pauseBlocking(message.durationMinutes)
      .then(() => {
        sendResponse({ ok: true } satisfies PauseBlockingResponse);
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not disable blocking.",
        } satisfies PauseBlockingResponse);
      });

    return true;
  }

  if (isSetGlobalBlockingMessage(message)) {
    void setGlobalBlocking(message.enabled)
      .then(() => {
        sendResponse({ ok: true } satisfies SetGlobalBlockingResponse);
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not update the blocking setting.",
        } satisfies SetGlobalBlockingResponse);
      });

    return true;
  }

  return false;
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  void handleMainFrameNavigation(details).catch((error: unknown) => {
    console.error("Failed to evaluate navigation", error);
  });
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  void handleMainFrameNavigation(details).catch((error: unknown) => {
    console.error("Failed to evaluate history navigation", error);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(GLOBAL_DISABLE_EXPIRY_ALARM_PREFIX)) {
    void enforceGlobalDisableExpiry().catch((error: unknown) => {
      console.error("Failed to re-enable blocking", error);
    });
    return;
  }

  const expiry = parseGrantExpiryAlarmName(alarm.name);
  if (expiry) {
    void enforceGrantExpiry(expiry.tabId, expiry.grantId).catch(
      (error: unknown) => {
        console.error("Failed to enforce grant expiry", error);
      },
    );
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearStoredGrant(tabId).catch((error: unknown) => {
    console.error("Failed to clear closed tab grant", error);
  });
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  void transferStoredGrant(removedTabId, addedTabId).catch((error: unknown) => {
    console.error("Failed to transfer replaced tab grant", error);
  });
});

interface MainFrameNavigationDetails {
  frameId: number;
  tabId: number;
  url: string;
}

async function handleMainFrameNavigation(
  details: MainFrameNavigationDetails,
): Promise<void> {
  if (details.frameId !== 0 || details.tabId < 0) {
    return;
  }

  const site = findMatchingSite(details.url);
  if (!site) {
    await clearStoredGrant(details.tabId);
    return;
  }

  const state = await getState();
  const siteIsEnabled = state.sites[site.id] ?? true;

  if (!isBlockingEnabled(state) || !siteIsEnabled) {
    if (!state.globalEnabled || !siteIsEnabled) {
      await clearStoredGrant(details.tabId);
    }
    return;
  }

  const grant = await getStoredGrant(details.tabId);
  if (grant?.siteId === site.id && grant.expiresAt > Date.now()) {
    return;
  }

  if (grant) {
    const clearResult = await clearStoredGrant(details.tabId, grant.grantId);
    if (clearResult === "mismatched") {
      return;
    }
  }

  await updateTab(details.tabId, {
    url: buildBlockPageUrl(details.url, site.id),
  });
}

async function pauseBlocking(durationMinutesValue: number): Promise<void> {
  const durationMinutes =
    normaliseTemporaryDurationMinutes(durationMinutesValue);
  if (!durationMinutes) {
    throw new Error("Choose a valid disable duration.");
  }

  const globalDisabledUntil =
    Date.now() + durationMinutes * MILLISECONDS_PER_MINUTE;

  let previousGlobalDisabledUntil: number | null = null;
  await updateState((state) => {
    previousGlobalDisabledUntil = state.globalDisabledUntil;
    return {
      ...state,
      globalDisabledUntil,
    };
  });

  try {
    await scheduleGlobalDisableExpiry(globalDisabledUntil);
  } catch (error) {
    await updateState((state) =>
      state.globalDisabledUntil === globalDisabledUntil
        ? {
            ...state,
            globalDisabledUntil: previousGlobalDisabledUntil,
          }
        : state,
    );
    throw error;
  }
}

async function setGlobalBlocking(enabled: boolean): Promise<void> {
  await updateState((state) => ({
    ...state,
    globalEnabled: enabled,
    globalDisabledUntil: null,
  }));

  if (enabled) {
    await enforceBlockingAcrossOpenTabs();
  }
}

async function grantAccess(message: {
  tabId: number;
  siteId: string;
  url: string;
  reason: string;
  durationMinutes: number;
}): Promise<void> {
  const durationMinutes = normaliseTemporaryDurationMinutes(
    message.durationMinutes,
  );
  if (!durationMinutes) {
    throw new Error("Choose a valid bypass duration.");
  }

  const reason = message.reason.trim();
  if (!reason) {
    throw new Error("Write a reason before continuing.");
  }

  const site = findMatchingSite(message.url);
  if (!site || site.id !== message.siteId) {
    throw new Error("This URL is not on the configured block list.");
  }

  await updateState((state) => ({
    ...state,
    attempts: [
      createAccessAttempt({
        siteId: site.id,
        siteName: site.name,
        url: message.url,
        reason,
      }),
      ...state.attempts,
    ].slice(0, MAX_ATTEMPTS),
  }));

  const grant: StoredGrant = {
    siteId: site.id,
    expiresAt: Date.now() + durationMinutes * MILLISECONDS_PER_MINUTE,
    grantId: createId(),
  };

  await setStoredGrant(message.tabId, grant);
  scheduleGrantExpiry(message.tabId, grant);
}

async function enforceGrantExpiry(
  tabId: number,
  grantId: string,
): Promise<void> {
  const grant = await getStoredGrant(tabId);
  if (!grant || grant.grantId !== grantId) {
    return;
  }

  if (grant.expiresAt > Date.now()) {
    scheduleGrantExpiry(tabId, grant);
    return;
  }

  const clearResult = await clearStoredGrant(tabId, grantId);
  if (clearResult !== "cleared") {
    return;
  }

  const tab = await getTab(tabId);
  const currentUrl = tab?.url;
  if (!currentUrl) {
    return;
  }

  const site = findMatchingSite(currentUrl);
  if (!site || site.id !== grant.siteId) {
    return;
  }

  const state = await getState();
  const siteIsEnabled = state.sites[site.id] ?? true;
  if (!isBlockingEnabled(state) || !siteIsEnabled) {
    return;
  }

  await updateTab(tabId, {
    url: buildBlockPageUrl(currentUrl, site.id),
  });
}

async function restoreExpiryAlarms(): Promise<void> {
  await Promise.all([restoreGrantAlarms(), restoreGlobalDisableAlarm()]);
}

async function restoreGlobalDisableAlarm(): Promise<void> {
  const state = await getState();
  const globalDisabledUntil = state.globalDisabledUntil;
  if (globalDisabledUntil === null) {
    return;
  }

  if (globalDisabledUntil > Date.now()) {
    await scheduleGlobalDisableExpiry(globalDisabledUntil);
    return;
  }

  await enforceGlobalDisableExpiry();
}

async function enforceGlobalDisableExpiry(): Promise<void> {
  const state = await getState();
  const expiredDisableUntil = state.globalDisabledUntil;
  if (expiredDisableUntil === null) {
    return;
  }

  if (expiredDisableUntil > Date.now()) {
    await scheduleGlobalDisableExpiry(expiredDisableUntil);
    return;
  }

  const nextState = await updateState((currentState) =>
    currentState.globalDisabledUntil === expiredDisableUntil
      ? { ...currentState, globalDisabledUntil: null }
      : currentState,
  );

  if (nextState.globalDisabledUntil !== null) {
    if (nextState.globalDisabledUntil > Date.now()) {
      await scheduleGlobalDisableExpiry(nextState.globalDisabledUntil);
    }
    return;
  }

  if (!isBlockingEnabled(nextState)) {
    return;
  }

  await enforceBlockingAcrossOpenTabs();
}

async function enforceBlockingAcrossOpenTabs(): Promise<void> {
  const tabs = await queryTabs({});

  await Promise.all(
    tabs.map(async (tab) => {
      if (
        typeof tab.id !== "number" ||
        !tab.url ||
        !findMatchingSite(tab.url)
      ) {
        return;
      }

      try {
        await handleMainFrameNavigation({
          frameId: 0,
          tabId: tab.id,
          url: tab.url,
        });
      } catch (error) {
        console.error(
          `Failed to re-evaluate tab ${tab.id} after blocking resumed`,
          error,
        );
      }
    }),
  );
}

async function scheduleGlobalDisableExpiry(
  globalDisabledUntil: number,
): Promise<void> {
  // Unique names prevent concurrent pause requests from overwriting the winning timer.
  await chrome.alarms.create(
    `${GLOBAL_DISABLE_EXPIRY_ALARM_PREFIX}${globalDisabledUntil}`,
    {
      when: globalDisabledUntil,
    },
  );
}

async function restoreGrantAlarms(): Promise<void> {
  const storedValues = await getAllStorageValues();

  await Promise.all(
    Object.entries(storedValues).map(async ([key, rawGrant]) => {
      const tabId = parseGrantStorageKey(key);
      const grant = normaliseStoredGrant(rawGrant);
      if (tabId === null || !grant) {
        return;
      }

      if (grant.expiresAt <= Date.now()) {
        await enforceGrantExpiry(tabId, grant.grantId);
        return;
      }

      scheduleGrantExpiry(tabId, grant);
    }),
  );
}

async function transferStoredGrant(
  removedTabId: number,
  addedTabId: number,
): Promise<void> {
  const grant = await getStoredGrant(removedTabId);
  if (!grant) {
    return;
  }

  const clearResult = await clearStoredGrant(removedTabId, grant.grantId);
  if (clearResult !== "cleared") {
    return;
  }

  await setStoredGrant(addedTabId, grant);
  scheduleGrantExpiry(addedTabId, grant);
}

async function getStoredGrant(tabId: number): Promise<StoredGrant | undefined> {
  const storedGrant = await getStorageValue<unknown>(
    buildGrantStorageKey(tabId),
  );
  return normaliseStoredGrant(storedGrant);
}

async function setStoredGrant(
  tabId: number,
  grant: StoredGrant,
): Promise<void> {
  const previousGrant = await getStoredGrant(tabId);
  if (previousGrant) {
    await clearGrantExpiryAlarm(tabId, previousGrant.grantId);
  }

  await setStorageValue({ [buildGrantStorageKey(tabId)]: grant });
}

async function clearStoredGrant(
  tabId: number,
  expectedGrantId?: string,
): Promise<ClearGrantResult> {
  const grant = await getStoredGrant(tabId);

  if (!grant) {
    return "missing";
  }

  if (expectedGrantId && grant.grantId !== expectedGrantId) {
    return "mismatched";
  }

  await removeStorageValue(buildGrantStorageKey(tabId));
  await clearGrantExpiryAlarm(tabId, grant.grantId);
  return "cleared";
}

function normaliseStoredGrant(value: unknown): StoredGrant | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { siteId, expiresAt, grantId } = value;
  if (
    typeof siteId !== "string" ||
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt) ||
    typeof grantId !== "string" ||
    !grantId
  ) {
    return undefined;
  }

  return { siteId, expiresAt, grantId };
}

function scheduleGrantExpiry(tabId: number, grant: StoredGrant): void {
  chrome.alarms.create(buildGrantExpiryAlarmName(tabId, grant.grantId), {
    when: grant.expiresAt,
  });
}

async function clearGrantExpiryAlarm(
  tabId: number,
  grantId: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.alarms.clear(buildGrantExpiryAlarmName(tabId, grantId), () => {
      const lastError = chrome.runtime.lastError;
      if (lastError?.message) {
        reject(new Error(lastError.message));
        return;
      }

      resolve();
    });
  });
}

function buildGrantStorageKey(tabId: number): string {
  return `${GRANT_STORAGE_KEY_PREFIX}${tabId}`;
}

function parseGrantStorageKey(key: string): number | null {
  if (!key.startsWith(GRANT_STORAGE_KEY_PREFIX)) {
    return null;
  }

  const tabId = Number(key.slice(GRANT_STORAGE_KEY_PREFIX.length));
  return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
}

function buildGrantExpiryAlarmName(tabId: number, grantId: string): string {
  return `${GRANT_EXPIRY_ALARM_PREFIX}${tabId}:${grantId}`;
}

function parseGrantExpiryAlarmName(
  alarmName: string,
): { tabId: number; grantId: string } | null {
  if (!alarmName.startsWith(GRANT_EXPIRY_ALARM_PREFIX)) {
    return null;
  }

  const rest = alarmName.slice(GRANT_EXPIRY_ALARM_PREFIX.length);
  const separatorIndex = rest.indexOf(":");
  if (separatorIndex < 1) {
    return null;
  }

  const tabId = Number(rest.slice(0, separatorIndex));
  const grantId = rest.slice(separatorIndex + 1);
  if (!Number.isInteger(tabId) || tabId < 0 || !grantId) {
    return null;
  }

  return { tabId, grantId };
}

function buildBlockPageUrl(targetUrl: string, siteId: string): string {
  const params = new URLSearchParams({ site: siteId, url: targetUrl });
  return chrome.runtime.getURL(`block.html?${params.toString()}`);
}

function createId(): string {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
