export interface GrantAccessMessage {
  type: "grant-access";
  tabId: number;
  siteId: string;
  url: string;
  reason: string;
  durationMinutes: number;
}

export interface SetGlobalBlockingMessage {
  type: "set-global-blocking";
  enabled: boolean;
}

export type ExtensionMessage = GrantAccessMessage | SetGlobalBlockingMessage;

export type GrantAccessResponse = ActionResponse;
export type SetGlobalBlockingResponse = ActionResponse;

type ActionResponse = { ok: true } | { ok: false; error: string };

export function isGrantAccessMessage(
  message: unknown,
): message is GrantAccessMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<GrantAccessMessage>;
  return (
    candidate.type === "grant-access" &&
    typeof candidate.tabId === "number" &&
    Number.isInteger(candidate.tabId) &&
    typeof candidate.siteId === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.reason === "string" &&
    isFiniteDuration(candidate.durationMinutes)
  );
}

export function isSetGlobalBlockingMessage(
  message: unknown,
): message is SetGlobalBlockingMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<SetGlobalBlockingMessage>;
  return (
    candidate.type === "set-global-blocking" &&
    typeof candidate.enabled === "boolean"
  );
}

function isFiniteDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
