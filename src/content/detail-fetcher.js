(function attachDetailFetcher(root) {
  const namespace = root.ScholarAuthorStats || {};
  const constants = namespace.constants || {};
  const storage = namespace.storage || {};
  const { DETAIL_FIELD_LABELS = {}, DEFAULT_SETTINGS = {} } = constants;

  const queue = [];
  let processing = false;
  let processedInBatch = 0;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function schedule(task, settings) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject, settings });
      processQueue();
    });
  }

  async function processQueue() {
    if (processing) return;
    processing = true;

    while (queue.length) {
      const item = queue.shift();
      const settings = Object.assign({}, DEFAULT_SETTINGS, item.settings || {});
      try {
        if (processedInBatch >= settings.requestBatchLimit) {
          await delay(settings.requestBatchCooldownMs);
          processedInBatch = 0;
        }
        const result = await item.task();
        processedInBatch += 1;
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
      await delay(settings.requestSpacingMs);
    }

    processing = false;
  }

  // 论文详情页（view_citation）与集群页（cluster）结构一致，
  // 都包含 .gs_scl 区块与 Authors 字段，这里只取完整作者列表。
  function parseDetailHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const fields = {};
    let authorsText = "";

    doc.querySelectorAll(".gs_scl").forEach((section) => {
      const field = section.querySelector(".gsc_oci_field");
      const value = section.querySelector(".gsc_oci_value");
      const label = field ? field.textContent.trim() : "";
      const text = value ? value.textContent.trim() : "";
      if (!label || !text) return;
      fields[label] = text;
      if (DETAIL_FIELD_LABELS.authors && DETAIL_FIELD_LABELS.authors.test(label)) {
        authorsText = text;
      }
    });

    if (!authorsText) {
      const guess = Array.from(doc.querySelectorAll(".gsc_oci_value"))
        .map((node) => node.textContent.trim())
        .find((text) => text.split(",").length >= 2 && /[A-Za-z\u3400-\u9fff]/.test(text));
      authorsText = guess || "";
    }

    return { authorsText, fields };
  }

  async function fetchDetail(record, settings) {
    const mergedSettings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    if (!record || !record.href || !mergedSettings.detailFetchEnabled) return null;

    if (storage.getCachedPaper) {
      const cached = await storage.getCachedPaper(record.id, mergedSettings);
      if (cached) return Object.assign({ fromCache: true }, cached);
    }

    return schedule(async () => {
      const response = await fetch(record.href, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Scholar detail request failed: ${response.status}`);
      }
      const html = await response.text();
      const detail = parseDetailHtml(html);
      if (storage.setCachedPaper) {
        await storage.setCachedPaper(record.id, detail);
      }
      return Object.assign({ fromCache: false }, detail);
    }, mergedSettings);
  }

  const api = {
    schedule,
    parseDetailHtml,
    fetchDetail
  };

  namespace.detailFetcher = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
