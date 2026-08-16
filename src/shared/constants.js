(function attachConstants(root) {
  const namespace = root.ScholarAuthorStats || {};

  const DEFAULT_SETTINGS = {
    // 作者别名：仅后台统计匹配用，不在选项页提供 UI。
    aliases: [],
    detailFetchEnabled: true,
    autoLoadAll: false,
    requestSpacingMs: 180,
    requestBatchLimit: 10,
    requestBatchCooldownMs: 1200,
    cacheDurationMs: 30 * 24 * 60 * 60 * 1000,
    topJournalCriteria: "scu",
    topJournalIncludeB: true,
    topConfIncludeB: false
  };

  const STORAGE_KEYS = {
    settings: "scholarAuthorStats:settings",
    paperCache: "scholarAuthorStats:paperCache",
    lastSummary: "scholarAuthorStats:lastSummary"
  };

  const DETAIL_FIELD_LABELS = {
    authors: /author|作者|autores|autor|auteurs|autori|autoren|автор|авторы|著者/i,
    // 详情页里的载体字段（Journal / Conference / Book），供被省略号截断时补全。
    venue: /journal|conference|book|期刊|会议|图书|出版物/i,
    venueFallback: /publisher|出版社/i
  };

  const SCHOLAR_MATCHES = [
    "https://scholar.google.com/citations*",
    "https://scholar.google.com.hk/citations*",
    "https://scholar.google.com.tw/citations*",
    "https://scholar.google.com.sg/citations*",
    "https://scholar.google.co.jp/citations*",
    "https://scholar.google.co.kr/citations*",
    "https://scholar.google.co.uk/citations*",
    "https://scholar.google.co.in/citations*",
    "https://scholar.google.cn/citations*"
  ];

  const api = {
    DEFAULT_SETTINGS,
    STORAGE_KEYS,
    DETAIL_FIELD_LABELS,
    SCHOLAR_MATCHES
  };

  namespace.constants = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
