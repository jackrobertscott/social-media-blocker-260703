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

export function getAllStorageValues(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (items) => {
      const error = chromeError();
      if (error) {
        reject(error);
        return;
      }

      resolve(items);
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

export function removeStorageValue(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(key, () => {
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

export function queryTabs(
  queryInfo: chrome.tabs.QueryInfo,
): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chromeError();
      if (error) {
        reject(error);
        return;
      }

      resolve(tabs);
    });
  });
}

export function getTab(tabId: number): Promise<chrome.tabs.Tab | undefined> {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const error = chromeError();
      if (error) {
        if (/No tab with id/i.test(error.message)) {
          resolve(undefined);
          return;
        }

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

export function sendRuntimeMessage<TResponse>(
  message: unknown,
): Promise<TResponse> {
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
