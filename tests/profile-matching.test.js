/**
 * 本地匹配测试（无需网络）：
 * 1. 内置回归用例，验证新匹配规则；
 * 2. HTML 解析器自检（与浏览器端 scholar-dom 提取规则一致）；
 * 3. 若已运行 npm run fetch:profile 抓取真实主页，则全量跑本地匹配并输出报告。
 *
 * 匹配规则：
 * - 期刊名字取每一条（论文）的最后一行；
 * - 查询名字 = 载体行从第一个字母到第一个终止符（标点/数字）之前的部分，&、/、逗号、连字符不是终止符；
 * - 查询名字里含 conference 只查会议，否则只查期刊；
 * - 查找不区分大小写与空格，& 与 and 互换，逗号、连字符双方都去掉（全称/简称精确相等）；
 * - 会议匹配时双方都去掉包装词（IEEE/CVF、Proceedings of the、Conference on…）；
 * - “Proceedings of the” 这类纯包装前缀单独处理：跳过数字词，拿后面的会议名匹配。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const parser = require("../scripts/profile-parser");
const matcher = require("../src/content/venue-matcher");
const index = require("../data/dist/venue-index.json");

matcher.setIndex(index);

function match(venue) {
  return matcher.matchVenue(venue).match;
}

{
  // 查询名字截断：从第一个字母到逗号/年份为止
  const nature = match("Nature, 2020");
  assert(nature);
  assert.strictEqual(nature.entry.n, "Nature");
  assert.strictEqual(nature.entry.s, "A");

  // 查找不区分大小写与空格
  assert.strictEqual(match("  nature   ").entry.n, "Nature");
  assert.strictEqual(match("Nature Communications, 2021").entry.n, "Nature Communications");
  assert.notStrictEqual(match("Nature Communications, 2021").entry.n, "Nature");

  // 卷期数字截断：卷期之后的文字不参与
  const jmlr = match("Journal of Machine Learning Research 21(140):1-67, 2020");
  assert(jmlr);
  assert.strictEqual(jmlr.kind, "journal");
  assert.strictEqual(jmlr.entry.n, "Journal of Machine Learning Research");

  // 含 conference 的只查会议
  const icml = match("International Conference on Machine Learning, 2022");
  assert(icml);
  assert.strictEqual(icml.kind, "conf");
  assert.strictEqual(icml.entry.a, "ICML");

  // 不含 conference 的会议名（NeurIPS 全称）按规则查期刊 → 不命中
  assert.strictEqual(match("Advances in Neural Information Processing Systems"), null);

  // “Proceedings of the” 包装前缀单独处理：跳过数字词，拿后面的会议名匹配
  const icmlProceedings = match("Proceedings of the 39th International Conference on Machine Learning");
  assert(icmlProceedings);
  assert.strictEqual(icmlProceedings.kind, "conf");
  assert.strictEqual(icmlProceedings.entry.a, "ICML");

  const osdi = match("Proceedings of the 12th USENIX Symposium on Operating Systems Design and Implementation");
  assert(osdi);
  assert.strictEqual(osdi.kind, "conf");
  assert.strictEqual(osdi.entry.a, "OSDI");

  // 期刊自身的 Proceedings of the ... 全称不受影响
  const pnas = match("Proceedings of the National Academy of Sciences of the United States of America, 2020");
  assert(pnas);
  assert.strictEqual(pnas.kind, "journal");
  assert.strictEqual(pnas.entry.n, "Proceedings of the National Academy of Sciences of the United States of America");

  // & 与 and 互换：期刊名
  const apt = match("Alimentary Pharmacology & Therapeutics, 2020");
  assert(apt);
  assert.strictEqual(apt.kind, "journal");
  assert.strictEqual(apt.entry.n, "Alimentary Pharmacology & Therapeutics");

  // 会议匹配：双方去掉 IEEE/CVF 等包装词
  const cvpr = match("IEEE/CVF Conference on Computer Vision and Pattern Recognition, 2021");
  assert(cvpr);
  assert.strictEqual(cvpr.kind, "conf");
  assert.strictEqual(cvpr.entry.a, "CVPR");

  // & 与 and 互换 + 包装词归一化：SIGKDD
  const sigkdd = match("Proceedings of the 2021 ACM SIGKDD International Conference on Knowledge Discovery & Data Mining");
  assert(sigkdd);
  assert.strictEqual(sigkdd.kind, "conf");
  assert.strictEqual(sigkdd.entry.a, "SIGKDD");

  // 逗号不再截断，匹配双方都把逗号去掉：SC（全称含三个逗号）
  const sc = match("International Conference for High Performance Computing, Networking, Storage, and Analysis, 2019");
  assert(sc);
  assert.strictEqual(sc.kind, "conf");
  assert.strictEqual(sc.entry.a, "SC");

  // 逗号 + & + Proceedings 包装：DATE
  const date = match("Proceedings of the 2020 Design, Automation & Test in Europe");
  assert(date);
  assert.strictEqual(date.kind, "conf");
  assert.strictEqual(date.entry.a, "DATE");

  // 连字符与逗号同样处理：会议全称含连字符
  const cadGraphics = match("International Conference on Computer-Aided Design and Computer Graphics Processing, 2022");
  assert(cadGraphics);
  assert.strictEqual(cadGraphics.kind, "conf");
  assert.strictEqual(cadGraphics.entry.a, "CAD/Graphics");

  // 连字符与逗号同样处理：期刊全称含连字符
  const bmj = match("BMJ-British Medical Journal, 2020");
  assert(bmj);
  assert.strictEqual(bmj.kind, "journal");
  assert.strictEqual(bmj.entry.n, "BMJ-British Medical Journal");

  // 无法识别的载体
  assert.strictEqual(match("Qqqxxxzzz Unknown"), null);
}

{
  // 解析器自检：结构与浏览器端一致，载体取最后一行
  const html = [
    '<table>',
    '<tr class="gsc_a_tr">',
    '<td class="gsc_a_t"><a href="/x" class="gsc_a_at">Test &amp; Title</a>',
    '<div class="gs_gray">S Zhang, L Wang</div>',
    '<div class="gs_gray">Nature, 2020</div></td>',
    '<td class="gsc_a_c"><a class="gsc_a_ac gs_ibl" href="/y">42</a></td>',
    '<td class="gsc_a_y"><span class="gsc_a_h gsc_a_hc gs_ibl">2020</span></td>',
    '</tr>',
    '</table>'
  ].join("");
  const papers = parser.parseProfileHtml(html);
  assert.strictEqual(papers.length, 1);
  assert.strictEqual(papers[0].title, "Test & Title");
  assert.strictEqual(papers[0].authorsText, "S Zhang, L Wang");
  assert.strictEqual(papers[0].venue, "Nature");
  assert.strictEqual(papers[0].year, "2020");
  assert.strictEqual(papers[0].citations, "42");
}

{
  // 真实主页 fixture 全量本地匹配（如果已抓取）
  const dir = path.resolve(__dirname, "fixtures", "c2fckoYAAAAJ");
  if (!fs.existsSync(dir)) {
    console.log("\n[fixture] 尚未抓取主页数据。先运行: npm run fetch:profile");
    console.log("profile-matching tests passed");
    return;
  }

  const pages = fs.readdirSync(dir).filter((file) => /^page-.*\.html$/.test(file));
  if (!pages.length) {
    console.log("\n[fixture] fixtures 目录里没有 page-*.html。先运行: npm run fetch:profile");
    console.log("profile-matching tests passed");
    return;
  }

  let papers = [];
  pages.forEach((file) => {
    papers = papers.concat(parser.parseProfileHtml(fs.readFileSync(path.join(dir, file), "utf8")));
  });
  assert(papers.length > 0, "fixtures 里解析不到论文");

  const seen = new Set();
  papers = papers.filter((paper) => {
    const key = paper.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let matchedCount = 0;
  const unmatched = new Set();
  papers.forEach((paper) => {
    const result = matcher.matchVenue(paper.venue);
    if (result.match) matchedCount += 1;
    else unmatched.add(paper.venue || "(empty venue)");
  });

  const rate = ((100 * matchedCount) / papers.length).toFixed(1);
  console.log(`\n[fixture] papers=${papers.length} matched=${matchedCount} (${rate}%) unmatched=${unmatched.size}`);
  if (unmatched.size) {
    console.log("[fixture] unmatched venues:");
    [...unmatched].sort().forEach((venue) => console.log(`  - ${venue}`));
  }
}

console.log("profile-matching tests passed");
