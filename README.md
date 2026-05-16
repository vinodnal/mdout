# markfi

> **Markdown → DOCX / PDF / HTML document builder** for Node.js — write your documents in plain Markdown, configure once, compile to polished Word documents, PDFs, and more.

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![CI](https://github.com/vinodnal/markfi/actions/workflows/ci.yml/badge.svg)](https://github.com/vinodnal/markfi/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/markfi)](https://www.npmjs.com/package/markfi)

---

## Features

- **Markdown to DOCX** — headings, paragraphs, bold/italic/underline/strikethrough/code inline, `<br>` line breaks, blockquotes, bulleted and numbered lists (nested)
- **Automatic heading numbering** — H1 in Roman numerals (I, II, III…), sub-headings in hierarchical decimals (1., 1.1., 1.1.1.); opt out with `{.no-num}` on any heading
- **Tables** — pipe-syntax tables with proportional column widths, styled header row, alternating row colors; handles escaped pipes and pipes inside math/code
- **Math formulas** — `$$…$$` blocks rendered as native Word OMML equations; `$…$` inline math via Unicode; falls back gracefully with W004
- **Fenced code blocks** — styled with monospace font, code color, and accent border
- **Callout / admonition blocks** — `<!-- @style: info|warning|tip|danger|note|box|quote -->` before any paragraph or blockquote
- **Image embedding** — `![alt](path)` and `<!-- @import -->` for PNG/JPEG/GIF/WebP/BMP
- **Script-generated figures** — `<!-- @import: chart.js -->` executes a Node/Python/TS script that draws a canvas and outputs a PNG path
- **Recursive file imports** — `<!-- @import: chapter.md -->` embeds Markdown files (circular-import detection E003)
- **Word document import** — embed `.docx` files via AltChunk (`embed`) or extract text via mammoth (`extract`)
- **Template variable substitution** — define `vars` in config, reference as `{{name}}`; override per-file with `<!-- @var: key = value -->`
- **Inline styling** — `{color:X}`, `{font:Name}`, `{size:N}`, `{bg:X}`, `{style:…}` spans; shorthand `{b}`, `{i}`, `{u}`, `{s}`; superscript `^…^` and subscript `~…~`; `==highlight==`
- **Multi-section documents** — `<!-- @section: orientation: landscape | id: annexes -->` splits the document into distinct Word sections with individual page settings
- **Word bookmarks / anchors** — `<!-- @anchor: id: name -->` inserts named bookmarks for cross-references
- **Auto-numbered captions** — `<!-- @element: type: figure|table|annex | title: … -->` numbers elements globally; `<!-- @list: figures|tables|annexes -->` inserts a collected list
- **Table of contents** — `<!-- @toc -->` inserts a ToC built from all headings; configurable depth and title
- **Theme system** — full control over colors, fonts, font sizes, and spacing per project
- **Page layout** — A4 / Letter / A3 or custom mm dimensions; per-section orientation and margins; configurable page numbering format and start value
- **Cover page** — Markdown file or built-in cover builder (array of styled text entries and spacers)
- **Rich headers/footers** — simple text or full run-level control with bold/italic/color/field substitution (`PAGE_CURRENT`, `PAGE_TOTAL`); per-section override
- **Watch mode** — `--watch` debounced rebuilds while you edit; Windows-friendly file-lock retry
- **PDF generation** — via LibreOffice on Linux/macOS; tries Microsoft Word COM first on Windows; force with `--pdf-engine word|libreoffice`
- **Export to images** — `mdoc export images` converts any project's PDF to PNG/JPEG pages via pdftoppm (preferred) or Ghostscript; select pages with `--pages 1,3-5`, set DPI with `--dpi`, choose format with `--image-format`
- **Export to flat Markdown** — `markfi export md` flattens all imported Markdown files and executes figure scripts to produce a single self-contained `.md` file; ideal for AI agent ingestion

- **Machine-readable output** — `--json [path]` writes a structured result object after any export; combine with `--no-build` to skip rebuilding when DOCX is already up-to-date

## Requirements

- **Node.js** v18+
- **LibreOffice** (optional) — for PDF generation

> `canvas` requires native binaries. On Windows you may need the [GTK runtime](https://github.com/nicowillis/node-canvas-prebuilt#windows).

---

## Installation

```bash
# Install from npm
npm install -g markfi

# Or with pnpm
pnpm add -g markfi
```

### Development / from source

```bash
git clone https://github.com/vinodnal/markfi.git
cd markfi
pnpm install

# Make the markfi command available globally (optional)
pnpm install -g .
```

---

## Quick Start

```bash
# Scaffold a new project from a template
markfi init --template thesis ./my-thesis
markfi init --template report ./reports/q1

# Build a project (generates DOCX + PDF)
markfi projects/my-thesis

# DOCX only (no PDF)
markfi --no-pdf projects/my-thesis

# Verbose output with per-step timings
markfi -v projects/my-thesis

# Watch files and rebuild after changes
markfi --watch --no-pdf projects/my-thesis

# Convert an existing DOCX to PDF (no rebuild)
markfi --pdf-only projects/my-thesis

# Force Word output on Windows, or LibreOffice if you need a fallback path
markfi --pdf-engine word projects/my-thesis
markfi --pdf-engine libreoffice projects/my-thesis

# Override output path
markfi -o ./dist/output.docx projects/my-thesis

# Validate imports and variables without building
markfi validate projects/my-thesis

# Show all CLI options
markfi --help

# Export all pages as PNG images (builds DOCX → PDF → images)
markfi export projects/my-thesis

# Export specific pages at high DPI
markfi export images --pages 1,3-5 --dpi 200 projects/my-thesis

# Flatten entire document to a single Markdown file for AI agents
markfi export md --out ./thesis_flat.md projects/my-thesis

# Re-export images from an existing DOCX without rebuilding
markfi export images --no-build --pages 2- projects/my-thesis

# Export help
markfi export --help
```

---

## Project Structure

```
markfi/
├── src/
│   ├── cli.js             — CLI argument parsing and commands
│   ├── builder.js         — Assembles Document from config
│   ├── renderer.js        — Theme-aware docx element factory
│   ├── parser.js          — Markdown → docx elements
│   ├── importer.js        — @import directive handler
│   ├── canvas-utils.js    — Shared canvas drawing primitives for figure scripts
│   ├── latex.js           — LaTeX → Unicode conversion
│   ├── math.js            — Math rendering helpers (LaTeX → OMML)
│   ├── schema.js          — Config validation and defaults
│   ├── validator.js       — Pre-build validation (imports, variables)
│   ├── logger.js          — Structured logger with warning/error codes
│   ├── utils.js           — Shared utilities (retry, fs helpers)
│   ├── pdf.js             — DOCX → PDF conversion (LibreOffice / Word COM)
│   ├── index.js           — Public programmatic API
│   └── templates/         — Starter project templates (simple, report, thesis, manual)
│
├── src/
│   └── exporter/          — Export sub-modules
│       ├── images.js      — PDF → PNG/JPEG via pdftoppm / Ghostscript
│       ├── markdown.js    — Flatten MD tree to single file
│       └── pages.js       — Page range parser + executable finder
│
├── bin/
│   └── mdoc.js            — CLI executable entry point
│
├── projects/              — Your document projects (git-ignored)
│   └── my-project/
│       ├── project.config.js
│       ├── index.md
│       └── figures/
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
markfi projects/my-report
# Output: my-report.docx and my-report.pdf (if LibreOffice is available)
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
markfi [build] [options] <project-dir>
markfi export [format] [options] <project-dir>
markfi validate [--dep-graph] <project-dir|config-path>
markfi init [--template <name>] <new-dir>

Options (build):
  -h, --help              Show help and exit
      --version           Print version
  -v, --verbose           Per-step timings and debug output
  -q, --quiet             Suppress output except errors
  -p, --pdf               Generate PDF (on by default)
      --pdf-only          Convert existing DOCX to PDF without rebuild
      --no-pdf            Skip PDF generation
  -o, --out <path>        Override output path from config
      --soffice <path>    Path to soffice executable (auto-detected)
      --pdf-engine <name>  PDF engine: auto|word|libreoffice (default: auto)
      --watch             Rebuild on file changes (debounced)
      --watch-debounce N  Debounce delay in ms (default: 300)
      --var key=val       Override a project.config.js variable
      --json [path]       Write build result as JSON

Options (export):
  -f, --format <name>     images | md  (repeatable; default: both)
      --pages <spec>      Page range: 1,3-5 | 2- | -4 | all
      --image-format      png | jpg (default: png)
      --dpi <n>           Resolution in DPI (default: 150)
      --prefix <name>     Image file name prefix
      --no-build          Skip DOCX build, use existing output
      --no-cover          Omit cover from flat Markdown
      --pdftoppm <path>   Override pdftoppm binary
      --gs <path>         Override Ghostscript binary
      --json [path]       Write export result as JSON
```

**Examples:**
```bash
markfi projects/my-report                          # DOCX + PDF
markfi -v --no-pdf projects/my-report              # DOCX only, verbose
markfi --pdf-only projects/my-report               # PDF from existing DOCX
markfi -o ./dist/output.docx projects/my-report
markfi --watch projects/my-thesis                  # watch mode
markfi validate projects/my-report                 # validate only, no build
markfi init --template thesis ./new-thesis         # scaffold from template
markfi export projects/my-thesis                   # images + flat MD
markfi export images --pages 1-3 --dpi 300 projects/my-thesis
markfi export md --out ./flat.md projects/my-thesis
```

> **Note:** PDF generation uses LibreOffice by default and will try Microsoft Word COM first on Windows. Use `--pdf-engine word` to force Word, or `--pdf-engine libreoffice` to force LibreOffice. Word PDF output is configured for print-quality rendering and keeps embedded figure compression disabled when possible.

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
markfi init --template thesis projects/my-thesis
```
