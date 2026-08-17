/**
 * 把 data/ 下的期刊与会议数据编译成运行时可查的 data/dist/venue-index.json。
 *
 * 新匹配规则（见 src/content/venue-matcher.js）：
 * - 查询名字 = 载体行从第一个字母到第一个标点/数字之前的部分；
 * - 查询名字里含 conference 只查会议，否则只查期刊；
 * - 查找不区分大小写与空格：键 = 小写 + 去空格，其余字符原样保留。
 *
 * 输入：
 *   data/scu-journals.json  （川大分级，字段 fullname/abbr/issn/category/rank/ccf-rank/分区/Top 期刊）
 *   data/ccf-directory.json （CCF 目录，字段 大类/类型/CCF分级/川大分级/简称/全称；取 类型=会议 作为会议）
 *
 * 输出 data/dist/venue-index.json：
 *   journals[]  期刊条目（原始字段 + nk/ak 查找键）
 *   confs[]     会议条目（原始字段 + nk/ak 查找键）
 *   counts / version / builtAt
 *
 * 用法：node scripts/build-venue-index.js [dataDir] [outFile]
 */

const fs = require("fs");
const path = require("path");

// 与 src/content/venue-matcher.js 的 foldKey 一致：小写、& 与 and 互换、分词后
// 双方一致地去掉冠词 the、序数词、含数字的词与卷期标记。
const FOLD_DROP_WORDS = new Set([
  "the", "vol", "volume", "no", "issue", "pp", "pages",
  "ed", "edition", "part", "series", "suppl", "supplement"
]);
const ORDINAL_WORDS = new Set([
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth",
  "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth",
  "seventeenth", "eighteenth", "nineteenth", "twentieth", "thirtieth", "fortieth",
  "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth", "hundredth",
  // 十位基数词（"Thirty-ninth" 拆成 thirty + ninth，两部分都去掉）
  "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "twentyfirst", "twentysecond", "twentythird", "twentyfourth", "twentyfifth",
  "twentysixth", "twentyseventh", "twentyeighth", "twentyninth", "thirtyfirst",
  "thirtysecond", "thirtythird", "thirtyfourth", "thirtyfifth", "thirtysixth",
  "thirtyseventh", "thirtyeighth", "thirtyninth", "fortyfirst", "fortysecond",
  "fortythird", "fortyfourth", "fortyfifth", "fortysixth", "fortyseventh",
  "fortyeighth", "fortyninth", "fiftyfirst", "fiftysecond", "fiftythird",
  "fiftyfourth", "fiftyfifth", "fiftysixth", "fiftyseventh", "fiftyeighth",
  "fiftyninth", "sixtyfirst", "sixtysecond", "sixtythird", "sixtyfourth",
  "sixtyfifth", "sixtysixth", "sixtyseventh", "sixtyeighth", "sixtyninth",
  "seventyfirst", "seventysecond", "seventythird", "seventyfourth", "seventyfifth",
  "seventysixth", "seventyseventh", "seventyeighth", "seventyninth", "eightyfirst",
  "eightysecond", "eightythird", "eightyfourth", "eightyfifth", "eightysixth",
  "eightyseventh", "eightyeighth", "eightyninth", "ninetyfirst", "ninetysecond",
  "ninetythird", "ninetyfourth", "ninetyfifth", "ninetysixth", "ninetyseventh",
  "ninetyeighth", "ninetyninth"
]);

// 噪声数字词：纯数字（2020/21）或带序数后缀（39th/3rd/12th/2nd）。
// 保留 2D/3D 这类名称型数字（2D Materials 必须能命中）。
function isNoiseToken(token) {
  return /^\d+(st|nd|rd|th)?$/i.test(token);
}

function foldKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .split(/[^a-z0-9]+/)
    .filter((token) => (
      token &&
      !FOLD_DROP_WORDS.has(token) &&
      !ORDINAL_WORDS.has(token) &&
      !isNoiseToken(token)
    ))
    .join("");
}

function main() {
  const dataDir = path.resolve(process.argv[2] || "data");
  const outFile = path.resolve(process.argv[3] || path.join(dataDir, "dist", "venue-index.json"));

  const scu = JSON.parse(fs.readFileSync(path.join(dataDir, "scu-journals.json"), "utf8"));
  const ccf = JSON.parse(fs.readFileSync(path.join(dataDir, "ccf-directory.json"), "utf8"));

  // CCF 期刊条目（全称 -> 简称），用于给带 CCF 评级的期刊补充 CCF 简称（悬浮显示用）。
  const ccfJournalAbbrByFull = new Map(
    ccf.rows
      .filter((row) => row["类型"] === "期刊")
      .map((row) => [foldKey(row["全称"]), row["简称"]])
  );

  const journals = scu.rows.map((row) => {
    const ccfRank = row["ccf-rank"];
    const ccfAbbr = ccfRank ? (ccfJournalAbbrByFull.get(foldKey(row.fullname)) || "") : "";
    return {
      k: "j",
      n: row.fullname,
      a: row.abbr,
      i: row.issn,
      s: row.rank,
      c: row["分区"],
      t: row["Top 期刊"] === "是",
      f: ccfRank,
      ca: ccfAbbr,
      nk: foldKey(row.fullname),
      ak: foldKey(row.abbr)
    };
  });

  const confs = ccf.rows
    .filter((row) => row["类型"] === "会议")
    .map((row) => ({
      k: "c",
      n: row["全称"],
      a: row["简称"],
      i: "",
      s: row["川大分级"],
      c: "",
      t: false,
      f: row["CCF分级"],
      nk: foldKey(row["全称"]),
      ak: foldKey(row["简称"])
    }));

  const output = {
    version: 3,
    builtAt: new Date().toISOString(),
    counts: { journals: journals.length, confs: confs.length },
    journals,
    confs
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(output), "utf8");

  console.log(`journals: ${journals.length}, conferences: ${confs.length}`);
  console.log(`written: ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
}

main();
