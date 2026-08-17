(function attachUiPanel(root) {
  const namespace = root.ScholarAuthorStats || {};
  const scholarDom = namespace.scholarDom || {};

  let panel = null;
  let handlers = {};
  let styleAdopted = false;

  const BLOCK_PROPS = ["font-family", "font-size", "margin", "padding"];
  const TITLE_PROPS = [
    "font-family", "font-size", "font-weight", "color",
    "margin", "padding", "line-height", "text-align", "white-space"
  ];
  const TABLE_PROPS = [
    "font-family", "font-size", "color", "border-collapse",
    "border-spacing", "width", "margin", "padding", "border"
  ];
  const CELL_PROPS = [
    "font-family", "font-size", "font-weight", "color",
    "padding", "white-space", "line-height"
  ];

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function copyComputedStyle(source, target, properties) {
    if (!source || !target) return;
    const computed = root.getComputedStyle ? root.getComputedStyle(source) : null;
    if (!computed) return;
    properties.forEach((prop) => {
      const value = computed.getPropertyValue(prop);
      if (value) target.style.setProperty(prop, value);
    });
  }

  // 直接复制 Google Scholar 原生 “Citations” 块（以及 Show more 按钮）的
  // 计算样式到我们的卡片上，保证与页面风格一致。
  function adoptScholarStyles() {
    if (styleAdopted || !panel) return;

    const blockRef = document.querySelector("#gsc_rsb_cit") || document.querySelector("#gsc_rsb_st");
    const titleRef = document.querySelector("#gsc_rsb_cit h3");
    const tableRef = document.querySelector("#gsc_rsb_st");
    const labelRef = document.querySelector("#gsc_rsb_st .gsc_rsb_sc1");
    const valueRef = document.querySelector("#gsc_rsb_st .gsc_rsb_std");

    if (blockRef) copyComputedStyle(blockRef, panel, BLOCK_PROPS);
    if (titleRef) copyComputedStyle(titleRef, panel.querySelector(".sas-cit-title"), TITLE_PROPS);
    if (tableRef) copyComputedStyle(tableRef, panel.querySelector(".sas-cit-table"), TABLE_PROPS);
    if (labelRef) {
      panel.querySelectorAll(".sas-cit-label").forEach((cell) => {
        copyComputedStyle(labelRef, cell, CELL_PROPS);
      });
    }
    if (valueRef) {
      panel.querySelectorAll(".sas-cit-value, .sas-cit-head-cell").forEach((cell) => {
        copyComputedStyle(valueRef, cell, CELL_PROPS);
      });
    }
    // 操作按钮不再复制 Show more 的样式，保持我们自己的蓝色样式。

    // 卡片现在有四列，侧栏较窄：表头字号缩小、单元格内边距收紧。
    panel.querySelectorAll(".sas-cit-head-cell").forEach((cell) => {
      cell.style.setProperty("padding", "0 4px 2px");
      cell.style.setProperty("font-size", "11px");
    });
    panel.querySelectorAll(".sas-cit-value").forEach((cell) => {
      cell.style.setProperty("padding", "0 4px 4px");
    });

    styleAdopted = true;
  }

  function ensurePanel(nextHandlers) {
    handlers = nextHandlers || handlers || {};
    if (panel) return panel;

    panel = create("div", "sas-cit-block");
    panel.id = "sas-panel";
    panel.innerHTML = `
      <h3 class="sas-cit-title">First/corresponding metrics</h3>
      <table class="sas-cit-table">
        <tbody>
          <tr class="sas-cit-head">
            <td class="sas-cit-label"></td>
            <td class="sas-cit-head-cell">First</td>
            <td class="sas-cit-head-cell">Corr.</td>
            <td class="sas-cit-head-cell" data-since-header>Since</td>
            <td class="sas-cit-head-cell">Total</td>
          </tr>
          <tr>
            <td class="sas-cit-label">Papers</td>
            <td class="sas-cit-value" data-metric="rankedFirst"></td>
            <td class="sas-cit-value" data-metric="rankedLast"></td>
            <td class="sas-cit-value" data-metric="sincePapers"></td>
            <td class="sas-cit-value" data-metric="totalRows"></td>
          </tr>
          <tr>
            <td class="sas-cit-label">Citations</td>
            <td class="sas-cit-value" data-metric="firstAuthorCitations"></td>
            <td class="sas-cit-value" data-metric="correspondingCitations"></td>
            <td class="sas-cit-value" data-metric="sinceCitations"></td>
            <td class="sas-cit-value" data-metric="totalCitations"></td>
          </tr>
          <tr>
            <td class="sas-cit-label">h-index</td>
            <td class="sas-cit-value" data-metric="firstAuthorHIndex"></td>
            <td class="sas-cit-value" data-metric="correspondingHIndex"></td>
            <td class="sas-cit-value" data-metric="sinceHIndex"></td>
            <td class="sas-cit-value" data-metric="totalHIndex"></td>
          </tr>
          <tr>
            <td class="sas-cit-label">i10-index</td>
            <td class="sas-cit-value" data-metric="firstAuthorH10Index"></td>
            <td class="sas-cit-value" data-metric="correspondingH10Index"></td>
            <td class="sas-cit-value" data-metric="sinceH10Index"></td>
            <td class="sas-cit-value" data-metric="totalH10Index"></td>
          </tr>
        </tbody>
      </table>
      <div class="sas-cit-status" id="sas-cit-status"></div>
      <div class="sas-cit-actions">
        <button class="sas-cit-load" type="button" data-action="load-all">Load all</button>
        <button class="sas-cit-load" type="button" data-action="toggle-top-venues">Grades</button>
        <button class="sas-cit-load" type="button" data-action="export-venues">Export</button>
      </div>
      <div class="sas-top-venues" id="sas-top-venues" hidden>
        <div class="sas-cit-status" id="sas-top-detail"></div>
        <table class="sas-cit-table sas-break-table">
          <tbody>
            <tr class="sas-cit-head">
              <td class="sas-cit-label">Grades</td>
              <td class="sas-cit-head-cell">First</td>
              <td class="sas-cit-head-cell">Corr.</td>
              <td class="sas-cit-head-cell">Papers</td>
              <td class="sas-cit-head-cell" data-since-header>Since</td>
            </tr>
            <tr>
              <td class="sas-cit-label">CCF A</td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="A" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="A" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="A" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="A" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">CCF B</td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="B" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="B" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="B" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="B" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">CCF C</td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="C" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="C" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="C" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="ccf" data-grade="C" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">SCI 1区</td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="1" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="1" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="1" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="1" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">SCI 2区</td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="2" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="2" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="2" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="2" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">SCI 3区</td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="3" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="3" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="3" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="3" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">SCI 4区</td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="4" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="4" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="4" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="cas" data-grade="4" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">SCU A</td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="A" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="A" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="A" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="A" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">SCU A−</td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="A-" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="A-" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="A-" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="A-" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">SCU B</td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="B" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="B" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="B" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="B" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">SCU C</td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="C" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="C" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="C" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="C" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">SCU D</td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="D" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="D" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="D" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="D" data-role="since"></td>
            </tr>
            <tr>
              <td class="sas-cit-label">SCU E</td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="E" data-role="first"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="E" data-role="corresponding"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="E" data-role="total"></td>
              <td class="sas-cit-value sas-break-value" data-group="scu" data-grade="E" data-role="since"></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    panel.addEventListener("click", (event) => {
      const action = event.target && event.target.dataset ? event.target.dataset.action : "";
      if (action === "load-all" && handlers.onLoadAll) {
        handlers.onLoadAll();
      }
      if (action === "toggle-top-venues" && handlers.onToggleTopVenues) {
        handlers.onToggleTopVenues();
      }
      if (action === "export-venues" && handlers.onExportVenues) {
        handlers.onExportVenues();
      }
    });

    // 放在原有 Citations 统计块上方。
    const insertionPoint = scholarDom.getPanelInsertionPoint ? scholarDom.getPanelInsertionPoint() : null;
    if (insertionPoint && insertionPoint.parentNode) {
      insertionPoint.parentNode.insertBefore(panel, insertionPoint);
    } else {
      document.body.prepend(panel);
    }

    return panel;
  }

  function renderTopVenues(state) {
    const section = panel.querySelector("#sas-top-venues");
    const toggle = panel.querySelector('[data-action="toggle-top-venues"]');
    if (!section) return;

    section.hidden = !state.showTopVenues;
    if (toggle) {
      toggle.textContent = state.showTopVenues ? "Hide grades" : "Grades";
      toggle.disabled = Boolean(state.topVenuesLoading);
    }
    if (!state.showTopVenues) return;

    const topStats = state.topStats || {};

    section.querySelectorAll(".sas-break-value").forEach((cell) => {
      const group = cell.dataset.group;
      const grade = cell.dataset.grade;
      const role = cell.dataset.role || "total";
      const source = group === "ccf"
        ? topStats.ccfGrades
        : group === "cas" ? topStats.sciZones : topStats.scuGrades;
      const bucket = (source && source[grade]) || null;
      cell.textContent = bucket ? (bucket[role] || 0) : 0;
    });

    const detail = section.querySelector("#sas-top-detail");
    if (detail) {
      if (state.topVenuesLoading) {
        detail.textContent = state.status || "Loading venue index…";
        detail.style.display = "";
        return;
      }
      const parts = [];
      if (topStats.matchedVenues) parts.push(`${topStats.matchedVenues} matched`);
      if (topStats.unmatchedVenues) parts.push(`${topStats.unmatchedVenues} unmatched`);
      const text = parts.join(" · ");
      detail.textContent = text;
      detail.style.display = text ? "" : "none";
    }
  }

  function renderPanel(state) {
    ensurePanel(state.handlers || handlers);
    const stats = state.stats || {};

    // Since 列表头显示具体年份（主卡片与 Grades 表共用）。
    if (stats.sinceYear) {
      panel.querySelectorAll("[data-since-header]").forEach((cell) => {
        cell.textContent = `Since ${stats.sinceYear}`;
      });
    }

    panel.querySelectorAll(".sas-cit-value[data-metric]").forEach((cell) => {
      const value = stats[cell.dataset.metric];
      cell.textContent = value == null ? 0 : value;
    });

    const status = panel.querySelector("#sas-cit-status");
    const statusText = state.status || "";
    status.textContent = statusText;
    status.style.display = statusText ? "" : "none";

    const loadButton = panel.querySelector('[data-action="load-all"]');
    if (loadButton) {
      loadButton.disabled = Boolean(state.loadingAll);
    }

    renderTopVenues(state);

    adoptScholarStyles();
  }

  function setStatus(message) {
    if (!panel) return;
    const status = panel.querySelector("#sas-cit-status");
    if (!status) return;
    status.textContent = message || "";
    status.style.display = message ? "" : "none";
  }

  // 等级配色：CCF A、SCI 1 区、川大 A/A−/B 归为“顶级”共用一种颜色，
  // 其余按等级依次递减。所有徽章尺寸统一，只有颜色随等级变化。
  const BADGE_GROUPS = [
    {
      field: "f",
      label: "CCF",
      suffix: "",
      tierOf: (value) => (value === "A" ? "top" : value === "B" ? "mid" : "low")
    },
    {
      field: "c",
      label: "SCI",
      suffix: "区",
      tierOf: (value) => (value === "1" ? "top" : value === "2" ? "mid" : value === "3" ? "low" : "lowest")
    },
    {
      field: "s",
      label: "SCU",
      suffix: "",
      tierOf: (value) => (
        value === "A" || value === "A-" || value === "B"
          ? "top"
          : value === "C" ? "mid" : value === "D" ? "low" : "lowest"
      )
    }
  ];

  function venueBadgeParts(entry) {
    if (!entry) return [];
    return BADGE_GROUPS
      .filter((group) => entry[group.field])
      .map((group) => ({
        text: `${group.label} ${entry[group.field]}${group.suffix || ""}`,
        cls: `sas-tier-${group.tierOf(entry[group.field])}`
      }));
  }

  // 把每篇论文的评级（CCF / SCI / 川大）徽标注入到标题下一行；没有评级的忽略。
  // 悬浮徽标用纯 CSS 提示框显示数据库里的完整名称（全称，附简称），不加任何事件监听。
  function renderVenueBadges(records) {
    (records || []).forEach((record) => {
      const row = record.row;
      if (!row || !row.querySelector) return;

      const m = record.venueMatch && record.venueMatch.match;
      const entry = m ? m.entry : null;
      const parts = venueBadgeParts(entry);
      const signature = parts.map((part) => `${part.text}:${part.cls}`).join("|");

      let badge = row.querySelector(".sas-venue-badge");
      if (!parts.length) {
        if (badge) badge.remove();
        return;
      }

      if (!badge) {
        badge = document.createElement("div");
        badge.className = "sas-venue-badge";
        // 插在标题链接之后（标题下一行），而不是条目最后一行。
        const titleAnchor = row.querySelector(".gsc_a_at");
        const cell = row.querySelector(".gsc_a_t") || row;
        if (titleAnchor && titleAnchor.parentNode === cell) {
          cell.insertBefore(badge, titleAnchor.nextSibling);
        } else {
          cell.appendChild(badge);
        }
      }

      // 与上一次一致就不动 DOM，避免反复触发页面监听/重扫。
      if (badge.dataset.sig === signature) return;
      badge.dataset.sig = signature;
      // 悬浮提示：带 CCF 评级的期刊显示 CCF 简称，其余显示库内简称。
      const abbr = entry && entry.k === "j" && entry.f && entry.ca ? entry.ca : (entry && entry.a) || "";
      badge.dataset.title = entry ? `${entry.n}${abbr ? " (" + abbr + ")" : ""}` : "";
      badge.textContent = "";
      parts.forEach((part) => {
        const chip = document.createElement("span");
        chip.className = `sas-badge-chip ${part.cls}`;
        chip.textContent = part.text;
        badge.appendChild(chip);
      });
    });
  }

  const api = {
    ensurePanel,
    renderPanel,
    setStatus,
    adoptScholarStyles,
    renderVenueBadges
  };

  namespace.uiPanel = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
