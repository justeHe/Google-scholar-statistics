(function attachScholarDom(root) {
  const namespace = root.ScholarAuthorStats || {};

  function textOf(node) {
    return node ? String(node.textContent || "").trim() : "";
  }

  function getProfileName() {
    const nameEl = document.querySelector("#gsc_prf_in");
    if (!nameEl) return "";

    // 优先取第一个文本节点 / 第一行，避免把单位、邮箱等信息并入姓名。
    const directText = Array.from(nameEl.childNodes)
      .filter((node) => node && node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .filter(Boolean)
      .join(" ");
    if (directText) return directText;

    const firstLine = textOf(nameEl).split(/\n/)[0].trim();
    return firstLine;
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
    const id = extractPaperId(href || rawHref || title, title, year);

    return {
      id,
      title,
      href,
      year,
      citations: citationsText,
      authorsText,
      source: ["list"]
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
    getPaperRows,
    getAuthorNode,
    getAuthorsText,
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
