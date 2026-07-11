import { getStorageValue, setStorageValue } from "./chrome.js";
import { BLOCKED_SITES, defaultSiteSettings } from "./sites.js";

export const STORAGE_KEY = "social-media-blocker-state-v1";
export const MAX_ATTEMPTS = 200;

const STATE_LOCK_NAME = `${STORAGE_KEY}:write`;
const STATE_LOCK_WAIT_TIMEOUT_MILLISECONDS = 5_000;
let fallbackStateOperation: Promise<void> = Promise.resolve();

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
  globalDisabledUntil: number | null;
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
  await withStateWriteLock(async () => {
    await writeState(state);
  });
}

export async function updateState(
  updater: (state: ExtensionState) => ExtensionState,
): Promise<ExtensionState> {
  return withStateWriteLock(async () => {
    const currentState = await getState();
    const nextState = normaliseState(updater(currentState));
    await writeState(nextState);
    return nextState;
  });
}

async function writeState(state: ExtensionState): Promise<void> {
  await setStorageValue({ [STORAGE_KEY]: normaliseState(state) });
}

async function withStateWriteLock<TResult>(
  operation: () => Promise<TResult>,
): Promise<TResult> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    const abortController = new AbortController();
    let lockWasAcquired = false;
    const timeoutId = setTimeout(() => {
      if (!lockWasAcquired) {
        abortController.abort();
      }
    }, STATE_LOCK_WAIT_TIMEOUT_MILLISECONDS);

    try {
      return await navigator.locks.request(
        STATE_LOCK_NAME,
        { signal: abortController.signal },
        async () => {
          lockWasAcquired = true;
          clearTimeout(timeoutId);
          return operation();
        },
      );
    } catch (error) {
      if (abortController.signal.aborted && !lockWasAcquired) {
        throw new Error("The blocker settings are busy. Please try again.", {
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const result = fallbackStateOperation.then(operation, operation);
  fallbackStateOperation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function getActiveGlobalDisableUntil(
  state: ExtensionState,
  now = Date.now(),
): number | null {
  return state.globalDisabledUntil !== null && state.globalDisabledUntil > now
    ? state.globalDisabledUntil
    : null;
}

export function isBlockingEnabled(
  state: ExtensionState,
  now = Date.now(),
): boolean {
  return (
    state.globalEnabled && getActiveGlobalDisableUntil(state, now) === null
  );
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

  for (const site of BLOCKED_SITES) {
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
    globalDisabledUntil: normaliseGlobalDisabledUntil(raw.globalDisabledUntil),
    sites,
    attempts,
  };
}

function normaliseGlobalDisabledUntil(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
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
