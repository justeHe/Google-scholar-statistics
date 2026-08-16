(function attachStorage(root) {
  const namespace = root.ScholarAuthorStats || {};
  const constants = namespace.constants || (typeof require !== "undefined" ? require("./constants") : {});
  const { DEFAULT_SETTINGS = {}, STORAGE_KEYS = {} } = constants;
  const memoryStore = {};

  function hasChromeStorage() {
    return Boolean(root.chrome && chrome.storage && chrome.storage.local);
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function mergeSettings(settings) {
    return Object.assign({}, DEFAULT_SETTINGS, settings || {});
  }

  function storageGet(keys) {
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.warn("Scholar Author Stats storage get failed:", chrome.runtime.lastError);
            resolve({});
            return;
          }
          resolve(result || {});
        });
      });
    }

    const selected = {};
    const requested = Array.isArray(keys) ? keys : [keys];
    requested.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(memoryStore, key)) {
        selected[key] = clone(memoryStore[key]);
      }
    });
    return Promise.resolve(selected);
  }

  function storageSet(values) {
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.set(values, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.warn("Scholar Author Stats storage set failed:", chrome.runtime.lastError);
          }
          resolve();
        });
      });
    }

    Object.keys(values).forEach((key) => {
      memoryStore[key] = clone(values[key]);
    });
    return Promise.resolve();
  }

  async function getSettings() {
    const result = await storageGet(STORAGE_KEYS.settings);
    return mergeSettings(result[STORAGE_KEYS.settings]);
  }

  async function saveSettings(settings) {
    await storageSet({
      [STORAGE_KEYS.settings]: mergeSettings(settings)
    });
  }

  async function getPaperCache() {
    const result = await storageGet(STORAGE_KEYS.paperCache);
    return result[STORAGE_KEYS.paperCache] || {};
  }

  async function getCachedPaper(paperId, settings) {
    if (!paperId) return null;
    const cache = await getPaperCache();
    const entry = cache[paperId];
    if (!entry) return null;
    const cacheDurationMs = (settings && settings.cacheDurationMs) || DEFAULT_SETTINGS.cacheDurationMs;
    if (Date.now() - (entry.fetchedAt || 0) > cacheDurationMs) {
      delete cache[paperId];
      await storageSet({ [STORAGE_KEYS.paperCache]: cache });
      return null;
    }
    return entry;
  }

  async function setCachedPaper(paperId, value) {
    if (!paperId || !value) return;
    const cache = await getPaperCache();
    cache[paperId] = Object.assign({}, value, { fetchedAt: Date.now() });
    await storageSet({ [STORAGE_KEYS.paperCache]: cache });
  }

  async function clearPaperCache() {
    await storageSet({ [STORAGE_KEYS.paperCache]: {} });
  }

  async function saveLastSummary(summary) {
    await storageSet({ [STORAGE_KEYS.lastSummary]: summary || null });
  }

  async function getLastSummary() {
    const result = await storageGet(STORAGE_KEYS.lastSummary);
    return result[STORAGE_KEYS.lastSummary] || null;
  }

  const api = {
    storageGet,
    storageSet,
    getSettings,
    saveSettings,
    getPaperCache,
    getCachedPaper,
    setCachedPaper,
    clearPaperCache,
    saveLastSummary,
    getLastSummary,
    mergeSettings
  };

  namespace.storage = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
