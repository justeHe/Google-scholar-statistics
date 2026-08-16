(function bootstrapScholarAuthorStats(root) {
  const ns = root.ScholarAuthorStats || {};
  const storage = ns.storage;
  const scholarDom = ns.scholarDom;
  const matcher = ns.authorMatcher;
  const classifier = ns.roleClassifier;
  const statsEngine = ns.statsEngine;
  const detailFetcher = ns.detailFetcher;
  const loader = ns.showMoreLoader;
  const venueMatcher = ns.venueMatcher;
  const ui = ns.uiPanel;

  if (!storage || !scholarDom || !matcher || !classifier || !statsEngine || !detailFetcher || !loader || !venueMatcher || !ui) {
    console.warn("Scholar First/Corresponding Metrics failed to load required modules.");
    return;
  }

  const state = {
    settings: null,
    targetName: "",
    googleSince: null,
    recordsById: new Map(),
    order: [],
    status: "",
    observer: null,
    scanTimer: null,
    detailPending: new Set(),
    loadingAll: false,
    showTopVenues: false,
    topVenuesLoading: false,
    venueIndexPromise: null
  };

  function currentRecords() {
    return state.order
      .map((id) => state.recordsById.get(id))
      .filter(Boolean);
  }

  function detailNeeded(record) {
    if (!state.settings.detailFetchEnabled) return false;
    if (!record || !record.href || record.detail) return false;
    // 作者列表被省略号截断 → 详情页补全（通讯作者靠完整列表长度判断）。
    if ((record.authorsText || "").includes("...")) return true;
    // 载体行被省略号截断 → 详情页补全 Journal/Conference 字段。
    if (record.venueTruncated) return true;
    if (!record.match) return true;
    return false;
  }

  function buildRecord(base, detail) {
    const authorsText = (detail && detail.authorsText) || base.authorsText || "";
    const authors = matcher.splitAuthors(authorsText);
    const authorsComplete = !String(base.authorsText || "").includes("...") || Boolean(detail && detail.authorsText);
    // 别名仅用于后台匹配，不出现在任何 UI 上。
    const match = matcher.findBestAuthorMatch(authors, state.targetName, state.settings.aliases);
    const roles = classifier.classifyRecord({ authors, match, authorsComplete });

    // 载体被省略号截断时，用详情页的 Journal/Conference 字段补全并重新匹配。
    const venueTruncated = Boolean(base.venueTruncated);
    const venueFromDetail = Boolean(detail && detail.venueText && venueTruncated);
    const venue = venueFromDetail ? detail.venueText : base.venue;

    return Object.assign({}, base, {
      authorsText,
      authors,
      match,
      roles,
      detail: detail || base.detail || null,
      authorsComplete,
      venue,
      venueTruncated,
      venueFromDetail: venueFromDetail || Boolean(base.venueFromDetail),
      venueMatch: venueFromDetail ? undefined : base.venueMatch
    });
  }

  // 纯本地匹配：统计一作/通讯时顺带完成，未命中才重试。
  function applyVenueMatches(records) {
    if (!venueMatcher.isReady()) return;
    records.forEach((record) => {
      if (!record.venueMatch || !record.venueMatch.match) {
        record.venueMatch = venueMatcher.matchVenue(record.venue);
      }
    });
  }

  function refreshUi(status) {
    if (status !== undefined) state.status = status;
    const records = currentRecords();
    // 补全后的载体/新扫描的论文在这里顺带完成匹配（未命中才重试）。
    applyVenueMatches(records);
    const stats = statsEngine.calculateStats(records, state.googleSince);
    const topStats = venueMatcher.isReady()
      ? statsEngine.calculateTopVenueStats(records, state.settings, state.googleSince)
      : null;
    ui.renderVenueBadges(records);
    ui.renderPanel({
      status: state.status,
      stats,
      loadingAll: state.loadingAll,
      showTopVenues: state.showTopVenues,
      topVenuesLoading: state.topVenuesLoading,
      topStats,
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
      topStats,
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
    if (scholarDom.parseGoogleSinceStats) {
      state.googleSince = scholarDom.parseGoogleSinceStats();
    }
    if (!state.targetName) {
      refreshUi("");
      return currentRecords();
    }

    const baseRecords = scholarDom.parseVisiblePapers();
    state.order = baseRecords.map((record) => record.id);

    baseRecords.forEach((base) => {
      const existing = state.recordsById.get(base.id);
      const detail = existing ? existing.detail : null;
      const record = buildRecord(Object.assign({}, base, {
        detail,
        venueMatch: existing ? existing.venueMatch : undefined
      }), detail);
      state.recordsById.set(base.id, record);
    });

    const records = currentRecords();
    applyVenueMatches(records);
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

  function ensureVenueIndex() {
    if (!state.venueIndexPromise) {
      state.venueIndexPromise = venueMatcher.loadIndex().catch((error) => {
        state.venueIndexPromise = null;
        throw error;
      });
    }
    return state.venueIndexPromise;
  }

  async function toggleTopVenues() {
    state.showTopVenues = !state.showTopVenues;
    if (!state.showTopVenues) {
      refreshUi();
      return;
    }

    if (!venueMatcher.isReady()) {
      state.topVenuesLoading = true;
      refreshUi("Loading venue index…");
      try {
        await ensureVenueIndex();
        applyVenueMatches(currentRecords());
      } catch (error) {
        // 索引没找到就静默忽视：清掉加载状态即可，不报错、不打扰。
        state.topVenuesLoading = false;
        refreshUi("");
        return;
      }
      state.topVenuesLoading = false;
    }

    refreshUi();
  }

  function csvCell(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function downloadText(filename, text, mimeType) {
    const blob = new Blob(["\uFEFF", text], { type: mimeType || "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.documentElement.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function exportVenueCsv() {
    if (!venueMatcher.isReady()) {
      refreshUi("Loading venue index…");
      try {
        await ensureVenueIndex();
      } catch (error) {
        // 索引没找到就静默忽视。
        refreshUi("");
        return;
      }
    }

    const records = currentRecords();
    applyVenueMatches(records);
    const stats = statsEngine.calculateTopVenueStats(records, state.settings);

    const lines = [];
    lines.push("GROUP,GRADE,PAPERS");
    ["A", "B", "C"].forEach((grade) => {
      const bucket = (stats.ccfGrades && stats.ccfGrades[grade]) || null;
      lines.push(`CCF,${grade},${bucket ? bucket.total : 0}`);
    });
    ["1", "2", "3", "4"].forEach((zone) => {
      const bucket = (stats.sciZones && stats.sciZones[zone]) || null;
      lines.push(`SCI,${zone},${bucket ? bucket.total : 0}`);
    });
    ["A", "A-", "B", "C", "D", "E"].forEach((grade) => {
      const bucket = (stats.scuGrades && stats.scuGrades[grade]) || null;
      lines.push(`SCU,${grade},${bucket ? bucket.total : 0}`);
    });

    lines.push("");
    lines.push("TITLE,YEAR,CITATIONS,ROLE,VENUE,MATCHED,KIND,CCF,SCI_ZONE,SCU_GRADE,CONFIDENCE");
    records.forEach((record) => {
      const m = record.venueMatch && record.venueMatch.match;
      const entry = m ? m.entry : null;
      lines.push([
        record.title,
        record.year,
        statsEngine.citationNumber(record.citations),
        statsEngine.roleLabel(record),
        record.venue || "",
        entry ? entry.n : "",
        entry ? (entry.k === "c" ? "conference" : "journal") : "",
        entry && entry.f ? entry.f : "",
        entry && entry.c ? entry.c : "",
        entry && entry.s ? entry.s : "",
        m ? m.confidence : ""
      ].map(csvCell).join(","));
    });

    downloadText("scholar-venue-grades.csv", lines.join("\r\n"), "text/csv;charset=utf-8");
    refreshUi("Exported scholar-venue-grades.csv");
  }

  function panelHandlers() {
    return {
      onLoadAll: loadAllAndScan,
      onToggleTopVenues: toggleTopVenues,
      onExportVenues: exportVenueCsv
    };
  }

  function installMessageListener() {
    if (!(root.chrome && chrome.runtime && chrome.runtime.onMessage)) return;
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const action = request && request.action;
      if (action === "getSummary") {
        const stats = statsEngine.calculateStats(currentRecords(), state.googleSince);
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

    // 顶刊索引随页面初始化自动加载（本地资源，无网络请求），
    // 加载完成后立即补做本页论文的载体匹配。
    // 索引拿不到时静默忽视：常规一作/通讯统计不受影响。
    ensureVenueIndex()
      .then(() => {
        applyVenueMatches(currentRecords());
        refreshUi();
      })
      .catch(() => {});

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
