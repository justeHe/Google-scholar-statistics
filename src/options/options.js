(function optionsPage() {
  const ns = window.ScholarAuthorStats;
  const { DEFAULT_SETTINGS } = ns.constants;
  const storage = ns.storage;
  const form = document.getElementById("settings-form");
  const status = document.getElementById("status");

  const fields = {
    aliases: document.getElementById("aliases"),
    autoLoadAll: document.getElementById("autoLoadAll"),
    detailFetchEnabled: document.getElementById("detailFetchEnabled")
  };

  function splitLines(value) {
    return String(value || "")
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function setStatus(text) {
    status.textContent = text;
    if (text) setTimeout(() => { status.textContent = ""; }, 1800);
  }

  function render(settings) {
    fields.aliases.value = (settings.aliases || []).join("\n");
    fields.autoLoadAll.checked = Boolean(settings.autoLoadAll);
    fields.detailFetchEnabled.checked = Boolean(settings.detailFetchEnabled);
  }

  function collect() {
    return Object.assign({}, DEFAULT_SETTINGS, {
      aliases: splitLines(fields.aliases.value),
      autoLoadAll: fields.autoLoadAll.checked,
      detailFetchEnabled: fields.detailFetchEnabled.checked
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

  storage.getSettings().then(render);
})();
