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
  const BUTTON_PROPS = [
    "font-family", "font-size", "font-weight", "color",
    "background-color", "border", "border-radius", "padding", "margin"
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
    const buttonRef = document.querySelector("#gsc_bpf_more") || document.querySelector(".gsc_pgn button");

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
    if (buttonRef) copyComputedStyle(buttonRef, panel.querySelector(".sas-cit-load"), BUTTON_PROPS);

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
            <td class="sas-cit-head-cell">Corresponding</td>
            <td class="sas-cit-head-cell">Total</td>
          </tr>
          <tr>
            <td class="sas-cit-label">Papers</td>
            <td class="sas-cit-value" data-metric="rankedFirst"></td>
            <td class="sas-cit-value" data-metric="rankedLast"></td>
            <td class="sas-cit-value" data-metric="totalRows"></td>
          </tr>
          <tr>
            <td class="sas-cit-label">Citations</td>
            <td class="sas-cit-value" data-metric="firstAuthorCitations"></td>
            <td class="sas-cit-value" data-metric="correspondingCitations"></td>
            <td class="sas-cit-value" data-metric="totalCitations"></td>
          </tr>
          <tr>
            <td class="sas-cit-label">h-index</td>
            <td class="sas-cit-value" data-metric="firstAuthorHIndex"></td>
            <td class="sas-cit-value" data-metric="correspondingHIndex"></td>
            <td class="sas-cit-value" data-metric="totalHIndex"></td>
          </tr>
          <tr>
            <td class="sas-cit-label">i10-index</td>
            <td class="sas-cit-value" data-metric="firstAuthorH10Index"></td>
            <td class="sas-cit-value" data-metric="correspondingH10Index"></td>
            <td class="sas-cit-value" data-metric="totalH10Index"></td>
          </tr>
        </tbody>
      </table>
      <div class="sas-cit-status" id="sas-cit-status"></div>
      <button class="sas-cit-load" type="button" data-action="load-all">Load all</button>
    `;

    panel.addEventListener("click", (event) => {
      const action = event.target && event.target.dataset ? event.target.dataset.action : "";
      if (action === "load-all" && handlers.onLoadAll) {
        handlers.onLoadAll();
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

  function renderPanel(state) {
    ensurePanel(state.handlers || handlers);
    const stats = state.stats || {};

    panel.querySelectorAll(".sas-cit-value").forEach((cell) => {
      const value = stats[cell.dataset.metric];
      cell.textContent = value == null ? 0 : value;
    });

    const status = panel.querySelector("#sas-cit-status");
    const statusText = state.status || "";
    status.textContent = statusText;
    status.style.display = statusText ? "" : "none";

    const loadButton = panel.querySelector(".sas-cit-load");
    if (loadButton) {
      loadButton.disabled = Boolean(state.loadingAll);
    }

    adoptScholarStyles();
  }

  function setStatus(message) {
    if (!panel) return;
    const status = panel.querySelector("#sas-cit-status");
    if (!status) return;
    status.textContent = message || "";
    status.style.display = message ? "" : "none";
  }

  const api = {
    ensurePanel,
    renderPanel,
    setStatus,
    adoptScholarStyles
  };

  namespace.uiPanel = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
