(function popup() {
  const fields = {
    target: document.getElementById("target"),
    status: document.getElementById("status"),
    totalRows: document.getElementById("totalRows"),
    rankedFirst: document.getElementById("rankedFirst"),
    rankedLast: document.getElementById("rankedLast"),
    totalCitations: document.getElementById("totalCitations")
  };

  function setStatus(text) {
    fields.status.textContent = text;
  }

  function renderSummary(summary) {
    const stats = (summary && summary.stats) || {};
    fields.target.textContent = summary && summary.targetName ? `Target: ${summary.targetName}` : "Not on a Scholar profile page";
    fields.status.textContent = (summary && summary.status) || "Waiting for page response";
    fields.totalRows.textContent = stats.totalRows || 0;
    fields.rankedFirst.textContent = stats.rankedFirst || 0;
    fields.rankedLast.textContent = stats.rankedLast || 0;
    fields.totalCitations.textContent = stats.totalCitations || 0;
  }

  function queryTabs(queryInfo) {
    return new Promise((resolve) => {
      chrome.tabs.query(queryInfo, resolve);
    });
  }

  function sendMessage(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(response);
      });
    });
  }

  async function activeTab() {
    const tabs = await queryTabs({ active: true, currentWindow: true });
    return tabs[0];
  }

  async function send(action) {
    const tab = await activeTab();
    if (!tab || !tab.id) throw new Error("No active tab");
    return sendMessage(tab.id, { action });
  }

  async function refresh() {
    try {
      const response = await send("getSummary");
      renderSummary(response);
    } catch (error) {
      renderSummary(null);
      setStatus("Please open a Google Scholar profile page");
    }
  }

  document.querySelector(".actions").addEventListener("click", async (event) => {
    const action = event.target && event.target.dataset ? event.target.dataset.action : "";
    if (!action) return;
    if (action === "options") {
      chrome.runtime.openOptionsPage();
      return;
    }
    try {
      setStatus("Working…");
      await send(action);
      await refresh();
    } catch (error) {
      setStatus("Current page unavailable");
    }
  });

  refresh();
})();
