(function attachRoleClassifier(root) {
  const namespace = root.ScholarAuthorStats || {};

  // 只判断两个角色：一作（排名第一）与尾作（排名最后，近似通讯作者）。
  function classifyRecord({ match, authors, authorsComplete }) {
    const complete = authorsComplete !== false;
    const list = authors || [];
    const rankedFirst = Boolean(match && match.index === 0);
    const rankedLast = Boolean(
      match &&
      complete &&
      list.length > 0 &&
      match.index === list.length - 1
    );

    return {
      rankedFirst,
      rankedLast,
      matched: Boolean(match)
    };
  }

  const api = {
    classifyRecord
  };

  namespace.roleClassifier = api;
  root.ScholarAuthorStats = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
