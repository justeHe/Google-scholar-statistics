/**
 * 完全离线的本地匹配测试：读取 tests/fixtures/<userId>/ 里保存的页面 HTML，
 * 解析论文列表，用本地 venue 匹配（不发起任何网络请求），输出匹配报告。
 *
 * 用法：node scripts/match-fixture.js [userId]
 */

const fs = require("fs");
const path = require("path");

const parser = require("./profile-parser");
const matcher = require("../src/content/venue-matcher");
const index = require("../data/dist/venue-index.json");

matcher.setIndex(index);

function main() {
  const userId = process.argv[2] || "c2fckoYAAAAJ";
  const dir = path.resolve("tests/fixtures", userId);

  if (!fs.existsSync(dir)) {
    console.error(`未找到抓取目录：${dir}`);
    console.error("请先运行：npm run fetch:profile -- " + userId);
    process.exit(1);
  }

  const pages = fs.readdirSync(dir).filter((file) => /^page-.*\.html$/.test(file)).sort();
  if (!pages.length) {
    console.error(`${dir} 里没有 page-*.html，请先运行 npm run fetch:profile`);
    process.exit(1);
  }

  let papers = [];
  pages.forEach((file) => {
    const html = fs.readFileSync(path.join(dir, file), "utf8");
    papers = papers.concat(parser.parseProfileHtml(html));
  });

  // 按标题去重（同一论文跨页边界可能出现两次）
  const seen = new Set();
  papers = papers.filter((paper) => {
    const key = paper.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const report = papers.map((paper) => {
    const result = matcher.matchVenue(paper.venue);
    const m = result.match;
    return {
      title: paper.title,
      venue: paper.venue,
      year: paper.year,
      citations: paper.citations,
      matched: m ? m.entry.n : null,
      kind: m ? m.kind : null,
      scu: m ? m.entry.s : "",
      cas: m ? m.entry.c : "",
      ccf: m ? m.entry.f : "",
      confidence: m ? m.confidence : ""
    };
  });

  const matched = report.filter((row) => row.matched);
  const unmatched = report.filter((row) => !row.matched);
  const rate = report.length ? ((100 * matched.length) / report.length).toFixed(1) : "0";

  console.log(`papers: ${report.length} | matched: ${matched.length} (${rate}%) | unmatched: ${unmatched.length}\n`);

  console.log("--- unmatched venues (按出现次数排序) ---");
  const counts = {};
  unmatched.forEach((row) => {
    const key = row.venue || "(empty venue)";
    counts[key] = (counts[key] || 0) + 1;
  });
  Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .forEach(([venue, count]) => console.log(`${count}x  ${venue}`));

  console.log("\n--- matched (前 50 条) ---");
  matched.slice(0, 50).forEach((row) => {
    const grades = [row.scu, row.cas, row.ccf].filter(Boolean).join("/") || "-";
    console.log(`${row.matched} [${row.kind}] ${grades}  <-  ${row.venue}  |  ${row.title.slice(0, 60)}`);
  });

  const reportFile = path.join(dir, "match-report.json");
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nreport saved: ${reportFile}`);
}

main();
