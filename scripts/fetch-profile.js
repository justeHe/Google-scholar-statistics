/**
 * 谨慎抓取 Google Scholar 作者主页的论文列表 HTML，保存到 tests/fixtures/<userId>/，
 * 供完全离线的本地匹配测试使用。
 *
 * 防封措施：
 *   - 单线程、每页间隔 4-8 秒随机抖动；
 *   - 固定浏览器 UA、en 语言；
 *   - 每页最多重试 3 次（指数退避）；
 *   - 检测到验证码 / unusual traffic 立即停止；
 *   - 每页 pagesize=100，减少请求次数；连续两页内容相同或为空即结束。
 *
 * 用法：node scripts/fetch-profile.js [userId] [起始页cstart] [最大页数]
 */

const fs = require("fs");
const path = require("path");

const USER = process.argv[2] || "c2fckoYAAAAJ";
const START = parseInt(process.argv[3] || "0", 10);
const MAX_PAGES = parseInt(process.argv[4] || "20", 10);
const OUT_DIR = path.resolve("tests/fixtures", USER);
const PAGE_SIZE = 100;
const DELAY_MIN_MS = 4000;
const DELAY_MAX_MS = 8000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = () => Math.round(DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));

function looksBlocked(html) {
  const text = String(html || "").toLowerCase();
  return (
    text.includes("unusual traffic") ||
    text.includes("not a robot") ||
    text.includes("captcha") ||
    text.includes("enable javascript")
  );
}

function countRows(html) {
  return (String(html || "").match(/class="gsc_a_tr"/g) || []).length;
}

async function fetchPage(cstart) {
  const url = `https://scholar.google.com/citations?user=${USER}&hl=en&cstart=${cstart}&pagesize=${PAGE_SIZE}`;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9"
        }
      });
      if (!response.ok) throw new Error(`http ${response.status}`);
      const html = await response.text();
      if (looksBlocked(html)) throw new Error("blocked");
      return html;
    } catch (error) {
      lastError = error;
      if (error.message === "blocked") break;
      console.warn(`  [page ${cstart}] attempt ${attempt}/3 failed: ${error.message}`);
      await sleep(5000 * attempt);
    }
  }
  throw new Error(lastError ? lastError.message : "fetch failed");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Fetching profile ${USER} (pagesize=${PAGE_SIZE}, start=${START}) into ${OUT_DIR}`);
  console.log("低频抓取中，请保持本窗口开启，不要重复运行。\n");

  let cstart = START;
  let totalRows = 0;
  let previousHtml = "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let html;
    try {
      html = await fetchPage(cstart);
    } catch (error) {
      if (error.message === "blocked") {
        console.error("\n检测到 Google 验证码/风控页面，已停止（已抓取部分仍保存在本地）。");
        console.error("建议：过几小时再运行，或改用浏览器手动保存页面。");
        process.exitCode = 1;
        return;
      }
      console.error(`\nfetch failed: ${error.message}`);
      process.exitCode = 1;
      return;
    }

    const rowCount = countRows(html);
    if (!rowCount || html === previousHtml) break;

    const file = path.join(OUT_DIR, `page-${cstart}.html`);
    fs.writeFileSync(file, html, "utf8");
    totalRows += rowCount;
    previousHtml = html;
    console.log(`saved ${file} (${rowCount} rows)`);

    cstart += rowCount;
    if (page < MAX_PAGES - 1) await sleep(jitter());
  }

  console.log(`\ndone: ${totalRows} papers -> ${OUT_DIR}`);
  console.log("下一步：npm run match:fixture  # 纯本地匹配并输出报告");
}

main();
