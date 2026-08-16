(function attachShowMoreLoader(root) {
  const namespace = root.ScholarAuthorStats || {};
  const scholarDom = namespace.scholarDom || {};

  let running = false;
  let cancelRequested = false;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clickElement(element) {
    try {
      element.click();
    } catch (error) {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
  }

  async function loadAll(options) {
    if (running) return { status: "already-running" };
    running = true;
    cancelRequested = false;

    const {
      maxClicks = 200,
      settleMs = 1600,
      onProgress,
      onAfterClick
    } = options || {};

    let clicks = 0;
    let stagnant = 0;
    let previousCount = scholarDom.getPaperRows ? scholarDom.getPaperRows().length : 0;

    while (!cancelRequested && clicks < maxClicks) {
      const button = scholarDom.findShowMoreButton ? scholarDom.findShowMoreButton() : null;
      if (!button) break;

      clicks += 1;
      if (onProgress) onProgress({ status: "loading", clicks, paperCount: previousCount });
      clickElement(button);
      await delay(settleMs);

      const nextCount = scholarDom.getPaperRows ? scholarDom.getPaperRows().length : previousCount;
      if (onAfterClick) await onAfterClick({ clicks, paperCount: nextCount });
      if (nextCount <= previousCount) {
        stagnant += 1;
      } else {
        stagnant = 0;
      }
      previousCount = nextCount;
      if (stagnant >= 3) break;
    }

    const status = cancelRequested ? "cancelled" : "complete";
    running = false;
    cancelRequested = false;
    if (onProgress) onProgress({ status, clicks, paperCount: previousCount });
    return { status, clicks, paperCount: previousCount };
  }

  function cancel() {
    cancelRequested = true;
  }

  function isRunning() {
    return running;
  }

  const api = {
    loadAll,
    cancel,
    isRunning
  };

  namespace.showMoreLoader = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
