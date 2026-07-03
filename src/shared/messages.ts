export interface GrantAccessMessage {
  type: "grant-access";
  tabId: number;
  siteId: string;
  url: string;
  reason: string;
}

export type ExtensionMessage = GrantAccessMessage;

export type GrantAccessResponse =
  | { ok: true }
  | { ok: false; error: string };

export function isGrantAccessMessage(message: unknown): message is GrantAccessMessage {
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
    typeof candidate.reason === "string"
  );
}
