# Google Scholar First/Corresponding Metrics

A Chrome/Chromium Manifest V3 extension that adds a "First/corresponding metrics" card above the native Citations block on Google Scholar profile pages. The card is styled to match the original page (styles are copied from the native elements at runtime).

## Features

- Detects the profile author's name and parses the publication list.
- Counts papers where the author is first author, or corresponding author (last author as an approximation).
- Shows a table with rows Papers / Citations / h-index / i10-index and columns First / Corresponding / Total. The Total column matches Google Scholar's own overall numbers.
- "Load all" button to expand the full publication list via Show more.
- Truncated author lists ("…") are completed from the paper's detail page so the corresponding-author judgment stays accurate.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select this directory: `/Users/hedong/Desktop/Research/谷歌学术工具`.
5. Open a Google Scholar profile page to test.

## Verify

```bash
npm test
```
