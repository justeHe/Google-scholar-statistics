(function attachVenueMatcher(root) {
  const namespace = root.ScholarAuthorStats || {};

  let dataset = null;

  // “Proceedings of the” 这类纯包装前缀（用于跳过前缀、继续向后取下一段名称）。
  const WRAP_WORDS = new Set([
    "proceedings", "proc", "of", "the", "in", "on",
    "international", "annual", "and", "with", "ieee", "acm", "cvf"
  ]);

  // 会议名归一化时丢弃的包装词（检索方与被检索方双方一致）：
  // IEEE/CVF、ACM、Proceedings of the、Conference on、Advances in … 等。
  const CONF_DROP_WORDS = new Set([
    "the", "of", "on", "in", "proceedings", "proc", "conference",
    "international", "annual", "joint", "ieee", "acm", "cvf",
    "symposium", "workshop", "advances",
    "vol", "volume", "no", "issue", "pp", "pages", "ed", "edition",
    "part", "series", "suppl", "supplement", "p"
  ]);

  // 序数词（twelfth、twentyfirst 这类）：匹配时双方都去掉。
  const ORDINAL_UNITS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"];
  const ORDINAL_TEENS = ["tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
  const ORDINAL_TENS = ["twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth"];
  const ORDINAL_TENS_PREFIX = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const ORDINAL_WORDS = new Set([
    ...ORDINAL_UNITS, ...ORDINAL_TEENS, ...ORDINAL_TENS, "hundredth"
  ]);
  ORDINAL_TENS_PREFIX.forEach((tens) => {
    // 十位基数词本身也要去掉（"Thirty-ninth" 拆成 thirty + ninth，两部分都去）
    ORDINAL_WORDS.add(tens);
    ORDINAL_UNITS.forEach((unit) => ORDINAL_WORDS.add(tens + unit));
  });

  // 通用匹配键也要去掉的词：冠词 the、卷期标记等。
  const FOLD_DROP_WORDS = new Set([
    "the", "vol", "volume", "no", "issue", "pp", "pages",
    "ed", "edition", "part", "series", "suppl", "supplement", "p"
  ]);

  // 噪声数字词：纯数字（2020/21）或带序数后缀（39th/3rd/12th/2nd）。
  // 保留 2D/3D/4K 这类名称型数字（2D Materials 必须能命中）。
  function isNoiseToken(token) {
    return /^\d+(st|nd|rd|th)?$/i.test(token);
  }

  // 查找键：不区分大小写与空格；& 与 and 互换；分词后双方一致地去掉
  // 冠词 the、序数词、噪声数字词（39th/2020/21）与卷期标记。
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

  // 段内允许的字符：字母、数字、空白、&、/、逗号、连字符；其余标点（如括号、冒号）为终止符。
  // 数字不再截断：噪声数字会在匹配键里统一去掉。
  const SEGMENT_CHARS = /[A-Za-z\d\s&/,，-]/;

  /** 从 fromIndex 起找一段查询名字：跳过非段字符，取段内字符直到终止符。 */
  function segmentFrom(value, fromIndex) {
    let start = fromIndex;
    while (start < value.length && !SEGMENT_CHARS.test(value[start])) {
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
   * 取查询名字：从第一个段内字符开始，取到第一个终止符（括号/冒号等标点）为止。
   * 数字、&、/、逗号、连字符都不是终止符。例如：
   *   "Nature, 2020"                                            -> "Nature, 2020"
   *   "Journal of Machine Learning Research 21(140):1-67, 2020" -> "Journal of Machine Learning Research 21"
   *   "Proceedings of the 39th International Conference on ML"  -> 整段
   * 噪声数字词（2020/39th）在匹配键里统一去掉。
   */
  function extractQueryName(text) {
    return segmentFrom(String(text || ""), 0).name;
  }

  function isWrapperPhrase(query) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    return words.length > 0 && words.every((word) => WRAP_WORDS.has(word));
  }

  /**
   * 会议名归一化键：去掉双方共有的包装词与噪声词。
   * "IEEE/CVF Conference on Computer Vision and Pattern Recognition" 与
   * "IEEE/CVF Computer Vision and Pattern Recognition Conference"
   * 都归一化为 "computervisionandpatternrecognition"。
   */
  function strippedConfKey(text) {
    return strippedConfTokens(text).join("");
  }

  // 归一化后的词序列（与 sk 同源），供包含关系匹配使用。
  function strippedConfTokens(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .split(/[^a-z0-9]+/)
      .filter((word) => (
        word &&
        !CONF_DROP_WORDS.has(word) &&
        !ORDINAL_WORDS.has(word) &&
        !isNoiseToken(word)
      ));
  }

  // shortTokens 是否为 longTokens 的连续子序列。
  function isSubsequence(shortTokens, longTokens) {
    if (!shortTokens.length || shortTokens.length > longTokens.length) return false;
    for (let i = 0; i + shortTokens.length <= longTokens.length; i += 1) {
      let ok = true;
      for (let j = 0; j < shortTokens.length; j += 1) {
        if (longTokens[i + j] !== shortTokens[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    return false;
  }

  function setIndex(indexData) {
    dataset = indexData || null;
    if (dataset && Array.isArray(dataset.confs)) {
      // 会议条目预计算归一化键与词序列（被检索方去包装词）。
      dataset.confs.forEach((entry) => {
        entry.skt = strippedConfTokens(entry.n);
        entry.sk = entry.skt.join("");
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

  // 多个候选命中时优先取全称最短的（如 The Lancet 与 Lancet 归一化后相同）。
  function pickShortest(candidates) {
    if (!candidates || !candidates.length) return null;
    let best = candidates[0];
    for (let i = 1; i < candidates.length; i += 1) {
      if (String(candidates[i].entry.n || "").length < String(best.entry.n || "").length) {
        best = candidates[i];
      }
    }
    return best;
  }

  function matchJournal(venue, query) {
    const folded = foldKey(query);
    // 空键不匹配：防止纯噪声段（如 "2312"）与空简称条目（ak=""）误配。
    if (!folded) return null;
    const candidates = [];
    for (const entry of dataset.journals) {
      if (entry.nk === folded || (entry.ak && entry.ak === folded)) {
        candidates.push({ entry });
      }
    }
    const best = pickShortest(candidates);
    return best ? { venue, match: match(best.entry, "exact") } : null;
  }

  // 会议精确匹配（全称/简称，& 与 and 互换后）。
  function matchConfExact(venue, query) {
    const folded = foldKey(query);
    // 空键不匹配：防止纯噪声段（如 "2312"）与空简称条目（ak=""）误配。
    if (!folded) return null;
    const candidates = [];
    for (const entry of dataset.confs) {
      if (entry.nk === folded || (entry.ak && entry.ak === folded)) {
        candidates.push({ entry });
      }
    }
    const best = pickShortest(candidates);
    return best ? { venue, match: match(best.entry, "exact") } : null;
  }

  // 会议归一化匹配：双方去掉包装词（IEEE/CVF、Proceedings of the、Conference on、
  // Advances…）后精确比较，覆盖不带 conference 词的完整会议名。
  // 精确不中时再按“包含关系”匹配：查询词序列与会议词序列互为连续子序列。
  // 为避免两词键误配（如 PMLR 的 machine+learning 误配 ICML），
  // 仅当数据库会议键 ≥ 3 个词时才参与包含匹配。
  function matchConfStripped(venue, query) {
    const queryTokens = strippedConfTokens(query);
    const stripped = queryTokens.join("");
    if (!stripped) return null;

    const exactCandidates = [];
    const containedCandidates = [];
    for (const entry of dataset.confs) {
      if (!entry.skt || !entry.skt.length) continue;
      if (entry.sk === stripped) {
        exactCandidates.push({ entry });
      } else if (
        entry.skt.length >= 3 &&
        (isSubsequence(entry.skt, queryTokens) || isSubsequence(queryTokens, entry.skt))
      ) {
        containedCandidates.push({ entry });
      }
    }

    const exact = pickShortest(exactCandidates);
    if (exact) return { venue, match: match(exact.entry, "high") };

    const contained = pickShortest(containedCandidates);
    if (contained) return { venue, match: match(contained.entry, "medium") };
    return null;
  }

  /**
   * 查表顺序（不再按是否含 conference 决定路由）：
   * 1. 会议精确（全称/简称）——覆盖 Annual Meeting of the …、USENIX Symposium …
   *    这类没有 conference 词的会议全称；
   * 2. 期刊精确——防止同名期刊被会议归一化键抢走（如 Neural Networks vs IJCNN）；
   * 3. 会议归一化——覆盖 “Computer Vision and Pattern Recognition”、
   *    “Advances in Neural Information Processing Systems” 这类完整会议名。
   */
  function lookup(venue, query) {
    const confExact = matchConfExact(venue, query);
    if (confExact) return confExact;

    const journal = matchJournal(venue, query);
    if (journal) return journal;

    return matchConfStripped(venue, query);
  }

  /**
   * 定向处理 IEEE 会议行格式："ICASSP 2022-2022 IEEE International Conference on
   * Acoustics, Speech and Signal Processing (ICASSP)" —— 开头是“缩写 + 年份(-年份)”
   * 装饰，去掉这两个词后再匹配。不满足该模式返回空串。
   */
  function stripAbbrYearPrefix(query) {
    const words = String(query || "").trim().split(/\s+/).filter(Boolean);
    if (words.length < 3) return "";
    if (!/^[A-Z]{2,6}$/.test(words[0])) return "";
    if (!/^\d{4}(-\d{4})?$/.test(words[1])) return "";
    return words.slice(2).join(" ");
  }

  /**
   * 匹配规则：
   * 1. 查询名字 = 载体字符串第一个段内字符起到第一个终止符（括号/冒号等标点）为止；
   *    数字、&、/、逗号、连字符不是终止符；
   * 2. 载体行按终止符（: ; ( ) 等）分成多段，逐段尝试；
   * 3. 每个载体都先匹配会议、再匹配期刊，不再根据 conference 一词决定路由；
   * 4. 查找键不区分大小写与空格，& 与 and 互换，双方一致地去掉冠词 the、
   *    序数词（twelfth/3rd）、噪声数字词（2020/39th/21）与卷期标记；
   * 5. 会议归一化：双方都去掉包装词（IEEE/CVF、Proceedings of the、Conference on、Advances…）；
   *    精确不中时按词序列“包含关系”再匹配（数据库键 ≥ 3 词才参与）；
   * 6. 多个候选命中时优先取全称最短的；
   * 7. 定向处理 IEEE 会议行（"ICASSP 2022-2022 IEEE …"）：去掉开头的缩写与年份后重试。
   */
  function matchVenue(venueText) {
    const venue = String(venueText || "").trim();
    if (!venue || !isReady()) return { venue, match: null };

    // 逐段尝试：段与段之间以终止符（: ; ( ) 等）分隔。
    let offset = 0;
    while (offset < venue.length) {
      const segment = segmentFrom(venue, offset);
      if (!segment.name) break;

      let query = segment.name;
      // 1. 定向处理：“ICASSP 2022-2022 IEEE International Conference on … (ICASSP)”
      //    先去掉开头的缩写与年份再匹配，可得到精确结果。
      const abbrStripped = stripAbbrYearPrefix(query);
      let hit = abbrStripped ? lookup(venue, abbrStripped) : null;
      // 2. 常规匹配（会议精确 → 期刊精确 → 会议归一化/包含）。
      if (!hit) hit = lookup(venue, query);
      // 3. 纯包装前缀（Proceedings of the）：继续取下一段名称。
      if (!hit && isWrapperPhrase(query)) {
        const next = segmentFrom(venue, segment.end + 1);
        if (next.name) hit = lookup(venue, next.name);
      }
      if (hit) return hit;

      if (segment.end >= venue.length) break;
      offset = segment.end + 1;
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
