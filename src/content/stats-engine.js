(function attachStatsEngine(root) {
  const namespace = root.ScholarAuthorStats || {};

  function citationNumber(value) {
    const parsed = parseInt(String(value || "").replace(/[^\d]/g, ""), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function hIndex(citations) {
    const sorted = (citations || []).slice().sort((left, right) => right - left);
    let index = 0;
    while (index < sorted.length && sorted[index] >= index + 1) {
      index += 1;
    }
    return index;
  }

  function h10Index(citations) {
    return (citations || []).filter((count) => count >= 10).length;
  }

  function roleCitations(records, predicate) {
    return (records || [])
      .filter(predicate)
      .map((record) => citationNumber(record.citations));
  }

  function metricOf(citations) {
    return {
      total: (citations || []).reduce((sum, count) => sum + count, 0),
      h: hIndex(citations),
      h10: h10Index(citations)
    };
  }

  function calculateStats(records) {
    const list = records || [];

    const rankedFirst = list.filter((record) => record.roles && record.roles.rankedFirst);
    // 尾作近似通讯作者，这一列对外显示为 “Corresponding”。
    const corresponding = list.filter((record) => record.roles && record.roles.rankedLast);
    const matched = list.filter((record) => record.match);
    const detailFetched = list.filter((record) => record.detail && record.detail.authorsText);

    const firstMetric = metricOf(roleCitations(list, (record) => record.roles && record.roles.rankedFirst));
    const correspondingMetric = metricOf(roleCitations(list, (record) => record.roles && record.roles.rankedLast));
    // Total 列 = 全部论文，与 Google 自己的 Cited by / h-index / i10-index 一致。
    const totalMetric = metricOf(list.map((record) => citationNumber(record.citations)));

    return {
      totalRows: list.length,
      matched: matched.length,
      unmatched: list.length - matched.length,
      detailFetched: detailFetched.length,
      rankedFirst: rankedFirst.length,
      rankedLast: corresponding.length,
      firstAuthorCitations: firstMetric.total,
      firstAuthorHIndex: firstMetric.h,
      firstAuthorH10Index: firstMetric.h10,
      correspondingCitations: correspondingMetric.total,
      correspondingHIndex: correspondingMetric.h,
      correspondingH10Index: correspondingMetric.h10,
      totalCitations: totalMetric.total,
      totalHIndex: totalMetric.h,
      totalH10Index: totalMetric.h10
    };
  }

  const api = {
    citationNumber,
    hIndex,
    h10Index,
    roleCitations,
    metricOf,
    calculateStats
  };

  namespace.statsEngine = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
