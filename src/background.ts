import { updateTab } from "./shared/chrome.js";
import { isGrantAccessMessage, type GrantAccessResponse } from "./shared/messages.js";
import { findMatchingSite } from "./shared/sites.js";
import {
  MAX_ATTEMPTS,
  createAccessAttempt,
  getState,
  updateState,
} from "./shared/storage.js";

interface SiteGrant {
  siteId: string;
  grantedAt: number;
}

const tabGrants = new Map<number, SiteGrant>();

chrome.runtime.onInstalled.addListener(() => {
  void updateState((state) => state).catch((error: unknown) => {
    console.error("Failed to initialise extension state", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  tabGrants.clear();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isGrantAccessMessage(message)) {
    return false;
  }

  void grantAccess(message)
    .then(() => {
      sendResponse({ ok: true } satisfies GrantAccessResponse);
    })
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Could not grant access.",
      } satisfies GrantAccessResponse);
    });

  return true;
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  void handleMainFrameNavigation(details).catch((error: unknown) => {
    console.error("Failed to evaluate navigation", error);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabGrants.delete(tabId);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  const grant = tabGrants.get(removedTabId);
  tabGrants.delete(removedTabId);

  if (grant) {
    tabGrants.set(addedTabId, grant);
  }
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
    tabGrants.delete(details.tabId);
    return;
  }

  const state = await getState();
  const siteIsEnabled = state.sites[site.id] ?? true;

  if (!state.globalEnabled || !siteIsEnabled) {
    tabGrants.delete(details.tabId);
    return;
  }

  const grant = tabGrants.get(details.tabId);
  if (grant?.siteId === site.id) {
    return;
  }

  tabGrants.delete(details.tabId);
  await updateTab(details.tabId, {
    url: buildBlockPageUrl(details.url, site.id),
  });
}

async function grantAccess(message: {
  tabId: number;
  siteId: string;
  url: string;
  reason: string;
}): Promise<void> {
  const reason = message.reason.trim();
  if (!reason) {
    throw new Error("Write a reason before continuing.");
  }

  const site = findMatchingSite(message.url);
  if (!site || site.id !== message.siteId) {
    throw new Error("This URL is not on the configured social media block list.");
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

  tabGrants.set(message.tabId, { siteId: site.id, grantedAt: Date.now() });
  await updateTab(message.tabId, { url: message.url });
}

function buildBlockPageUrl(targetUrl: string, siteId: string): string {
  const params = new URLSearchParams({ site: siteId, url: targetUrl });
  return chrome.runtime.getURL(`block.html?${params.toString()}`);
}
