(function optionsPage() {
  const ns = window.ScholarAuthorStats;
  const { DEFAULT_SETTINGS } = ns.constants;
  const storage = ns.storage;
  const form = document.getElementById("settings-form");
  const status = document.getElementById("status");

  const fields = {
    autoLoadAll: document.getElementById("autoLoadAll"),
    detailFetchEnabled: document.getElementById("detailFetchEnabled"),
    topJournalCriteria: document.getElementById("topJournalCriteria"),
    topJournalIncludeB: document.getElementById("topJournalIncludeB"),
    topConfIncludeB: document.getElementById("topConfIncludeB")
  };

  // 别名只做后台统计用、无 UI 入口：保存其他设置时原样保留已存别名。
  let currentAliases = [];

  function setStatus(text) {
    status.textContent = text;
    if (text) setTimeout(() => { status.textContent = ""; }, 1800);
  }

  function render(settings) {
    fields.autoLoadAll.checked = Boolean(settings.autoLoadAll);
    fields.detailFetchEnabled.checked = Boolean(settings.detailFetchEnabled);
    fields.topJournalCriteria.value = settings.topJournalCriteria || "scu";
    fields.topJournalIncludeB.checked = settings.topJournalIncludeB !== false;
    fields.topConfIncludeB.checked = Boolean(settings.topConfIncludeB);
  }

  function collect() {
    return Object.assign({}, DEFAULT_SETTINGS, {
      aliases: currentAliases,
      autoLoadAll: fields.autoLoadAll.checked,
      detailFetchEnabled: fields.detailFetchEnabled.checked,
      topJournalCriteria: fields.topJournalCriteria.value,
      topJournalIncludeB: fields.topJournalIncludeB.checked,
      topConfIncludeB: fields.topConfIncludeB.checked
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await storage.saveSettings(collect());
    setStatus("Saved");
  });

  document.getElementById("reset").addEventListener("click", async () => {
    await storage.saveSettings(DEFAULT_SETTINGS);
    render(DEFAULT_SETTINGS);
    setStatus("Defaults restored");
  });

  document.getElementById("clear-cache").addEventListener("click", async () => {
    await storage.clearPaperCache();
    setStatus("Cache cleared");
  });

  storage.getSettings().then((settings) => {
    currentAliases = (settings && settings.aliases) || [];
    render(settings);
  });
})();
