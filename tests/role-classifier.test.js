const assert = require("assert");

const matcher = require("../src/content/author-matcher");
const classifier = require("../src/content/role-classifier");

function classify(authorsText, profileName, aliases, authorsComplete) {
  const authors = matcher.splitAuthors(authorsText);
  const match = matcher.findBestAuthorMatch(authors, profileName, aliases || []);
  return classifier.classifyRecord({
    authors,
    match,
    // 列表含 “…” 时视为不完整，除非显式传入补全状态
    authorsComplete: authorsComplete !== undefined ? authorsComplete : !authorsText.includes("...")
  });
}

{
  const roles = classify("San Zhang, Li Wang, Ming Chen", "San Zhang");
  assert.strictEqual(roles.rankedFirst, true);
  assert.strictEqual(roles.rankedLast, false);
}

{
  const roles = classify("Li Wang, Ming Chen, San Zhang", "San Zhang");
  assert.strictEqual(roles.rankedFirst, false);
  assert.strictEqual(roles.rankedLast, true);
}

{
  // 单作者论文：同时是一作和尾作
  const roles = classify("San Zhang", "San Zhang");
  assert.strictEqual(roles.rankedFirst, true);
  assert.strictEqual(roles.rankedLast, true);
}

{
  // 作者列表截断（…）时不能确认尾作
  const roles = classify("Li Wang, San Zhang, ...", "San Zhang");
  assert.strictEqual(roles.rankedFirst, false);
  assert.strictEqual(roles.rankedLast, false);
}

{
  // 截断但详情页补全后可以确认尾作
  const authors = matcher.splitAuthors("Li Wang, Ming Chen, San Zhang");
  const match = matcher.findBestAuthorMatch(authors, "San Zhang", []);
  const roles = classifier.classifyRecord({ authors, match, authorsComplete: true });
  assert.strictEqual(roles.rankedLast, true);
}

{
  // 未匹配到作者
  const roles = classify("Li Wang, Ming Chen", "San Zhang");
  assert.strictEqual(roles.rankedFirst, false);
  assert.strictEqual(roles.rankedLast, false);
  assert.strictEqual(roles.matched, false);
}

console.log("role-classifier tests passed");
