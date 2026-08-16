/**
 * 从保存的 Google Scholar 作者主页 HTML 中解析论文列表（Node 端，
 * 提取规则与浏览器端 src/content/scholar-dom.js 的 parsePaperRow 保持一致，
 * 供离线匹配测试使用）。
 */

function decodeEntities(text) {
  return String(text || "")
    .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'");
}

function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]*>/g, ""));
}

/** 提取元素文本，优先 title 属性（与 scholar-dom.getAuthorsText/getVenueText 一致）。 */
function elementText(html) {
  const match = String(html || "").match(/^<([a-zA-Z0-9-]+)([^>]*)>/);
  if (match) {
    const attrs = match[2] || "";
    const titleAttr = attrs.match(/title="([^"]*)"/);
    if (titleAttr) return decodeEntities(titleAttr[1]);
  }
  return stripTags(html);
}

/** 与 scholar-dom.getVenueText 相同的载体清理：去掉行尾年份与首尾标点。 */
function cleanVenue(venueLine) {
  return elementText(venueLine)
    .replace(/\s*,\s*\d{4}$/, "")
    .replace(/\s+\d{4}$/, "")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();
}

function parseProfileHtml(html) {
  const source = String(html || "");
  const rowChunks = source.split(/<tr[^>]*class="gsc_a_tr"[^>]*>/i).slice(1);
  const papers = [];

  rowChunks.forEach((chunk) => {
    const row = chunk.split("</tr>")[0];
    if (!row) return;

    const titleAnchor = row.match(/<a[^>]*gsc_a_at[^>]*>([\s\S]*?)<\/a>/i);
    const title = titleAnchor ? stripTags(titleAnchor[1]).trim() : "";
    if (!title) return;

    const grayMatches = row.match(/<div[^>]*class="gs_gray"[^>]*>[\s\S]*?<\/div>/gi) || [];
    const authorsText = grayMatches[0] ? elementText(grayMatches[0]).trim() : "";
    // 与 scholar-dom.getVenueText 一致：期刊名字在每条的最后一行。
    const venueLine = grayMatches[grayMatches.length - 1] || "";

    const yearMatch =
      row.match(/<td[^>]*class="gsc_a_y"[^>]*>([\s\S]*?)<\/td>/i) ||
      row.match(/<span[^>]*class="gsc_a_h[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const year = yearMatch ? stripTags(yearMatch[1]).trim() : "";

    const citeMatch = row.match(/<a[^>]*gsc_a_ac[^>]*>([\s\S]*?)<\/a>/i);
    const citations = citeMatch ? stripTags(citeMatch[1]).trim() : "0";

    papers.push({
      title,
      authorsText,
      venue: cleanVenue(venueLine),
      year,
      citations
    });
  });

  return papers;
}

module.exports = {
  decodeEntities,
  stripTags,
  elementText,
  cleanVenue,
  parseProfileHtml
};
