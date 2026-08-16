# 谷歌学术一作/尾作引用统计插件 — 开发计划

> 本项目用于开发一个 Chrome 插件，在 Google Scholar 作者主页上新增一个统计卡片，仅统计“作者为一作”和“作者为尾作（近似通讯作者）”的论文引用量，并计算 h-index、i10-index。可选支持扣除自引。

---

## 1. 项目目标

在 Google Scholar 作者主页 `https://scholar.google.com/citations?user=...` 中：

- 自动识别当前作者姓名。
- 解析该作者所有论文列表。
- 只统计当前作者为 **第一作者** 或 **最后作者** 的论文。
- 对这类论文计算：
  - 总被引次数
  - h-index
  - i10-index
- 以与 Google Scholar 原有样式一致的卡片展示。
- 可选：提供“扣除自引”按钮，展示扣除自引后的指标。

---

## 2. 技术方案

### 2.1 插件类型

- Chrome Extension Manifest V3
- 主要使用 Content Script 注入页面
- 通过同源 `fetch` 请求 Google Scholar 引用列表页，解析自引数据

### 2.2 文件结构

```
scholar-first-last-metrics/
├── manifest.json
├── content.js
├── styles.css
└── README.md
```

### 2.3 manifest.json 示例

```json
{
  "manifest_version": 3,
  "name": "Scholar First/Last Author Metrics",
  "version": "0.1.0",
  "description": "统计 Google Scholar 中一作/尾作论文的引用指标",
  "host_permissions": ["https://scholar.google.com/*"],
  "content_scripts": [
    {
      "matches": ["https://scholar.google.com/citations*"],
      "js": ["content.js"],
      "css": ["styles.css"],
      "run_at": "document_idle"
    }
  ]
}
```

---

## 3. 页面解析与数据获取

### 3.1 当前作者姓名

优先选择以下 DOM：

| 说明 | 选择器 |
|------|--------|
| 作者姓名容器 | `#gsc_prf_in` |

取其中的第一个文本节点或第一行文本，避免包含单位信息。

示例处理：

```js
const nameEl = document.querySelector('#gsc_prf_in');
const profileName = nameEl ? nameEl.childNodes[0].textContent.trim() : '';
```

### 3.2 论文列表

Google Scholar 作者主页的论文表格：

| 说明 | 选择器 |
|------|--------|
| 每篇论文行 | `#gsc_a_b .gsc_a_tr` |
| 论文标题 | `.gsc_a_at` |
| 作者与期刊行 | `.gs_gray` |
| 被引次数 | `.gsc_a_ac` |
| 年份 | `.gsc_a_y` |

示例解析：

```js
const rows = document.querySelectorAll('#gsc_a_b .gsc_a_tr');

const articles = [];

rows.forEach(row => {
  const title = row.querySelector('.gsc_a_at')?.textContent.trim() || '';
  const gray = row.querySelector('.gs_gray')?.textContent.trim() || '';
  const authorsText = gray.split('-')[0].trim();
  const citeText = row.querySelector('.gsc_a_ac')?.textContent.trim() || '0';
  const citations = parseInt(citeText.replace(/\D/g, ''), 10) || 0;

  articles.push({
    title,
    authorsText,
    citations,
    citeLink: row.querySelector('.gsc_a_ac')?.getAttribute('href') || ''
  });
});
```

### 3.3 姓名匹配

Google Scholar 作者列表可能是缩写形式，例如 `J Smith`、`Smith J`、`J. Smith`。
注意谷歌界面中超过五人以上，尾作的名字就不显示，此时就要去详细页中去寻找

建议实现 `normalizeName`：

```js
function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // 去重音
    .replace(/[^a-z\s]/g, ' ')       // 去标点
    .replace(/\s+/g, ' ')
    .trim();
}
```

判断是否为当前作者：

```js
function isSameAuthor(authorSegment, profileName) {
  const a = normalizeName(authorSegment);
  const p = normalizeName(profileName);
  if (!a || !p) return false;

  // 完全包含
  if (a.includes(p) || p.includes(a)) return true;

  // 姓氏 + 首字母匹配
  const pParts = p.split(' ');
  const aParts = a.split(' ');
  if (pParts.length >= 2 && aParts.length >= 2) {
    const pLastName = pParts[pParts.length - 1];
    const aLastName = aParts[aParts.length - 1];
    const pInitial = pParts[0][0];
    const aInitial = aParts[0][0];
    if (pLastName === aLastName && pInitial === aInitial) return true;
  }

  return false;
}
```

---

## 4. 核心统计逻辑

### 4.1 识别一作与尾作

对每篇论文的作者字符串按逗号分隔：

```js
const authorList = authorsText.split(',').map(s => s.trim());
const firstAuthor = authorList[0] || '';
const lastAuthor = authorList[authorList.length - 1] || '';
```

判断：

```js
const isFirst = isSameAuthor(firstAuthor, profileName);
const isLast = isSameAuthor(lastAuthor, profileName);
```

注意：

- 单作者论文会同时满足 `isFirst` 和 `isLast`。
- 在“合计”统计时需要去重。

### 4.2 论文筛选

```js
const firstArticles = articles.filter(a => a.isFirst);
const lastArticles = articles.filter(a => a.isLast);
const unionArticles = articles.filter(a => a.isFirst || a.isLast);
```

### 4.3 指标计算

给定一个论文列表，提取引用数数组：

```js
function calcMetrics(articleList) {
  const citations = articleList
    .map(a => a.citations)
    .sort((a, b) => b - a);

  const total = citations.reduce((sum, c) => sum + c, 0);

  let h = 0;
  for (let i = 0; i < citations.length; i++) {
    if (citations[i] >= i + 1) {
      h = i + 1;
    } else {
      break;
    }
  }

  const i10 = citations.filter(c => c >= 10).length;

  return { total, h, i10 };
}
```

---

## 5. UI 设计

### 5.1 插入位置

在 Google Scholar 原有统计卡片 `#gsc_rsb_st` 之后插入统计卡片。

如果该元素不存在，则在作者信息右侧区域插入。

### 5.2 卡片内容

卡片标题：`一作/尾作指标`

表格列：

| 指标 | 一作 | 尾作 | 合计 |
|------|------|------|------|
| 被引次数 | 123 | 456 | 579 |
| h指数 | 5 | 8 | 10 |
| i10指数 | 4 | 7 | 9 |

可选按钮：`扣除自引` / `恢复原始值`

### 5.3 样式要求

复用 Google Scholar 原有视觉风格：

```css
.sf-metrics-card {
  font-family: Arial, sans-serif;
  font-size: 13px;
  background: #fff;
  border: 1px solid #e5e5e5;
  padding: 12px;
  margin: 12px 0;
  color: #222;
}

.sf-metrics-card table {
  border-collapse: collapse;
  width: 100%;
}

.sf-metrics-card th,
.sf-metrics-card td {
  padding: 6px 10px;
  text-align: center;
  border-bottom: 1px solid #eee;
}

.sf-metrics-card th {
  font-weight: bold;
  color: #777;
}

.sf-metrics-card td {
  font-weight: bold;
  font-size: 15px;
}
```

要求：

- 字体、颜色、边框尽量与 Google Scholar 一致。
- 卡片不显眼，但信息清晰。
- 不使用外部 UI 库，保持简洁。

---

## 6. 自引扣除方案（可选增强）

### 6.1 思路

Google Scholar 每篇论文的“被引次数”链接指向其引用列表页，例如：

```
/scholar?cites=1234567890&hl=en
```

该页面按每页 10 条显示引用该论文的文献。通过解析每条引用文献的作者，判断是否包含当前作者姓名。如果包含，则记为一次自引。

### 6.2 实现步骤

1. 用户在统计卡片点击“扣除自引”。
2. 插件遍历所有一作/尾作论文。
3. 对每篇论文，抓取其引用列表页。
4. 解析引用条目，统计自引次数。
5. 从该论文的引用数中扣除自引数。
6. 用扣除后的引用数重新计算总被引、h-index、i10-index。
7. 在卡片中展示“扣除自引后”的指标。

### 6.3 引用列表解析

Google Scholar 引用列表页中，每篇引用文献通常包含：

| 说明 | 选择器 |
|------|--------|
| 引用条目 | `.gs_ri` |
| 作者信息 | `.gs_a` |

示例：

```js
function parseCitationItems(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = doc.querySelectorAll('.gs_ri');
  return Array.from(items).map(item => {
    const authors = item.querySelector('.gs_a')?.textContent || '';
    return { authors };
  });
}
```

判断是否为自引：

```js
function isSelfCitation(item, profileName) {
  const authorText = item.authors.split('-')[0].trim();
  const authorList = authorText.split(',').map(s => s.trim());
  return authorList.some(author => isSameAuthor(author, profileName));
}
```

### 6.4 分页处理

引用列表 URL 支持 `start` 参数：

```
/scholar?cites=1234567890&hl=en&start=10
```

每页 10 条。需要循环抓取，直到某页条目为空。

示例：

```js
async function countSelfCitations(citeLink, profileName) {
  let selfCount = 0;
  let start = 0;
  const baseUrl = `https://scholar.google.com${citeLink}`;

  while (true) {
    const url = start === 0 ? baseUrl : `${baseUrl}&start=${start}`;
    const res = await fetch(url);
    const html = await res.text();
    const items = parseCitationItems(html);
    if (!items.length) break;

    items.forEach(item => {
      if (isSelfCitation(item, profileName)) {
        selfCount++;
      }
    });

    start += 10;
    if (start > 100) break; // 防止过多请求，可调整
  }

  return selfCount;
}
```

### 6.5 性能与限制

- 一作/尾作论文数量较多时，逐篇抓取引用列表可能较慢。
- 建议限制并发为 3–5 个请求。
- 建议在请求间增加 300–500ms 延迟，降低被限流风险。
- 如果某篇论文引用数过多，可设置最多抓取前 100 条引用作为自引估计。
- 该功能标记为“实验性”，不保证完全精确。

---

## 7. 开发步骤

1. 创建 `manifest.json`，配置插件基本信息与权限。
2. 编写 `content.js`：
   - 等待 DOM 加载完成。
   - 获取当前作者姓名。
   - 解析论文列表。
   - 筛选一作/尾作论文。
   - 计算指标。
   - 注入统计卡片。
3. 编写 `styles.css`，使卡片样式与 Google Scholar 一致。
4. 测试基础统计是否准确。
5. 可选：实现“扣除自引”按钮及相关逻辑。
6. 在多个 Google Scholar 作者主页上测试，确保 DOM 解析鲁棒。

---

## 8. 验收标准

- 插件仅在 Google Scholar 作者主页生效。
- 页面加载后自动出现统计卡片。
- 卡片样式与 Google Scholar 原有界面协调。
- 统计结果仅包含当前作者为一作或尾作的论文。
- 总被引、h-index、i10-index 计算正确。
- 单作者论文不会被重复计入合计。
- 扣除自引功能（如实现）可正常计算并展示。
- 对异常页面（如无论文、作者名缺失）不报错。

---

## 9. 注意事项

- Google Scholar 的 HTML 结构可能变化，选择器需做空值判断。
- 当前作者姓名可能包含单位信息，需要只取姓名部分。
- 尾作不等同于通讯作者，Google Scholar 未标注通讯作者，本项目以“最后作者”近似。
- 自引扣除依赖 Google Scholar 引用列表页的可访问性，若 Google 调整页面结构需同步更新。
- 仅为个人学术统计用途，请控制请求频率，遵守 Google Scholar 服务条款。