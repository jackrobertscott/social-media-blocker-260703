import { getStorageValue, setStorageValue } from "./chrome.js";
import { SOCIAL_SITES, defaultSiteSettings } from "./sites.js";

export const STORAGE_KEY = "social-media-blocker-state-v1";
export const MAX_ATTEMPTS = 200;

export interface AccessAttempt {
  id: string;
  siteId: string;
  siteName: string;
  url: string;
  reason: string;
  createdAt: string;
}

export interface ExtensionState {
  globalEnabled: boolean;
  sites: Record<string, boolean>;
  attempts: AccessAttempt[];
}

export interface NewAccessAttempt {
  siteId: string;
  siteName: string;
  url: string;
  reason: string;
}

export async function getState(): Promise<ExtensionState> {
  const storedState = await getStorageValue<unknown>(STORAGE_KEY);
  return normaliseState(storedState);
}

export async function saveState(state: ExtensionState): Promise<void> {
  await setStorageValue({ [STORAGE_KEY]: normaliseState(state) });
}

export async function updateState(
  updater: (state: ExtensionState) => ExtensionState,
): Promise<ExtensionState> {
  const currentState = await getState();
  const nextState = normaliseState(updater(currentState));
  await saveState(nextState);
  return nextState;
}

export function createAccessAttempt(input: NewAccessAttempt): AccessAttempt {
  return {
    id: createId(),
    siteId: input.siteId,
    siteName: input.siteName,
    url: input.url,
    reason: input.reason,
    createdAt: new Date().toISOString(),
  };
}

export function normaliseState(value: unknown): ExtensionState {
  const raw = isRecord(value) ? value : {};
  const rawSites = isRecord(raw.sites) ? raw.sites : {};
  const defaultSites = defaultSiteSettings();
  const sites: Record<string, boolean> = {};

  for (const site of SOCIAL_SITES) {
    const storedSiteSetting = rawSites[site.id];
    sites[site.id] =
      typeof storedSiteSetting === "boolean"
        ? storedSiteSetting
        : defaultSites[site.id];
  }

  const attempts = Array.isArray(raw.attempts)
    ? raw.attempts.flatMap(normaliseAttempt).slice(0, MAX_ATTEMPTS)
    : [];

  return {
    globalEnabled:
      typeof raw.globalEnabled === "boolean" ? raw.globalEnabled : true,
    sites,
    attempts,
  };
}

function normaliseAttempt(value: unknown): AccessAttempt[] {
  if (!isRecord(value)) {
    return [];
  }

  if (
    typeof value.id !== "string" ||
    typeof value.siteId !== "string" ||
    typeof value.siteName !== "string" ||
    typeof value.url !== "string" ||
    typeof value.reason !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return [];
  }

  return [
    {
      id: value.id,
      siteId: value.siteId,
      siteName: value.siteName,
      url: value.url,
      reason: value.reason,
      createdAt: value.createdAt,
    },
  ];
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
