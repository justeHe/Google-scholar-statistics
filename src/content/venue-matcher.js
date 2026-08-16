(function attachVenueMatcher(root) {
  const namespace = root.ScholarAuthorStats || {};

  let dataset = null;

  // “Proceedings of the” 这类纯包装前缀（用于跳过前缀、继续向后取会议名）。
  const WRAP_WORDS = new Set([
    "proceedings", "proc", "of", "the", "in", "on",
    "international", "annual", "and", "with", "ieee", "acm", "cvf"
  ]);

  // 会议名归一化时丢弃的包装词（检索方与被检索方双方一致）：
  // IEEE/CVF、ACM、Proceedings of the、Conference on … 等。
  const CONF_DROP_WORDS = new Set([
    "the", "of", "on", "in", "proceedings", "proc", "conference",
    "international", "annual", "joint", "ieee", "acm", "cvf",
    "symposium", "workshop"
  ]);

  // 查找键：不区分大小写与空格；& 与 and 互换；逗号、连字符去掉（匹配双方一致）。
  function foldKey(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[,，-]/g, "")
      .replace(/\s+/g, "");
  }

  // 段内允许的字符：字母、空白、&、/、逗号、连字符；其余标点与数字均为终止符。
  const SEGMENT_CHARS = /[A-Za-z\s&/,，-]/;

  /** 从 fromIndex 起找一段查询名字：跳到第一个字母，取字母/空白直到第一个终止符。 */
  function segmentFrom(value, fromIndex) {
    let start = fromIndex;
    while (start < value.length && !/[A-Za-z]/.test(value[start])) {
      start += 1;
    }
    if (start >= value.length) return { name: "", end: start };
    let end = start;
    while (end < value.length && SEGMENT_CHARS.test(value[end])) {
      end += 1;
    }
    return { name: value.slice(start, end).trim(), end };
  }

  /**
   * 从 fromIndex 起找下一段查询名字，跳过“带数字的词”（39th / 2020 / 21(140) 等）：
   * “Proceedings of the 39th International Conference on Machine Learning”
   *   -> 跳过 39th，返回 “International Conference on Machine Learning”。
   */
  function nextSegment(value, fromIndex) {
    let i = fromIndex;
    while (i < value.length) {
      const char = value[i];
      if (/[A-Za-z]/.test(char)) break;
      if (/\d/.test(char)) {
        // 数字开头的整个词（39th、2020…）跳过
        while (i < value.length && /[A-Za-z0-9]/.test(value[i])) {
          i += 1;
        }
        continue;
      }
      i += 1;
    }
    if (i >= value.length) return { name: "", end: i };
    let end = i;
    while (end < value.length && SEGMENT_CHARS.test(value[end])) {
      end += 1;
    }
    return { name: value.slice(i, end).trim(), end };
  }

  /**
   * 取查询名字：从第一个字母开始，一直取到第一个终止符（标点/数字）为止，
   * & 与 / 不是终止符。例如：
   *   "Nature, 2020"                                            -> "Nature"
   *   "Journal of Machine Learning Research 21(140):1-67, 2020" -> "Journal of Machine Learning Research"
   *   "Knowledge Discovery & Data Mining, 2020"                 -> "Knowledge Discovery & Data Mining"
   */
  function extractQueryName(text) {
    return segmentFrom(String(text || ""), 0).name;
  }

  function isWrapperPhrase(query) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    return words.length > 0 && words.every((word) => WRAP_WORDS.has(word));
  }

  /**
   * 会议名归一化键：去掉双方共有的包装词。
   * "IEEE/CVF Conference on Computer Vision and Pattern Recognition" 与
   * "IEEE/CVF Computer Vision and Pattern Recognition Conference"
   * 都归一化为 "computervisionandpatternrecognition"。
   */
  function strippedConfKey(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .split(/[^a-z0-9]+/)
      .filter((word) => word && !CONF_DROP_WORDS.has(word))
      .join("");
  }

  function setIndex(indexData) {
    dataset = indexData || null;
    if (dataset && Array.isArray(dataset.confs)) {
      // 会议条目预计算归一化键（被检索方去包装词）。
      dataset.confs.forEach((entry) => {
        entry.sk = strippedConfKey(entry.n);
      });
    }
    return dataset;
  }

  function isReady() {
    return Boolean(dataset && Array.isArray(dataset.journals) && Array.isArray(dataset.confs));
  }

  function loadIndex() {
    if (!(root.chrome && chrome.runtime && chrome.runtime.getURL)) {
      return Promise.reject(new Error("chrome.runtime unavailable"));
    }
    const url = chrome.runtime.getURL("data/dist/venue-index.json");
    return fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`venue index fetch failed: ${response.status}`);
        return response.json();
      })
      .then((data) => setIndex(data))
      .catch((error) => {
        dataset = null;
        throw error;
      });
  }

  function match(entry, confidence) {
    return {
      kind: entry.k === "c" ? "conf" : "journal",
      entry,
      confidence,
      source: "local"
    };
  }

  function matchJournal(venue, query) {
    const folded = foldKey(query);
    for (const entry of dataset.journals) {
      if (entry.nk === folded || entry.ak === folded) {
        return { venue, match: match(entry, "exact") };
      }
    }
    return null;
  }

  function matchConf(venue, query) {
    const folded = foldKey(query);
    // 1. 全称/简称精确（& 与 and 互换后）
    for (const entry of dataset.confs) {
      if (entry.nk === folded || entry.ak === folded) {
        return { venue, match: match(entry, "exact") };
      }
    }
    // 2. 双方去掉包装词（IEEE/CVF、Proceedings of the、Conference on …）后精确
    const stripped = strippedConfKey(query);
    if (stripped) {
      for (const entry of dataset.confs) {
        if (entry.sk && entry.sk === stripped) {
          return { venue, match: match(entry, "high") };
        }
      }
    }
    return null;
  }

  /**
   * 按规则查表：
   * - 查询名字里含 conference 就只在会议里查；
   * - preferConf（包装前缀之后）先查会议，查不到再查期刊；
   * - 否则只在期刊里查。
   */
  function lookup(venue, query, preferConf) {
    if (/conference/i.test(query)) {
      return matchConf(venue, query);
    }
    if (preferConf) {
      return matchConf(venue, query) || matchJournal(venue, query);
    }
    return matchJournal(venue, query);
  }

  /**
   * 匹配规则：
   * 1. 查询名字 = 载体字符串从第一个字母到第一个终止符（标点/数字）之前的部分；
   *    & 与 / 不是终止符；
   * 2. 查询名字里含 conference 就只在会议里查，否则只在期刊里查；
   * 3. 查找不区分大小写与空格，& 与 and 互换（全称/简称精确相等）；
   * 4. 会议匹配时，双方都去掉包装词（IEEE/CVF、Proceedings of the、Conference on…）；
   * 5. “Proceedings of the” 这类纯包装前缀单独处理：匹配不上时跳过后面的
   *    数字词（39th、2020…），拿再后面的会议名继续匹配。
   */
  function matchVenue(venueText) {
    const venue = String(venueText || "").trim();
    if (!venue || !isReady()) return { venue, match: null };

    let segment = segmentFrom(venue, 0);
    let query = segment.name;
    let preferConf = false;

    while (query) {
      const hit = lookup(venue, query, preferConf);
      if (hit) return hit;

      // 只有包装前缀（Proceedings of the …）才继续往后取会议名。
      if (!isWrapperPhrase(query)) break;

      preferConf = true;
      segment = nextSegment(venue, segment.end);
      query = segment.name;
    }

    return { venue, match: null };
  }

  const api = {
    foldKey,
    extractQueryName,
    strippedConfKey,
    setIndex,
    isReady,
    loadIndex,
    matchVenue
  };

  namespace.venueMatcher = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
