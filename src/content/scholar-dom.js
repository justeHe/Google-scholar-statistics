(function attachScholarDom(root) {
  const namespace = root.ScholarAuthorStats || {};

  function textOf(node) {
    return node ? String(node.textContent || "").trim() : "";
  }

  function getProfileName() {
    const nameEl = document.querySelector("#gsc_prf_in");
    if (!nameEl) return "";

    // 只取 title 上方个人资料块里的主姓名：第一个直接文本节点（第一行），
    // 不并入 Other names、单位、邮箱等其他内容。
    const firstText = Array.from(nameEl.childNodes)
      .find((node) => node && node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (firstText) return firstText.textContent.trim();

    const firstLine = textOf(nameEl).split(/\n/)[0].trim();
    return firstLine;
  }

  function numberFromText(text) {
    const parsed = parseInt(String(text || "").replace(/[^\d]/g, ""), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * 读取 Google 自带的统计块 #gsc_rsb_st 里的 “Since YYYY” 数据：
   * 行 Citations / h-index / i10-index，每行两列（All / Since YYYY）。
   * 结构或语言对不上时返回 null（调用方回退到本地计算）。
   */
  function parseGoogleSinceStats() {
    const table = document.querySelector("#gsc_rsb_st");
    if (!table) return null;

    let sinceYear = 0;
    const yearMatch = textOf(table).match(/since\s+(\d{4})|(\d{4})\s*年以来|(\d{4})\s*年至今/i);
    if (yearMatch) {
      sinceYear = parseInt(yearMatch[1] || yearMatch[2] || yearMatch[3], 10);
    }

    const result = { sinceYear: sinceYear || 0, citations: null, hIndex: null, h10Index: null };
    table.querySelectorAll("tbody tr").forEach((row) => {
      const label = textOf(row.querySelector(".gsc_rsb_sc1") || row.children[0]).toLowerCase();
      if (!label) return;
      const cells = row.querySelectorAll(".gsc_rsb_std");
      const sinceValue = cells.length >= 2 ? numberFromText(textOf(cells[1])) : null;

      if (/citation|被引/.test(label)) result.citations = sinceValue;
      if (/h-index|hindex|h 指数|h指数/.test(label)) result.hIndex = sinceValue;
      if (/i10|i-10/.test(label)) result.h10Index = sinceValue;
    });

    if (result.citations === null && result.hIndex === null && result.h10Index === null) {
      return null;
    }
    return result;
  }

  function getPaperRows() {
    return Array.from(document.querySelectorAll(".gsc_a_tr"));
  }

  function getAuthorNode(row) {
    if (!row) return null;
    return row.querySelector(".gsc_a_t .gs_gray") || row.querySelector(".gs_gray");
  }

  function getAuthorsText(row) {
    const authorNode = getAuthorNode(row);
    if (!authorNode) return "";
    return (
      authorNode.getAttribute("title") ||
      authorNode.getAttribute("aria-label") ||
      textOf(authorNode)
    ).trim();
  }

  /**
   * 提取论文发表载体（期刊/会议名）。
   * 期刊名字通常在每一条的最后一行：取 .gsc_a_t 里最后一个 .gs_gray。
   */
  function getVenueText(row) {
    if (!row) return "";
    const grays = row.querySelectorAll(".gsc_a_t .gs_gray");
    const venueNode = grays[grays.length - 1];
    if (!venueNode) return "";
    let text = (venueNode.getAttribute("title") || textOf(venueNode)).trim();
    text = text
      .replace(/\s*,\s*\d{4}$/, "")
      .replace(/\s+\d{4}$/, "")
      .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
      .trim();
    return text;
  }

  function hashText(value) {
    const text = String(value || "");
    let hash = 5381;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) + hash) + text.charCodeAt(index);
      hash &= 0xffffffff;
    }
    return Math.abs(hash).toString(36);
  }

  function extractPaperId(href, title, year) {
    try {
      const url = new URL(href, root.location ? root.location.origin : "https://scholar.google.com");
      const citationId = url.searchParams.get("citation_for_view");
      if (citationId) return `scholar:${citationId}`;
      const cluster = url.searchParams.get("cluster");
      if (cluster) return `cluster:${cluster}`;
      return `url:${hashText(url.pathname + url.search)}`;
    } catch (error) {
      return `title:${hashText(`${title || ""}:${year || ""}`)}`;
    }
  }

  function parsePaperRow(row) {
    const titleAnchor = row.querySelector(".gsc_a_at");
    const title = textOf(titleAnchor) || textOf(row.querySelector(".gsc_a_t"));
    const rawHref = titleAnchor ? (titleAnchor.getAttribute("href") || titleAnchor.getAttribute("data-href") || "") : "";
    let href = "";
    if (rawHref) {
      try {
        href = new URL(rawHref, root.location ? root.location.origin : "https://scholar.google.com").toString();
      } catch (error) {
        href = rawHref;
      }
    }
    const year = textOf(row.querySelector(".gsc_a_y span")) || textOf(row.querySelector(".gsc_a_y"));
    const citationsText = textOf(row.querySelector(".gsc_a_ac"));
    const authorsText = getAuthorsText(row);
    const venue = getVenueText(row);
    // 载体行被省略号截断时，需要去详情页补全完整名称。
    const venueTruncated = /…|\.\.\./.test(venue);
    const id = extractPaperId(href || rawHref || title, title, year);

    return {
      id,
      title,
      href,
      year,
      citations: citationsText,
      authorsText,
      venue,
      venueTruncated,
      source: ["list"],
      // 保留行元素引用，供评级徽标注入使用。
      row
    };
  }

  function parseVisiblePapers() {
    return getPaperRows().map(parsePaperRow);
  }

  function isScholarProfilePage() {
    return Boolean(document.querySelector("#gsc_prf_w") || document.querySelector("#gsc_prf_in"));
  }

  function isClickable(element) {
    if (!element || element.disabled) return false;
    const style = root.getComputedStyle ? root.getComputedStyle(element) : null;
    if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) return false;
    const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { width: 1, height: 1 };
    return rect.width > 0 && rect.height > 0;
  }

  function findShowMoreButton() {
    const selectors = [
      "#gsc_bpf_more",
      "#gsc_pgn_pnx",
      ".gsc_pgn_pnx",
      ".gsc_pgn button",
      "button[onclick*='showMore']",
      "button[onclick*='bpf_more']"
    ];

    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (isClickable(button)) return button;
    }

    const labels = ["show more", "显示更多", "更多", "mostrar más", "更多结果"];
    return Array.from(document.querySelectorAll("button")).find((button) => {
      const text = textOf(button).toLowerCase();
      return labels.some((label) => text.includes(label)) && isClickable(button);
    }) || null;
  }

  // 卡片插到原有 “Citations” 统计块上方。
  function getPanelInsertionPoint() {
    return (
      document.querySelector("#gsc_rsb_cit") ||
      document.querySelector("#gsc_rsb_st") ||
      document.querySelector("#gsc_rsb") ||
      document.querySelector("#gsc_prf_w") ||
      document.querySelector("#gsc_a_tw")
    );
  }

  const api = {
    textOf,
    getProfileName,
    numberFromText,
    parseGoogleSinceStats,
    getPaperRows,
    getAuthorNode,
    getAuthorsText,
    getVenueText,
    hashText,
    extractPaperId,
    parsePaperRow,
    parseVisiblePapers,
    isScholarProfilePage,
    isClickable,
    findShowMoreButton,
    getPanelInsertionPoint
  };

  namespace.scholarDom = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
