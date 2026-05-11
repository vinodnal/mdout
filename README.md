# doc-builder

A generic **Markdown → DOCX** document building framework for Node.js.

Write your document content in Markdown, configure a project with a `project.config.js`, and run a single command to produce a polished `.docx` (and optionally a PDF via LibreOffice).

---

## Features

- **Markdown to DOCX** — headings, paragraphs, bold/italic/code inline, inline `<br>` line breaks, blockquotes, bulleted and numbered lists
- **Automatic heading numbering** — H1 headings numbered in Roman numerals (I, II, III…), sub-headings in hierarchical decimals (1., 1.1., 1.1.1.); add `{.no-num}` to any heading to opt out
- **Tables** — pipe-syntax tables with proportional column widths, styled header row, alternating row colors
- **Robust table parsing** — escaped pipes (`\\|`) and pipes inside inline math/code do not break table cells
- **Math formulas** — `$$LaTeX$$` blocks rendered with Unicode fallback
- **Fenced code blocks** — styled with monospace font and accent border
- **Image embedding** — `![alt](path)` and `@import` directives for PNG/JPEG
- **Script-generated figures** — `@import` can run a `.js` script that draws and outputs a PNG (via `canvas`)
- **File imports** — `@import` can embed other `.md` files inline (recursive)
- **Theme system** — configure colors, fonts, and font size per project
- **Page layout** — A4 / Letter / A3 or custom size, configurable margins
- **Cover page** — a regular Markdown file rendered as a separate cover section with the same parser as body pages
- **Header & footer** — with automatic page numbers
- **Watch mode** — debounced rebuilds while you edit, with Windows-friendly file-lock handling
- **Auto-numbered element titles** — figures, tables, and annex titles can be declared with a type tag and numbered automatically

---

## Requirements

- **Node.js** v18+
- **npm** packages: `docx`, `canvas` (install once at root)

```bash
npm install
```

> `canvas` requires native binaries. On Windows you may need the [GTK runtime](https://github.com/nicowillis/node-canvas-prebuilt#windows).

---

## Quick Start

```bash
# Build a project (generates DOCX + PDF)
node build.js projects/etude-bibliographique

# Output: projects/etude-bibliographique/etude_bibliographique.docx
#         projects/etude-bibliographique/etude_bibliographique.pdf

# Show help and all CLI options
node build.js --help

# Build with verbose logging and timings
node build.js -v projects/etude-bibliographique

# Watch files and rebuild after changes settle
node build.js --watch --no-pdf projects/etude-bibliographique

# Generate a real table of contents page in Markdown
<!-- @toc -->

# Auto-number a figure, table, or annex title
<!-- @element: figure | title: Comparaison des performances -->
<!-- @element: table | title: Indicateurs globaux -->
<!-- @element: annex | title: Structure du jeu de donnees exploite -->

# Build DOCX only (skip PDF)
node build.js --no-pdf projects/etude-bibliographique

# Convert an existing DOCX to PDF
node build.js --pdf-only projects/etude-bibliographique
```

---

## Project Structure

```
doc-builder/
├── src/
│   ├── renderer.js        — Theme-aware docx element factory
│   ├── parser.js          — Markdown → docx elements
│   ├── importer.js        — @import directive handler
│   ├── builder.js         — Assembles Document from config
│   ├── canvas-utils.js    — Shared canvas drawing primitives for figure scripts
│   ├── latex.js           — LaTeX → Unicode conversion
│   ├── math.js            — Math rendering helpers
│   ├── schema.js          — Config validation and defaults
│   ├── validator.js       — Input validation utilities
│   ├── logger.js          — Logging utilities
│   ├── pdf.js             — DOCX → PDF conversion
│   ├── cli.js             — CLI argument parsing
│   ├── index.js           — Public API
│   └── templates/         — Starter project templates
│
├── bin/
│   └── mdoc.js            — Executable entry point
│
├── build.js               — Convenience CLI wrapper
│
├── projects/
│   └── my-project/
│       ├── project.config.js   ← required
│       ├── index.md
│       └── figures/
│           └── chart.js
│
├── package.json
└── node_modules/
```

---

## Creating a New Project

1. Create a new folder under `projects/`:

```bash
mkdir projects/my-report
```

2. Add a `project.config.js` with the **nested schema** (see [USAGE.md](USAGE.md) for full schema reference):

```js
module.exports = {
  name:   'My Report',
  input:  './content.md',
  output: './my-report.docx',
  
  meta: {
    author:   'My Organization',
    subject:  'Report subject',
    keywords: ['report', 'analysis'],
    language: 'en-US',
  },

  page: {
    size:    'A4',                      // A4 | Letter | A3 | { width: 210, height: 297 }
    margins: 25,                        // mm — uniform or { top, right, bottom, left }
    pageNumbers: { start: 1, format: 'decimal' },
  },

  // Optional default paragraph/heading alignment when not explicitly set in Markdown.
  defaultAlignment: 'justify',          // left | center | right | justify

  theme: {
    colors: {
      primary:     '1F3864',  // H1, table header fill, cover titles
      secondary:   '2E4C7E',  // H2
      accent:      '2E75B6',  // H3, links, code/math borders
      h4:          '4472C4',  // H4
      body:        '1A1A1A',  // body text
      note:        '555555',  // captions, blockquotes
      code:        '2D2D2D',  // inline code and code blocks
      codeBg:      'F5F5F5',  // code block background
      rowAlt:      'EBF2FA',  // alternating table rows
      headerText:  'FFFFFF',  // table header text color
      mathBg:      'EEF4FB',  // $$math$$ background
      tableBorder: 'AAAAAA',  // table borders
    },
    fonts: {
      body: 'Calibri',
      code: 'Courier New',
      math: 'Cambria Math',
    },
    fontSize: {
      body: 11, h1: 18, h2: 14, h3: 12, h4: 11,
      caption: 9, code: 9, header: 9, footer: 9,
    },
    spacing: {
      paragraphLine: 320,      // 1.33× line height
      paragraphAfter: 120,     // gap after paragraphs
      bulletAfter: 80,         // gap after bullets
      codeLineSpacing: 220,    // tighter in code blocks
      headings: {
        h1: { before: 480, after: 240 },
        h2: { before: 360, after: 180 },
        h3: { before: 280, after: 140 },
        h4: { before: 200, after: 100 },
      },
    },
  },

  cover: [
    { text: 'My Organization', style: 'institution' },
    { spacer: 600 },
    { text: 'MY REPORT TITLE', style: 'banner' },
    { text: 'Subtitle line', style: 'subtitle' },
    { spacer: 800 },
    { text: '2025 / 2026', style: 'year' },
  ],

  // Simple mode (backward compatible)
  // header: { text: 'My Report — Section Title', align: 'center' },
  // footer: { text: 'Organization Name — 2026', align: 'center', showPageNumbers: true },

  // Rich mode: complex formatting + dynamic fields
  header: {
    align: 'center',
    paragraphs: [
      {
        runs: [
          { text: 'My Report — Section Title', bold: true, size: 9, color: '2E4C7E' },
          { text: ' | ', color: '555555' },
          { text: 'Confidential', italics: true, color: '555555' },
        ],
      },
    ],
  },
  footer: {
    align: 'center',
    paragraphs: [
      {
        runs: [
          { text: 'Organization Name — 2026  ', color: '555555' },
          { field: 'PAGE_CURRENT', bold: true, color: '2E75B6' },
          { text: ' / ', color: '555555' },
          { field: 'PAGE_TOTAL', color: '555555' },
        ],
      },
    ],
  },
};
```

3. Write `content.md` using standard Markdown (see [Markdown Syntax](#markdown-syntax) above).

4. Build:

```bash
node build.js projects/my-report
# Output: my-report.docx and my-report.pdf
```

For detailed config schema and advanced features, see [USAGE.md](USAGE.md).

---

## Cover Entry Styles

| Style          | Description                          |
|----------------|--------------------------------------|
| `overline`     | Small grey text (e.g. country name)  |
| `institution`  | Bold navy, medium size               |
| `banner`       | Large bold all-caps                  |
| `title`        | Large bold title                     |
| `subtitle`     | Medium secondary color               |
| `chapterTitle` | Medium accent color                  |
| `year`         | Small italic grey                    |

Use `{ spacer: N }` (N in DXA units, ~570 DXA per cm) to add vertical space.

---

## Page Sizes

| Key      | Dimensions          |
|----------|---------------------|
| `A4`     | 210 × 297 mm        |
| `Letter` | 215.9 × 279.4 mm    |
| `A3`     | 297 × 420 mm        |

Or pass `{ size: { width: 210, height: 297 }, margins: 25 }` for custom sizes (in mm).

---

## @import Directive

Use in Markdown to embed external content at build time:

```markdown
<!-- @import: ./figures/chart.js | caption: Figure 1 — My chart | width: 560 -->
<!-- @import: ./images/photo.png | caption: Figure 2 | width: 400 -->
<!-- @import: ./appendix.md -->
```

**Script figures** (`*.js`): The script must write a PNG to disk and print the file path to stdout (no newline). Use `src/canvas-utils.js` helpers:

```js
const u = require('../../../src/canvas-utils');
const { createCanvas } = u;
const path = require('path');

const OUT = path.join(__dirname, '_chart.png');
const canvas = createCanvas(800, 400);
const ctx = canvas.getContext('2d');

// ... draw your chart ...

u.saveAndPrint(canvas, OUT);
```

---

## CLI Reference

```
node build.js [options] <project-dir>

Options:
  -h, --help           Show help and exit
  --version            Print version
  -v, --verbose        Per-step timings and debug output
  -q, --quiet          Suppress output except errors
  -p, --pdf            Generate PDF (on by default)
  --pdf-only           Convert existing DOCX to PDF without rebuild
  --no-pdf             Skip PDF generation
  -o, --out <path>     Override output path from config
  --soffice <path>     Path to soffice executable (auto-detected)
```

**Examples:**
```bash
node build.js projects/my-report              # DOCX + PDF
node build.js -v --no-pdf projects/my-report  # DOCX only, verbose
node build.js --pdf-only projects/my-report   # PDF from existing DOCX
node build.js -o ./dist/output.docx projects/my-report
```

> **Note:** PDF generation requires [LibreOffice](https://www.libreoffice.org/) and `soffice` on PATH.

---

## Advanced Topics

See **[USAGE.md](USAGE.md)** for:
- Complete config schema reference with all options
- `@import` directive guide (images, files, scripts)
- Figure generation with `canvas-utils`
- Troubleshooting and common errors
- Validation error messages and fixes

---

## canvas-utils API

Shared helpers for figure scripts (from `src/canvas-utils.js`):

| Function | Description |
|---|---|
| `createCanvas(w, h)` | Create a canvas (re-exported from `canvas`) |
| `background(ctx, w, h, color?)` | Fill background |
| `title(ctx, text, x, y, opts?)` | Draw a title label |
| `chartArea(W, H, margin?)` | Compute `{ cW, cH, ox, oy }` |
| `hGrid(ctx, ox, oy, cW, cH, ticks, opts?)` | Horizontal grid lines + Y labels |
| `axes(ctx, ox, oy, cW, cH, opts?)` | Draw X/Y axes with optional arrow |
| `roundRect(ctx, x, y, w, h, r?)` | Rounded rectangle path (call `ctx.fill()` after) |
| `drawBox(ctx, x, y, w, h, lines, fill, textColor?, opts?)` | Labeled rounded box |
| `drawArrow(ctx, x1, y1, x2, y2, opts?)` | Arrow with arrowhead and optional label |
| `drawDot(ctx, x, y, r?, fill?, stroke?)` | Circle dot |
| `rotatedLabel(ctx, text, x, y, angleDeg, opts?)` | Rotated text |
| `saveAndPrint(canvas, outPath)` | Write PNG and print path to stdout |

---

## Markdown Syntax

| Feature | Syntax | Notes |
|---|---|---|
| Headings | `# H1`, `## H2`, `### H3`, `#### H4` | Colored and sized per theme |
| Paragraphs | Plain text | Wrapped and justified |
| Bold | `**text**` or `__text__` | |
| Italic | `*text*` or `_text_` | |
| Code inline | `` `code` `` | Monospace, theme colors |
| Code blocks | `` ```language\ncode\n``` `` | With border and background |
| Math inline | `$LaTeX$` | Rendered with Unicode fallback |
| Math blocks | `$$LaTeX$$` or `$$\nformula\n$$` | Centered, shaded |
| Links | `[text](url)` | Clickable hyperlinks |
| Line break | `<br>`, `<br/>`, `<br />` | Inline hard line break inside a paragraph |
| Images | `![alt](path/to/image.png)` | Embedded at full width |
| Tables | Pipe-delimited rows | Styled header, alternating rows |
| Blockquotes | `> quote text` | Indented, accent color |
| Bullets | `- item` or `* item` | Indented, nested (4 spaces per level) |
| Numbered | `1. item`, `2. item` | Auto-numbered |
| Page break | `---` or `***` or `___` | Standalone line |
| Captions | `*Figure N — description` | After images/tables |

For full examples, see [USAGE.md](USAGE.md).

---

## Included Templates

Starter templates are available under `src/templates/`:

| Template | Description |
|----------|-------------|
| `thesis` | Full academic thesis with cover, TOC, numbered chapters |
| `report` | Professional report with cover and section structure |
| `simple` | Single-file minimal document |
| `manual` | Technical manual with appendices |

Create a new project from a template:

```bash
node build.js --init thesis projects/my-thesis
```
