chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.getPlatformInfo(() => {
    // Keeps the service worker intentionally light; page logic lives in content scripts.
  });
});
