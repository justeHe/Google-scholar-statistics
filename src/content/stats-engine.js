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

  function roleLabel(record) {
    const first = Boolean(record.roles && record.roles.rankedFirst);
    const last = Boolean(record.roles && record.roles.rankedLast);
    if (first && last) return "both";
    if (first) return "first";
    if (last) return "corresponding";
    return "other";
  }

  // 按等级分桶：每个等级记 一作 / 通讯 / 总数 / 近五年（since）四个数。
  function gradeBreakdown(matchedVenues, gradeOf, sinceYear) {
    const counts = {};
    matchedVenues.forEach((record) => {
      const entry = record.venueMatch.match.entry;
      const grade = gradeOf(entry);
      if (!grade) return;
      const bucket = counts[grade] || (counts[grade] = { first: 0, corresponding: 0, total: 0, since: 0 });
      bucket.total += 1;
      if (record.roles && record.roles.rankedFirst) bucket.first += 1;
      if (record.roles && record.roles.rankedLast) bucket.corresponding += 1;
      const year = parseInt(String(record.year || ""), 10);
      if (!Number.isNaN(year) && year >= sinceYear) bucket.since += 1;
    });
    return counts;
  }

  function sinceYearOf(googleSince) {
    return (googleSince && googleSince.sinceYear) || new Date().getFullYear() - 5;
  }

  function calculateTopVenueStats(records, settings, googleSince) {
    const list = records || [];
    const matchedVenues = list.filter((record) => record.venueMatch && record.venueMatch.match);
    const sinceYear = sinceYearOf(googleSince);

    return {
      matchedVenues: matchedVenues.length,
      unmatchedVenues: list.length - matchedVenues.length,
      sinceYear,
      // 全部已匹配论文的等级明细（不分是否顶刊顶会）：
      // CCF 分级 A/B/C、中科院分区（SCI 分区）1-4、川大分级 A–E，
      // 每个等级带 first / corresponding / total / since。
      ccfGrades: gradeBreakdown(matchedVenues, (entry) => entry.f || "", sinceYear),
      sciZones: gradeBreakdown(matchedVenues, (entry) => entry.c || "", sinceYear),
      scuGrades: gradeBreakdown(matchedVenues, (entry) => entry.s || "", sinceYear)
    };
  }

  function calculateStats(records, googleSince) {
    const list = records || [];

    const rankedFirst = list.filter((record) => record.roles && record.roles.rankedFirst);
    // 尾作近似通讯作者，这一列对外显示为 “Corr.”。
    const corresponding = list.filter((record) => record.roles && record.roles.rankedLast);
    const matched = list.filter((record) => record.match);
    const detailFetched = list.filter((record) => record.detail && record.detail.authorsText);

    const firstMetric = metricOf(roleCitations(list, (record) => record.roles && record.roles.rankedFirst));
    const correspondingMetric = metricOf(roleCitations(list, (record) => record.roles && record.roles.rankedLast));
    // Total 列 = 全部论文，与 Google 自己的 Cited by / h-index / i10-index 一致。
    const totalMetric = metricOf(list.map((record) => citationNumber(record.citations)));

    // Since 列：Citations / h-index / i10-index 直接采用 Google 自带统计块
    // （#gsc_rsb_st）里的 Since YYYY 数值；Papers 行用本地近五年论文数。
    const sinceYear = sinceYearOf(googleSince);
    const recent = list.filter((record) => {
      const year = parseInt(String(record.year || ""), 10);
      return !Number.isNaN(year) && year >= sinceYear;
    });
    const sinceMetric = metricOf(recent.map((record) => citationNumber(record.citations)));

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
      sinceYear,
      sincePapers: recent.length,
      sinceCitations: googleSince && googleSince.citations != null ? googleSince.citations : sinceMetric.total,
      sinceHIndex: googleSince && googleSince.hIndex != null ? googleSince.hIndex : sinceMetric.h,
      sinceH10Index: googleSince && googleSince.h10Index != null ? googleSince.h10Index : sinceMetric.h10,
      totalCitations: totalMetric.total,
      totalHIndex: totalMetric.h,
      totalH10Index: totalMetric.h10
    };
  }

  // 一次算完：常规一作/通讯指标 + 评级明细（匹配结果就在论文记录上）。
  function calculateAllStats(records, settings, googleSince) {
    return Object.assign({}, calculateStats(records, googleSince), {
      topVenues: calculateTopVenueStats(records, settings, googleSince)
    });
  }

  const api = {
    citationNumber,
    hIndex,
    h10Index,
    roleCitations,
    metricOf,
    calculateStats,
    roleLabel,
    gradeBreakdown,
    calculateTopVenueStats,
    calculateAllStats
  };

  namespace.statsEngine = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
