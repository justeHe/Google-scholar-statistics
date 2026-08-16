const assert = require("assert");

require("../src/shared/constants");
const statsEngine = require("../src/content/stats-engine");

function paper(id, citations, rankedFirst, rankedLast) {
  return {
    id,
    citations: String(citations),
    roles: { rankedFirst, rankedLast, matched: true }
  };
}

{
  assert.strictEqual(statsEngine.hIndex([10, 8, 5, 4, 3]), 4);
  assert.strictEqual(statsEngine.h10Index([12, 10, 9, 3]), 2);
  assert.strictEqual(statsEngine.citationNumber("1,234"), 1234);
}

{
  const records = [
    paper("a", 30, true, false),
    paper("b", 20, false, true),
    paper("c", 40, true, true), // 单作者论文：一作且尾作
    paper("d", 15, false, false)
  ];

  const stats = statsEngine.calculateStats(records);

  assert.strictEqual(stats.totalRows, 4);
  assert.strictEqual(stats.rankedFirst, 2);
  assert.strictEqual(stats.rankedLast, 2);

  // First
  assert.strictEqual(stats.firstAuthorCitations, 70); // 30 + 40
  assert.strictEqual(stats.firstAuthorHIndex, 2);
  assert.strictEqual(stats.firstAuthorH10Index, 2);

  // Corresponding (last author)
  assert.strictEqual(stats.correspondingCitations, 60); // 20 + 40
  assert.strictEqual(stats.correspondingHIndex, 2);

  // Total = all papers, matching Google's own Cited by / h-index / i10-index
  assert.strictEqual(stats.totalCitations, 105); // 30 + 20 + 40 + 15
  assert.strictEqual(stats.totalHIndex, 4);      // [40,30,20,15] -> h=4
  assert.strictEqual(stats.totalH10Index, 4);
}

console.log("stats-engine tests passed");
