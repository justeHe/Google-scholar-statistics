const assert = require("assert");

require("../src/shared/constants");
const matcher = require("../src/content/author-matcher");

{
  const authors = matcher.splitAuthors("San Zhang*, Li Wang, Ming Chen");
  assert.strictEqual(authors.length, 3);
  assert.strictEqual(authors[0].name, "san zhang");
}

{
  const authors = matcher.splitAuthors("S Zhang, Li Wang, Ming Chen");
  const match = matcher.findBestAuthorMatch(authors, "San Zhang", []);
  assert(match);
  assert.strictEqual(match.index, 0);
  assert.strictEqual(match.confidence, "medium");
}

{
  const authors = matcher.splitAuthors("Li Wang, San Zhang, Ming Chen");
  const match = matcher.findBestAuthorMatch(authors, "Zhang San", ["San Zhang"]);
  assert(match);
  assert.strictEqual(match.index, 1);
  assert.strictEqual(match.confidence, "exact");
}

{
  const authors = matcher.splitAuthors("张三, 李四, 王五");
  const match = matcher.findBestAuthorMatch(authors, "张三", []);
  assert(match);
  assert.strictEqual(match.index, 0);
  assert.strictEqual(match.confidence, "exact");
}

{
  const authors = matcher.splitAuthors("Li Wang, San Zhang, Ming Chen");
  const match = matcher.findBestAuthorMatch(authors, "Someone Else", []);
  assert.strictEqual(match, null);
}

console.log("author-matcher tests passed");
