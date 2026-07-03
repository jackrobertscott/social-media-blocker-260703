function chromeError(): Error | undefined {
  const lastError = chrome.runtime.lastError;
  return lastError?.message ? new Error(lastError.message) : undefined;
}

export function getStorageValue<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (items) => {
      const error = chromeError();
      if (error) {
        reject(error);
        return;
      }

      resolve(items[key] as T | undefined);
    });
  });
}

export function setStorageValue(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const error = chromeError();
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
  return new Promise((resolve, reject) => {
    chrome.tabs.getCurrent((tab) => {
      const error = chromeError();
      if (error) {
        reject(error);
        return;
      }

      resolve(tab);
    });
  });
}

export function updateTab(
  tabId: number,
  updateProperties: chrome.tabs.UpdateProperties,
): Promise<chrome.tabs.Tab | undefined> {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      const error = chromeError();
      if (error) {
        reject(error);
        return;
      }

      resolve(tab);
    });
  });
}

export function sendRuntimeMessage<TResponse>(message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: TResponse) => {
      const error = chromeError();
      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    });
  });
}
