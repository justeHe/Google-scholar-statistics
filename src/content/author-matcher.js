(function attachAuthorMatcher(root) {
  const namespace = root.ScholarAuthorStats || {};

  // 作者字符串里常见的贡献/通讯标记，匹配姓名前统一去掉。
  const DEFAULT_MARKERS = ["*", "†", "‡", "§", "#", "✉", "📧"];

  function uniq(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function stripDiacritics(text) {
    return String(text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }

  function markerPattern() {
    const escaped = DEFAULT_MARKERS
      .map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("");
    return new RegExp(`[${escaped}\\u2070-\\u209F\\d]`, "g");
  }

  function hasHan(text) {
    return /[\u3400-\u9fff]/.test(text || "");
  }

  function normalizeLoose(name) {
    return stripDiacritics(name)
      .replace(/\([^)]*\)/g, " ")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(markerPattern(), " ")
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[._,;:/"'`~!@$%^&+=<>?{}|\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function compactName(name) {
    return normalizeLoose(name).replace(/\s+/g, "");
  }

  function latinTokens(name) {
    return normalizeLoose(name)
      .split(/\s+/)
      .map((token) => token.replace(/^-+|-+$/g, ""))
      .filter((token) => token && !/^\d+$/.test(token));
  }

  function splitAuthors(authorsText) {
    if (!authorsText) return [];
    const normalized = String(authorsText)
      .replace(/\u00a0/g, " ")
      .replace(/\bet al\.?/gi, "")
      .replace(/…/g, "...")
      .trim();

    return normalized
      .split(/\s*,\s*/)
      .map((raw) => raw.trim())
      .filter((raw) => raw && raw !== "..." && raw !== ".")
      .map((raw, index) => ({
        raw,
        name: normalizeLoose(raw),
        compact: compactName(raw),
        index
      }))
      .filter((author) => author.name || author.raw);
  }

  function editDistance(a, b) {
    const left = String(a || "");
    const right = String(b || "");
    if (left === right) return 0;
    if (!left) return right.length;
    if (!right) return left.length;

    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 0; i < left.length; i += 1) {
      const current = [i + 1];
      for (let j = 0; j < right.length; j += 1) {
        current[j + 1] = Math.min(
          previous[j + 1] + 1,
          current[j] + 1,
          previous[j] + (left[i] === right[j] ? 0 : 1)
        );
      }
      for (let j = 0; j < current.length; j += 1) {
        previous[j] = current[j];
      }
    }
    return previous[right.length];
  }

  function tokenInitial(token) {
    return token ? token[0] : "";
  }

  function scoreLatinTokens(authorTokens, aliasTokens) {
    if (!authorTokens.length || !aliasTokens.length) return Infinity;

    const authorOrders = [authorTokens];
    if (authorTokens.length > 1) authorOrders.push(authorTokens.slice().reverse());
    const aliasOrders = [aliasTokens];
    if (aliasTokens.length > 1) aliasOrders.push(aliasTokens.slice().reverse());

    let best = Infinity;
    authorOrders.forEach((candidateAuthor) => {
      aliasOrders.forEach((candidateAlias) => {
        const authorLast = candidateAuthor[candidateAuthor.length - 1];
        const aliasLast = candidateAlias[candidateAlias.length - 1];
        const authorGiven = candidateAuthor.slice(0, -1);
        const aliasGiven = candidateAlias.slice(0, -1);

        if (!authorLast || !aliasLast) return;
        if (authorLast !== aliasLast) {
          const distance = editDistance(authorLast, aliasLast);
          if (distance > 1 || Math.min(authorLast.length, aliasLast.length) < 5) return;
        }

        if (!authorGiven.length || !aliasGiven.length) {
          best = Math.min(best, 0.35);
          return;
        }

        const authorInitials = authorGiven.map(tokenInitial).join("");
        const aliasInitials = aliasGiven.map(tokenInitial).join("");
        const fullGivenOverlap = aliasGiven.some((token) => authorGiven.includes(token));
        const initialsMatch = authorInitials && aliasInitials && (
          authorInitials === aliasInitials ||
          authorInitials.startsWith(aliasInitials) ||
          aliasInitials.startsWith(authorInitials)
        );

        if (fullGivenOverlap && initialsMatch) {
          best = Math.min(best, 0.05);
        } else if (initialsMatch) {
          best = Math.min(best, 0.15);
        }
      });
    });

    return best;
  }

  function scoreAlias(author, alias) {
    const authorCompact = compactName(author.raw || author.name);
    const aliasCompact = compactName(alias);

    if (!authorCompact || !aliasCompact) return Infinity;
    if (authorCompact === aliasCompact) return 0;

    if (hasHan(authorCompact) || hasHan(aliasCompact)) {
      if (authorCompact === aliasCompact) return 0;
      if (authorCompact.length >= 2 && aliasCompact.length >= 2 && authorCompact.includes(aliasCompact)) return 0.08;
      return Infinity;
    }

    const distance = editDistance(authorCompact, aliasCompact);
    if (distance <= 1 && Math.min(authorCompact.length, aliasCompact.length) >= 6) return 0.08;

    const authorTokens = latinTokens(author.raw || author.name);
    const aliasTokens = latinTokens(alias);
    return scoreLatinTokens(authorTokens, aliasTokens);
  }

  function confidenceForScore(score) {
    if (score === 0) return "exact";
    if (score <= 0.08) return "high";
    if (score <= 0.18) return "medium";
    if (score <= 0.35) return "low";
    return "none";
  }

  function buildAliasList(profileName, aliases) {
    return uniq([profileName].concat(aliases || []).map((value) => String(value || "").trim()));
  }

  function findBestAuthorMatch(authors, profileName, aliases) {
    const aliasList = buildAliasList(profileName, aliases);
    let best = null;

    (authors || []).forEach((author, index) => {
      aliasList.forEach((alias) => {
        const score = scoreAlias(author, alias);
        if (!best || score < best.score) {
          best = {
            author,
            alias,
            index,
            score,
            confidence: confidenceForScore(score)
          };
        }
      });
    });

    if (!best || best.score > 0.35 || best.confidence === "none") return null;
    return best;
  }

  const api = {
    stripDiacritics,
    normalizeLoose,
    compactName,
    latinTokens,
    splitAuthors,
    editDistance,
    scoreAlias,
    confidenceForScore,
    buildAliasList,
    findBestAuthorMatch,
    hasHan
  };

  namespace.authorMatcher = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
