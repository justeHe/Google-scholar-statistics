/**
 * 爬取 https://scu-journal.east.monster/ 的学术数据集，保存为本地 JSON。
 *
 * 数据源：站点前端 app.js 中加载的两个静态 CSV 文件：
 *   - rank.csv          川大期刊分级（含中科院分区、Top 期刊、CCF 对照分级）
 *   - ccf-directory.csv CCF 推荐国际学术期刊/会议目录（第七版）
 *
 * 用法：
 *   node scripts/scrape-journal-data.js [输出目录] [站点根地址]
 *   默认输出目录 ./data，默认根地址 https://scu-journal.east.monster/
 *
 * 输出文件：
 *   data/scu-journals.json   川大分级原始数据（rows 为逐行解析结果）
 *   data/ccf-directory.json  CCF 目录原始数据
 *   data/dataset.json        合并数据集（CCF 部分按站点逻辑做了字段归一化）
 *
 * 仅依赖 Node 18+ 内置的 fetch / fs，无第三方包。
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_BASE_URL = "https://scu-journal.east.monster/";
const CSV_FILES = [
  { name: "rank.csv", key: "scu" },
  { name: "ccf-directory.csv", key: "ccf" }
];
const RETRY_TIMES = 3;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 60_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 与站点 app.js 相同的稳健 CSV 解析：支持引号、转义引号、CRLF、BOM。 */
function parseCsv(source) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => header.replace(/^\uFEFF/, ""));
  return dataRows
    .filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

/** 归一化 CCF 目录行，字段与站点 app.js 的映射一致。 */
function normalizeCcfEntry(entry) {
  return {
    fullname: entry["全称"],
    abbr: entry["简称"],
    issn: "",
    category: entry["大类"],
    type: entry["类型"],
    rank: entry["CCF分级"],
    scuRank: entry["川大分级"]
  };
}

async function fetchWithRetry(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= RETRY_TIMES; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/csv,text/plain,*/*" },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      console.warn(`  [attempt ${attempt}/${RETRY_TIMES}] ${url} failed: ${error.message}`);
      if (attempt < RETRY_TIMES) await delay(RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error(`failed to download ${url}: ${lastError && lastError.message}`);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const outDir = path.resolve(process.argv[2] || "data");
  const baseUrl = (process.argv[3] || DEFAULT_BASE_URL).replace(/\/?$/, "/");
  const fetchedAt = new Date().toISOString();

  console.log(`Scraping journal dataset from ${baseUrl}`);
  console.log(`Output directory: ${outDir}\n`);

  const raw = {};
  for (const file of CSV_FILES) {
    const url = `${baseUrl}${file.name}`;
    console.log(`Downloading ${url} …`);
    const text = await fetchWithRetry(url);
    const rows = parseCsv(text);
    raw[file.key] = rows;
    console.log(`  -> ${rows.length} records\n`);
  }

  const scuPath = path.join(outDir, "scu-journals.json");
  writeJson(scuPath, {
    source: `${baseUrl}rank.csv`,
    fetchedAt,
    count: raw.scu.length,
    rows: raw.scu
  });
  console.log(`Saved ${scuPath}`);

  const ccfPath = path.join(outDir, "ccf-directory.json");
  writeJson(ccfPath, {
    source: `${baseUrl}ccf-directory.csv`,
    fetchedAt,
    count: raw.ccf.length,
    rows: raw.ccf
  });
  console.log(`Saved ${ccfPath}`);

  const datasetPath = path.join(outDir, "dataset.json");
  writeJson(datasetPath, {
    baseUrl,
    fetchedAt,
    sources: {
      scu: `${baseUrl}rank.csv`,
      ccf: `${baseUrl}ccf-directory.csv`
    },
    scuJournals: raw.scu,
    ccfDirectory: raw.ccf.map(normalizeCcfEntry)
  });
  console.log(`Saved ${datasetPath}`);

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(`\nScrape failed: ${error.message}`);
  process.exitCode = 1;
});
