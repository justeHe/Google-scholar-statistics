/**
 * 本地匹配测试（无需网络）：
 * 1. 内置回归用例，验证新匹配规则；
 * 2. HTML 解析器自检（与浏览器端 scholar-dom 提取规则一致）；
 * 3. 若已运行 npm run fetch:profile 抓取真实主页，则全量跑本地匹配并输出报告。
 *
 * 匹配规则：
 * - 期刊名字取每一条（论文）的最后一行；
 * - 查询名字 = 载体行第一个段内字符起到第一个终止符（括号/冒号等标点）为止，数字、&、/、逗号、连字符不是终止符；
 * - 每个载体先匹配会议（精确 → 归一化）、中间夹期刊精确，不再按 conference 一词路由；
 * - 查找键不区分大小写与空格，& 与 and 互换，双方一致地去掉冠词 the、序数词（twelfth/3rd）、
 *   噪声数字词（2020/39th/21，保留 2D/3D 类名称数字）与卷期标记（vol/pp 等）；
 * - 多个候选命中时优先取全称最短的；
 * - 会议归一化：双方都去掉包装词（IEEE/CVF、Proceedings of the、Conference on、Advances…）；
 * - “Proceedings of the” 这类纯包装前缀单独处理：匹配不上时继续取后面的名称段。
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

  // 含 conference 的会议
  const icml = match("International Conference on Machine Learning, 2022");
  assert(icml);
  assert.strictEqual(icml.kind, "conf");
  assert.strictEqual(icml.entry.a, "ICML");

  // 不含 conference 的完整会议名也应命中（先会议后期刊）
  const neurips = match("Advances in Neural Information Processing Systems, 2020");
  assert(neurips);
  assert.strictEqual(neurips.kind, "conf");
  assert.strictEqual(neurips.entry.a, "NeurIPS");

  // 独立的会议特征名（Computer Vision and Pattern Recognition）命中 CVPR
  const cvprBare = match("Computer Vision and Pattern Recognition, 2021");
  assert(cvprBare);
  assert.strictEqual(cvprBare.kind, "conf");
  assert.strictEqual(cvprBare.entry.a, "CVPR");

  // 无 conference 词的会议全称（Annual Meeting of the …）精确命中
  const acl = match("Annual Meeting of the Association for Computational Linguistics, 2022");
  assert(acl);
  assert.strictEqual(acl.kind, "conf");
  assert.strictEqual(acl.entry.a, "ACL");

  // 与会议归一化键同名的期刊，期刊精确优先（Neural Networks 不被 IJCNN 抢走）
  const nn = match("Neural Networks, 2020");
  assert(nn);
  assert.strictEqual(nn.kind, "journal");
  assert.strictEqual(nn.entry.n, "Neural Networks");

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

  // 冠词 the 双方去掉：The Lancet 命中 Lancet
  const lancet = match("The Lancet, 2020");
  assert(lancet);
  assert.strictEqual(lancet.kind, "journal");
  assert.strictEqual(lancet.entry.n, "Lancet");

  // 噪声数字词去掉：12th / 3rd 开头同样命中 ICML
  assert.strictEqual(match("12th International Conference on Machine Learning").entry.a, "ICML");
  assert.strictEqual(match("3rd International Conference on Machine Learning").entry.a, "ICML");

  // 序数词去掉：twelfth 命中 ICML
  assert.strictEqual(match("Twelfth International Conference on Machine Learning").entry.a, "ICML");

  // 复合序数词去掉：Thirty-ninth（三十 + 第九，两部分都去）命中 NeurIPS
  const neuripsThirtyNinth = match("The Thirty-ninth Annual Conference on Neural Information Processing Systems");
  assert(neuripsThirtyNinth);
  assert.strictEqual(neuripsThirtyNinth.kind, "conf");
  assert.strictEqual(neuripsThirtyNinth.entry.a, "NeurIPS");

  // 名称型数字保留：2D Materials 精确命中自身（而非 Materials 期刊）
  const twoD = match("2D Materials, 2020");
  assert(twoD);
  assert.strictEqual(twoD.kind, "journal");
  assert.strictEqual(twoD.entry.n, "2D Materials");

  // IEEE 会议行格式："缩写 + 年份(-年份) + 全称 (缩写)"，去掉开头装饰后命中
  const icassp = match("ICASSP 2022-2022 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)");
  assert(icassp);
  assert.strictEqual(icassp.kind, "conf");
  assert.strictEqual(icassp.entry.a, "ICASSP");
  assert.strictEqual(
    match("ICASSP 2022 IEEE International Conference on Acoustics, Speech and Signal Processing").entry.a,
    "ICASSP"
  );

  // 联合会议行（COLING+ACL 长串）→ 词序列包含关系命中 ACL
  const jointAcl = match("Proceedings of the 21st International Conference on Computational Linguistics and 44th Annual Meeting of the Association for Computational Linguistics");
  assert(jointAcl);
  assert.strictEqual(jointAcl.kind, "conf");
  assert.strictEqual(jointAcl.entry.a, "ACL");

  // 分号/冒号分隔的多段行：第二段命中 NAACL
  const naaclHlt = match("Human Language Technologies 2007: The Conference of the North American Chapter of the Association for Computational Linguistics; Proceedings of the Main Conference");
  assert(naaclHlt);
  assert.strictEqual(naaclHlt.kind, "conf");
  assert.strictEqual(naaclHlt.entry.a, "NAACL");

  // 包含关系兜底不误伤：PMLR（machine+learning+research）不得命中 ICML
  assert.strictEqual(match("Proceedings of Machine Learning Research, 2021"), null);

  // 纯噪声段不得与空简称条目误配（arXiv 行不得命中 IEEE World Haptics Conference）
  assert.strictEqual(match("arXiv preprint arXiv:2312.12345"), null);
  assert.strictEqual(match("arXiv preprint arXiv, 2021"), null);

  // 卷期数字（21）在键里去噪后不影响 JMLR
  assert.strictEqual(
    match("Journal of Machine Learning Research 21(140):1-67, 2020").entry.n,
    "Journal of Machine Learning Research"
  );

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
