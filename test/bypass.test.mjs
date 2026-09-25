import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const values = {};
let onMessage;
const event = (onAdd) => ({ addListener: (listener) => onAdd?.(listener) });

globalThis.chrome = {
  runtime: {
    lastError: undefined,
    onMessage: event((listener) => { onMessage = listener; }),
    onInstalled: event(),
    onStartup: event(),
  },
  storage: {
    local: {
      get(key, callback) {
        callback(key === null ? { ...values } : { [key]: values[key] });
      },
      set(items, callback) { Object.assign(values, items); callback(); },
      remove(key, callback) { delete values[key]; callback(); },
    },
  },
  alarms: { onAlarm: event(), create() {} },
  webNavigation: { onBeforeNavigate: event(), onHistoryStateUpdated: event() },
  tabs: { onRemoved: event(), onReplaced: event() },
};

const built = (path) => import(pathToFileURL(join(process.env.TEST_BUILD_DIR, path)));
const { isGrantAccessMessage } = await built("shared/messages.js");
const { STORAGE_KEY, normaliseState, getState } = await built("shared/storage.js");
await built("background.js");

const grantMessage = {
  type: "grant-access",
  tabId: 42,
  siteId: "instagram",
  url: "https://www.instagram.com/",
  durationMinutes: 15,
};

test("grant messages need no text, while duration and URL still matter", () => {
  assert.equal(isGrantAccessMessage(grantMessage), true);
  assert.equal(isGrantAccessMessage({ ...grantMessage, durationMinutes: NaN }), false);
});

test("existing bypass history survives but previously saved text is dropped", async () => {
  values[STORAGE_KEY] = {
    globalEnabled: true,
    sites: { instagram: false },
    attempts: [{
      id: "old", siteId: "instagram", siteName: "Instagram",
      url: grantMessage.url, createdAt: "2026-07-01T12:00:00.000Z",
      reason: "old private text",
    }],
  };
  const state = normaliseState(values[STORAGE_KEY]);
  assert.equal(state.sites.instagram, false);
  assert.deepEqual(state.attempts, [{
    id: "old", siteId: "instagram", siteName: "Instagram",
    url: grantMessage.url, createdAt: "2026-07-01T12:00:00.000Z",
  }]);
  // On extension update, onInstalled calls updateState and rewrites this normalised state.
  const { updateState } = await built("shared/storage.js");
  await updateState((current) => current);
  assert.equal(JSON.stringify(values[STORAGE_KEY]).includes("old private text"), false);
});

test("background grants a timed bypass without recording text", async () => {
  const response = await new Promise((resolve) => {
    assert.equal(onMessage(grantMessage, {}, resolve), true);
  });
  assert.deepEqual(response, { ok: true });
  const state = await getState();
  assert.equal(state.attempts[0].siteId, "instagram");
  assert.equal(state.attempts[0].url, grantMessage.url);
  assert.equal(Object.hasOwn(state.attempts[0], "reason"), false);
  assert.equal(JSON.stringify(values[STORAGE_KEY]).includes("old private text"), false);
  assert.equal(values["social-media-blocker-active-grant:42"].siteId, "instagram");
});
