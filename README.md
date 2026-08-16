# Google Scholar First/Corresponding Metrics

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](#)
[![Version](https://img.shields.io/badge/version-0.11.1-green)](#)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](#license)

A Chrome extension that augments Google Scholar author profiles with first/corresponding-author metrics, a "since &lt;year&gt;" window, per-paper venue ratings, and a per-grade statistics table — computed locally, with zero extra requests to Google.

## Features

- **Metrics card** above the native Citations block, with four columns:
  - **First** — papers where the author is the first author,
  - **Corr.** — papers where the author is the last author (approximation of corresponding author),
  - **Since <year>** — Citations / h-index / i10-index taken from Google Scholar's own "Since" column in the profile stats block; the Papers row counts papers published since that year,
  - **Total** — all papers (matches Google's own Cited by / h-index / i10-index).
  - Rows: Papers, Citations, h-index, i10-index.
- **Per-paper rating badges** injected under each paper title:
  - CCF grade, SCI (CAS) zone, and SCU (Sichuan University) grade for every matched paper;
  - top grades (CCF A, SCI zone 1, SCU A/A−/B) share one accent color, lower grades scale down;
  - hovering a badge shows the full journal/conference name from the database; journals that carry a CCF grade show their CCF abbreviation (CSS-only tooltip, no event listeners);
  - papers without any rating are left untouched.
- **Grades panel** behind a `Grades` button: per-grade counts (CCF A/B/C, SCI zones 1–4, SCU grades A–E) with First / Corr. / Papers / Since columns, plus a matched/unmatched summary line.
- **Export** (`Export` link): downloads `scholar-venue-grades.csv` — the grade summary followed by per-paper rows for auditing.
- **Load all** (`Load all` link): expands the full publication list via "Show more".
- The card actions (`Load all` / `Grades` / `Export`) are styled as blue text links.
- **Detail completion**: truncated author lists (`…`) and venue lines cut off with an ellipsis are completed from the paper's detail page, which keeps the corresponding-author judgment reliable.
- **Native styling**: the card copies Google Scholar's own computed styles at runtime.

## Matching rules

Venue matching is local and deterministic. For each paper, the venue string is the **last line of the entry**.

1. **Query name** — from the first letter up to the first terminator (a punctuation mark or a digit, not included). `&`, `/`, commas and hyphens are **not** terminators.
2. **Routing** — if the query name contains `conference` (case-insensitive), only the conference list is searched; otherwise only the journal list.
3. **Lookup** — case-insensitive and space-insensitive exact comparison against full names and abbreviations, with `&` interchangeable with `and` and commas/hyphens removed on both sides.
4. **Conference wrapper normalization** — when matching conferences, wrapper words are dropped from both sides: publisher prefixes (`IEEE/CVF`, `IEEE`, `ACM`), `Proceedings of the`, `Conference on`, `International`, `Symposium`, `Workshop`, etc.
5. **Wrapper-prefix fallback** — if the query name consists only of wrapper words (`Proceedings of the`), digit-words (`39th`, `2020`…) are skipped and the conference name after them is matched.

Known consequences of the rules:

- Conference names without the word `conference` (e.g. `Advances in Neural Information Processing Systems`) go to the journal list and stay unmatched.
- Abbreviated lines (`IEEE Trans. Pattern Anal. Mach. Intell.` → `IEEE Trans`) do not match.

## Install

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select this directory.
3. Open a Google Scholar profile page (`https://scholar.google.com/citations?user=...`).

## Project structure

```text
.
├── manifest.json                     # MV3 manifest (content scripts, WAR entry for the index)
├── data/
│   ├── scu-journals.json             # SCU journal grading (raw)
│   ├── ccf-directory.json            # CCF recommended list (raw)
│   ├── dataset.json                  # combined raw scrape
│   └── dist/venue-index.json         # compiled lookup index (bundled with the extension)
├── scripts/
│   ├── build-venue-index.js          # data/dist/venue-index.json builder
│   ├── scrape-journal-data.js        # re-scrape source CSVs
│   ├── profile-parser.js             # offline HTML parser (mirrors scholar-dom)
│   ├── fetch-profile.js              # polite fixture downloader
│   └── match-fixture.js              # offline match report
├── src/
│   ├── shared/                       # constants, storage
│   ├── content/                      # content scripts (dom, matcher, stats, UI, bootstrap)
│   ├── options/                      # options page
│   ├── popup/                        # toolbar popup
│   └── background/                   # service worker
├── styles/scholar-stat-panel.css     # panel + badge styles (fallback; native styles copied at runtime)
└── tests/profile-matching.test.js    # offline regression tests
```

## Build & test

```bash
npm run build:venues   # rebuild data/dist/venue-index.json after data changes
npm test               # matching regression tests + parser self-check (no network)
```

## Data pipeline

```text
data/scu-journals.json ─┐
                        ├─ scripts/build-venue-index.js ─▶ data/dist/venue-index.json
data/ccf-directory.json ─┘   (journals[] + confs[], precomputed folded keys)
```

The dataset comes from <https://scu-journal.east.monster/> (SCU journal grading 2021 + CCF recommended list 7th edition + CAS 2025 zones). The compiled index is bundled with the extension and fetched locally at runtime via `chrome.runtime.getURL` (declared in `web_accessible_resources`); a failed load degrades silently.

## Notes

- Author aliases are supported for background name matching only — there is deliberately no UI for them.
- The target author name is read from the profile block only (the primary name above the title); "Other names" and other profile extras are deliberately ignored.
- The `[Violation] Added non-passive event listener to a scroll-blocking 'touchstart'` warning in the DevTools console comes from Google Scholar's own page scripts, not from this extension (the extension registers no touch listeners).
- "Corresponding" is approximated by last authorship — Google Scholar does not mark corresponding authors.

## License

[MIT](LICENSE)
