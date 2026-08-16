(function bootstrapScholarAuthorStats(root) {
  const ns = root.ScholarAuthorStats || {};
  const storage = ns.storage;
  const scholarDom = ns.scholarDom;
  const matcher = ns.authorMatcher;
  const classifier = ns.roleClassifier;
  const statsEngine = ns.statsEngine;
  const detailFetcher = ns.detailFetcher;
  const loader = ns.showMoreLoader;
  const ui = ns.uiPanel;

  if (!storage || !scholarDom || !matcher || !classifier || !statsEngine || !detailFetcher || !loader || !ui) {
    console.warn("Scholar First/Corresponding Metrics failed to load required modules.");
    return;
  }

  const state = {
    settings: null,
    targetName: "",
    recordsById: new Map(),
    order: [],
    status: "",
    observer: null,
    scanTimer: null,
    detailPending: new Set(),
    loadingAll: false
  };

  function currentRecords() {
    return state.order
      .map((id) => state.recordsById.get(id))
      .filter(Boolean);
  }

  function detailNeeded(record) {
    if (!state.settings.detailFetchEnabled) return false;
    if (!record || !record.href || record.detail) return false;
    if ((record.authorsText || "").includes("...")) return true;
    if (!record.match) return true;
    return false;
  }

  function buildRecord(base, detail) {
    const authorsText = (detail && detail.authorsText) || base.authorsText || "";
    const authors = matcher.splitAuthors(authorsText);
    const authorsComplete = !String(base.authorsText || "").includes("...") || Boolean(detail && detail.authorsText);
    const match = matcher.findBestAuthorMatch(authors, state.targetName, state.settings.aliases);
    const roles = classifier.classifyRecord({ authors, match, authorsComplete });

    return Object.assign({}, base, {
      authorsText,
      authors,
      match,
      roles,
      detail: detail || base.detail || null,
      authorsComplete
    });
  }

  function refreshUi(status) {
    if (status !== undefined) state.status = status;
    const records = currentRecords();
    const stats = statsEngine.calculateStats(records);
    ui.renderPanel({
      status: state.status,
      stats,
      loadingAll: state.loadingAll,
      handlers: panelHandlers()
    });
    storage.saveLastSummary({
      targetName: state.targetName,
      status: state.status,
      stats,
      url: root.location ? root.location.href : "",
      updatedAt: Date.now()
    });
    root.__scholarAuthorStats = {
      targetName: state.targetName,
      status: state.status,
      stats,
      records
    };
    return stats;
  }

  async function fetchAndRebuild(record) {
    if (state.detailPending.has(record.id)) return;
    state.detailPending.add(record.id);
    try {
      const detail = await detailFetcher.fetchDetail(record, state.settings);
      if (detail) {
        const latest = state.recordsById.get(record.id) || record;
        state.recordsById.set(record.id, buildRecord(latest, detail));
      }
    } catch (error) {
      console.warn("Scholar First/Corresponding Metrics detail fetch failed:", error);
    } finally {
      state.detailPending.delete(record.id);
      refreshUi();
    }
  }

  async function scanPage() {
    state.targetName = scholarDom.getProfileName();
    if (!state.targetName) {
      refreshUi("");
      return currentRecords();
    }

    const baseRecords = scholarDom.parseVisiblePapers();
    state.order = baseRecords.map((record) => record.id);

    baseRecords.forEach((base) => {
      const existing = state.recordsById.get(base.id);
      const detail = existing ? existing.detail : null;
      const record = buildRecord(Object.assign({}, base, { detail }), detail);
      state.recordsById.set(base.id, record);
    });

    const records = currentRecords();
    refreshUi(`${records.length} papers`);

    records
      .filter((record) => detailNeeded(record))
      .forEach((record) => fetchAndRebuild(record));

    return records;
  }

  function debouncedScan() {
    if (state.scanTimer) root.clearTimeout(state.scanTimer);
    state.scanTimer = root.setTimeout(() => {
      scanPage();
    }, 250);
  }

  function observePaperChanges() {
    if (state.observer) state.observer.disconnect();
    const container = document.querySelector("#gsc_a_b") || document.body;
    state.observer = new MutationObserver((mutations) => {
      const changed = mutations.some((mutation) => mutation.type === "childList" && mutation.addedNodes.length > 0);
      if (changed) debouncedScan();
    });
    state.observer.observe(container, { childList: true, subtree: true });
  }

  async function loadAllAndScan() {
    if (state.loadingAll) return;
    state.loadingAll = true;
    refreshUi("Loading all papers…");
    try {
      await loader.loadAll({
        settleMs: 1000,
        onProgress(progress) {
          if (progress.status === "loading") {
            refreshUi(`Loading all papers (${progress.paperCount} papers)…`);
          }
          if (progress.status === "cancelled") refreshUi("");
          if (progress.status === "complete") refreshUi("");
        },
        async onAfterClick() {
          await scanPage();
        }
      });
    } finally {
      state.loadingAll = false;
    }
    await scanPage();
  }

  function panelHandlers() {
    return {
      onLoadAll: loadAllAndScan
    };
  }

  function installMessageListener() {
    if (!(root.chrome && chrome.runtime && chrome.runtime.onMessage)) return;
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const action = request && request.action;
      if (action === "getSummary") {
        const stats = statsEngine.calculateStats(currentRecords());
        sendResponse({ ok: true, targetName: state.targetName, status: state.status, stats });
        return false;
      }
      if (action === "scan") {
        scanPage().then(() => sendResponse({ ok: true }));
        return true;
      }
      if (action === "loadAll") {
        loadAllAndScan().then(() => sendResponse({ ok: true }));
        return true;
      }
      return false;
    });
  }

  async function initializeWhenReady() {
    if (!scholarDom.isScholarProfilePage()) {
      const readyObserver = new MutationObserver(() => {
        if (scholarDom.isScholarProfilePage()) {
          readyObserver.disconnect();
          initializeWhenReady();
        }
      });
      readyObserver.observe(document.body, { childList: true, subtree: true });
      return;
    }

    state.settings = await storage.getSettings();
    ui.ensurePanel(panelHandlers());
    installMessageListener();
    await scanPage();
    observePaperChanges();
    if (state.settings.autoLoadAll) {
      loadAllAndScan();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeWhenReady, { once: true });
  } else {
    initializeWhenReady();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
