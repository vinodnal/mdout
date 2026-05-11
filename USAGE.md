# mdoc Usage Guide

**mdoc** — Markdown → Word/PDF document builder.  
Write documents in Markdown, import images/scripts/other docs, compile to professional DOCX and PDF.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [CLI Reference](#cli-reference)
3. [Config Schema](#config-schema)
4. [Markdown Syntax](#markdown-syntax)
5. [Block Directives](#block-directives)
6. [Inline Syntax](#inline-syntax)
7. [@import Directive](#import-directive-1)
8. [Figure Scripts](#figure-scripts)
9. [Export Command](#export-command)
10. [Programmatic API](#programmatic-api)
11. [Troubleshooting](#troubleshooting)
12. [Example Configurations](#example-configurations)

---

## Getting Started

### Installation (as a project dependency)

```bash
npm install mdoc
```

### Running locally (from the workspace root)

```bash
# from this repository checkout:
node bin/mdoc.js <project-dir>
# or, if installed globally / via npx:
mdoc <project-dir>
```

### Scaffold a new project

```bash
mdoc init --template report ./projects/my-report
cd ./projects/my-report
mdoc build .
```

Available templates: `simple` | `report` | `thesis` | `manual`

---

## CLI Reference

### Commands

```
mdoc [build] [options] <project-dir>     Build DOCX (and optionally PDF)
mdoc export [format] [options] <project-dir>  Export to images or flat Markdown
mdoc validate [options] <project-dir>    Validate imports and variables without building
mdoc init [options] <new-dir>            Scaffold a new project from a template
```

When no command is given and the first argument is a path, `build` is assumed.

---

### `mdoc build` (default)

```bash
mdoc [build] [options] <project-dir>
```

**Options:**

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--help` | `-h` | Show help | — |
| `--verbose` | `-v` | Per-step timings and debug output | off |
| `--quiet` | `-q` | Suppress all output except errors | off |
| `--pdf` | `-p` | Generate PDF after DOCX (requires LibreOffice) | off |
| `--pdf-only` | | Convert existing DOCX to PDF, skip rebuild | — |
| `--no-pdf` | | Skip PDF generation | — |
| `--out <path>` | `-o` | Override output path from config | uses config |
| `--soffice <path>` | | Custom path to `soffice` executable | auto-detect |
| `--watch` | | Rebuild on file changes | off |
| `--watch-debounce <ms>` | | Debounce delay for watch mode | 300 ms |
| `--var <key=value>` | | Override a `project.config.js` variable (repeatable) | — |
| `--json [path]` | | Write build result as JSON to path (omit path → stdout) | — |

**Examples:**

```bash
# DOCX + PDF
mdoc -p projects/my-thesis

# Watch mode, no PDF (faster rebuild loop)
mdoc --watch --no-pdf projects/my-thesis

# Verbose with custom output
mdoc -v -o ./dist/final.docx projects/my-thesis

# PDF from existing DOCX without rebuilding
mdoc --pdf-only projects/my-thesis

# Custom LibreOffice path (Windows)
mdoc --soffice "C:\Program Files\LibreOffice\program\soffice.exe" -p projects/my-thesis

# Override project variables
mdoc --var year=2027 --var author="Jane Smith" projects/my-thesis

# Write result JSON for pipeline use
mdoc --json ./result.json projects/my-thesis
```

---

### `mdoc validate`

Crawl all imports recursively and report errors/warnings without producing output files.

```bash
mdoc validate [--dep-graph] <project-dir|project.config.js>
```

**Options:**

| Flag | Description |
|------|-------------|
| `--dep-graph` | Write import dependency graph to `dependency.json` |

**Exit codes:** `0` = no errors, `1` = validation errors found.

**Checks performed:**
- E001 — Missing files referenced by `@import`
- E003 — Circular import chains
- W003 — `{{varName}}` references with no matching variable in config or document

---

### `mdoc init`

Scaffold a new project directory from a built-in template.

```bash
mdoc init [--template <name>] <new-dir>
```

**Templates:**

| Name | Description |
|------|-------------|
| `simple` | Single-file document, minimal config |
| `report` | Multi-chapter report with cover, introduction, results, conclusion |
| `thesis` | Full academic thesis (dedication, abstract, chapters, annexes, references) |
| `manual` | Technical manual with sections |

```bash
mdoc init ./my-doc                          # simple template (default)
mdoc init --template report ./reports/q1
mdoc init --template thesis ./thesis
```

---

### `mdoc export`

Export a built project to image files (one per PDF page) and/or a single flat Markdown file. Designed for AI agent document ingestion and automated pipelines.

```bash
mdoc export [format] [options] <project-dir>
```

**Formats** — one or more, space-separated or via `-f`:

| Format | Alias | Description |
|--------|-------|-------------|
| `images` | `png` / `jpg` | Convert each PDF page to a PNG or JPEG file |
| `md` | `markdown` | Flatten the entire Markdown tree to one file |

If no format is given, both `images` and `md` are produced.

When exporting both formats in one command, avoid `--out` because images expect an output directory while markdown expects a file path.

**Shared options:**

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--help` | `-h` | Show export help | — |
| `--verbose` | `-v` | Verbose output | off |
| `--quiet` | `-q` | Suppress output except errors | off |
| `--format <name>` | `-f` | Explicit format (repeatable) | — |
| `--out <path>` | `-o` | Output directory (images) or file (md) | auto |
| `--no-build` | | Skip DOCX/PDF build, use existing output | off |
| `--soffice <path>` | | Override LibreOffice soffice path | auto |
| `--var <key=value>` | | Override a config variable (repeatable) | — |
| `--json [path]` | | Write export result as JSON | — |

**Images options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--pages <spec>` | Pages to export: `1,3-5,7` \| `2-` \| `-4` \| `all` | all |
| `--image-format <fmt>` | `png` or `jpg` | `png` |
| `--dpi <n>` | Resolution in dots per inch | `150` |
| `--prefix <name>` | Output file name prefix | project name |
| `--pdftoppm <path>` | Override pdftoppm binary path | auto-detect |
| `--gs <path>` | Override Ghostscript binary path | auto-detect |

**Markdown options:**

| Flag | Description |
|------|-------------|
| `--no-cover` | Omit `cover.md` from the flat output |

**Page spec syntax:**

| Spec | Meaning |
|------|---------|
| `all` | All pages (default) |
| `1,3,5` | Pages 1, 3, 5 |
| `2-5` | Pages 2 through 5 |
| `3-` | Page 3 to end |
| `-4` | Pages 1 through 4 |
| `1,4-6,9` | Mixed: pages 1, 4, 5, 6, 9 |

**Output locations** (defaults when `--out` is not set):
- Images: `<project-dir>/export/images/`
- Flat MD: `<project-dir>/<name>_flat.md`

**PDF-to-image tools:** `pdftoppm` (from poppler-utils, preferred) is tried first. Ghostscript (`gswin64c` on Windows, `gs` on Unix) is used as fallback. Install poppler:
- **Windows:** `winget install GnuWin32.Poppler` or via Chocolatey `choco install poppler`
- **macOS:** `brew install poppler`
- **Linux:** `sudo apt-get install poppler-utils`

**Examples:**

```bash
# Export both images and flat MD (full build included)
mdoc export projects/my-thesis

# Images only, pages 1–5 at 200 DPI as JPEG
mdoc export images --pages 1-5 --dpi 200 --image-format jpg projects/my-thesis

# Export a specific single page
mdoc export images --pages 7 projects/my-thesis

# Flat Markdown without cover, custom output path
mdoc export md --no-cover --out ./ai-input/thesis.md projects/my-thesis

# Re-export images from existing build (no rebuild)
mdoc export images --no-build --dpi 150 projects/my-thesis

# Both formats, write JSON manifest for CI pipeline
mdoc export --no-build --json ./export-result.json projects/my-thesis

# Override a variable then export
mdoc export md --var year=2027 projects/my-thesis
```

**JSON result structure** (when `--json` is used):

```json
{
  "formats": ["images", "md"],
  "images": [
    { "page": 1, "path": "/abs/path/to/page-001.png" },
    { "page": 2, "path": "/abs/path/to/page-002.png" }
  ],
  "markdown": {
    "outputPath": "/abs/path/to/thesis_flat.md",
    "byteLength": 142831
  },
  "elapsedMs": 3210
}
```

---

## Config Schema

Every project needs a `project.config.js` at the project root that exports a configuration object.

```javascript
module.exports = {
  // Required
  name:   'string',   // Human-readable document name
  input:  'string',   // Path to root .md file (relative to project dir)
  output: 'string',   // Output .docx path (relative to project dir)

  // Optional
  meta:     { ... },  // DOCX core properties
  page:     { ... },  // Page size, margins, page numbers
  defaultAlignment: 'justify', // Optional: left | center | right | justify
  theme:    { ... },  // Colors, fonts, sizes, spacing
  vars:     { ... },  // Template variables for {{name}} substitution
  cover:    './cover.md',  // Cover page (string path or array of entries)
  header:   { ... } | 'string',
  footer:   { ... } | 'string',
  sections: [ ... ],  // Per-section overrides (orientation, margins, header, footer)
};
```

---

### Required Fields

#### `name` (string)

Document title. Shown during build and stored in DOCX core properties.

```js
name: 'Annual Report 2026',
```

#### `input` (string)

Path to the root Markdown file, relative to the project directory.

```js
input: './index.md',
input: './chapters/main.md',
```

#### `output` (string)

Path where the DOCX will be written, relative to the project directory.

```js
output: './report.docx',
output: './dist/thesis_final.docx',   // dist/ is created if needed
```

---

### `meta` (object)

DOCX core properties (File → Properties in Word).

```js
meta: {
  author:   'Jane Smith, University',
  subject:  'Annual performance analysis',
  keywords: ['AI', 'analysis', '2026'],   // array of strings
  language: 'en-US',                      // BCP-47 tag; default: 'fr-FR'
},
```

---

### `page` (object)

Page layout and numbering.

```js
page: {
  size:    'A4',           // 'A4' | 'Letter' | 'A3' | { width: mm, height: mm }
  margins: 25,             // mm — uniform, or { top, right, bottom, left }
  pageNumbers: {
    start:  1,             // first page number in body section
    format: 'decimal',     // decimal | upperRoman | lowerRoman | upperLetter | lowerLetter
  },
},
```

**Defaults:** A4, 25 mm uniform margins, decimal page numbers starting at 1.

---

### `defaultAlignment` (string, optional)

Sets the default alignment used for plain paragraphs/headings when Markdown does not specify alignment with modifiers such as `{.left}`, `{.center}`, or `{.right}`.

```js
defaultAlignment: 'justify',   // left | center | right | justify
```

Accepted values: `left`, `center`, `right`, `justify`, `justified`.

---

### `theme` (object)

Complete visual theme — colors, fonts, sizes, and spacing.

#### `theme.colors`

All color values are 6-digit hex strings **without** the `#` prefix.

```js
theme: {
  colors: {
    primary:     '1F3864',   // H1, table headers, cover titles
    secondary:   '2E4C7E',   // H2
    accent:      '2E75B6',   // H3, links, code borders
    h4:          '4472C4',   // H4
    body:        '1A1A1A',   // body text
    note:        '555555',   // captions, blockquotes, footer secondary
    code:        '2D2D2D',   // inline code / code block text
    codeBg:      'F5F5F5',   // code block background
    rowAlt:      'EBF2FA',   // alternating table row background
    headerText:  'FFFFFF',   // table header text
    mathBg:      'EEF4FB',   // math block background
    tableBorder: 'AAAAAA',   // table cell borders
    // Callout / admonition colors
    info:        '1565C0',   infoBg:    'E3F2FD',
    warning:     'E65100',   warningBg: 'FFF3E0',
    tip:         '2E7D32',   tipBg:     'E8F5E9',
    danger:      'B71C1C',   dangerBg:  'FFEBEE',
    noteBg:      'F5F5F5',
  },
},
```

#### `theme.fonts`

```js
theme: {
  fonts: {
    body: 'Calibri',       // main document font
    code: 'Courier New',   // monospace for code blocks
    math: 'Cambria Math',  // math formula font (recommended)
  },
},
```

#### `theme.fontSize` (in points)

```js
theme: {
  fontSize: {
    body: 11, h1: 18, h2: 14, h3: 12, h4: 11,
    caption: 9, code: 9, header: 9, footer: 9,
  },
},
```

#### `theme.spacing` (in DXA units — 1 inch = 1440 DXA, 1 mm ≈ 57 DXA)

```js
theme: {
  spacing: {
    paragraphLine:   320,   // line height (240=single, 320=1.33x, 360=1.5x, 480=double)
    paragraphAfter:  120,   // gap after body paragraphs
    bulletAfter:      80,   // gap after list items
    codeLineSpacing: 220,   // tighter spacing inside code blocks
    headings: {
      h1: { before: 480, after: 240 },
      h2: { before: 360, after: 180 },
      h3: { before: 280, after: 140 },
      h4: { before: 200, after: 100 },
    },
  },
},
```

---

### `vars` (object)

Template variables substituted throughout all Markdown files using `{{name}}` syntax. Document-level `<!-- @var: name = value -->` directives override these.

```js
vars: {
  author:       'Jane Smith',
  institution:  'University of Technology',
  year:         '2026',
},
```

Usage in Markdown:

```markdown
Prepared by **{{author}}** at {{institution}}, {{year}}.
```

---

### `cover` (string or array)

**String:** path to a Markdown file rendered as a separate cover section (no header/footer, no page numbers).

```js
cover: './cover.md',
```

**Array:** built-in cover builder — list of entry objects:

```js
cover: [
  { text: 'UNIVERSITY NAME',                  style: 'institution' },
  { text: 'Faculty of Science',               style: 'institution' },
  { spacer: 800 },
  { text: 'MASTER THESIS',                    style: 'banner' },
  { spacer: 400 },
  { text: 'Deep Learning in Medical Imaging', style: 'title' },
  { text: 'Jane Smith',                       style: 'subtitle' },
  { spacer: 800 },
  { text: 'Supervised by: Prof. John Doe',    style: 'year' },
  { text: 'May 2026',                         style: 'year' },
],
```

**Available styles:** `institution` | `banner` | `title` | `subtitle` | `year` | `overline`

**Spacer:** `{ spacer: 600 }` inserts vertical space in DXA units.

---

### `header` / `footer` (string or object)

**Shorthand:**

```js
header: 'My Document Title'   // centered, no extra options
footer: 'Organization — 2026' // centered, with page numbers
```

**Full form:**

```js
header: {
  text:  'My Document Title',
  align: 'center',   // 'left' | 'center' | 'right'
},

footer: {
  text:            'Organization — 2026',
  align:           'center',
  showPageNumbers: true,    // appends "  N / Total"
},
```

**Rich form** — full control with runs and dynamic fields:

```js
header: {
  paragraphs: [
    {
      align: 'center',
      runs: [
        { text: 'My Report', bold: true, size: 9, color: '2E4C7E' },
        { text: ' | ', color: '555555' },
        { text: 'Confidential', italics: true },
      ],
    },
  ],
},

footer: {
  paragraphs: [
    {
      runs: [
        { text: 'Organization — ', color: '555555' },
        { field: 'PAGE_CURRENT', bold: true },
        { text: ' / ' },
        { field: 'PAGE_TOTAL', color: '555555' },
      ],
    },
  ],
},
```

**Run properties:** `text`, `field` (`PAGE_CURRENT` | `PAGE_TOTAL`), `font`, `size` (pt), `color` (6-digit hex), `bold`, `italics`, `allCaps`, `break`.

When `paragraphs` is provided it takes precedence over `text` and `showPageNumbers`.

---

### `sections` (array)

Override page settings for individual document sections created by `<!-- @section -->` directives. Match by `id` set in the directive, or by occurrence index.

```js
sections: [
  {
    id:          'annexes',          // matches <!-- @section: id: annexes -->
    orientation: 'landscape',
    margin:      15,                 // mm, uniform or { top, right, bottom, left }
    header:      'Annexes',
    footer:      { showPageNumbers: true },
    pageNumbers: { format: 'lowerRoman' },
  },
],
```

---

## Markdown Syntax

### Headings

```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
```

Only 4 heading levels are supported. H1–H4 are automatically numbered (Roman / decimal / two-part / three-part).

**Modifiers** — appended at end of heading line, stripped from rendered text:

| Modifier | Effect |
|----------|--------|
| `{.no-num}` | Skip automatic numbering; heading is centered |
| `{.center}` | Force center alignment |
| `{.right}` | Force right alignment |
| `{.left}` | Force left alignment |
| `{.page-break}` | Insert page break before this heading |

```markdown
# Abstract {.no-num}
## Introduction {.center}
#### Subsection {.page-break}
```

---

### Paragraphs

Any line that is not a heading, list, code block, table, or directive is a paragraph.

Use `<br>`, `<br/>`, or `<br />` for a hard line break inside a paragraph.

**Paragraph modifiers** work the same as heading modifiers:

```markdown
This paragraph is centered. {.center}
This one has a page break before it. {.page-break}
```

---

### Lists

#### Bullet lists

```markdown
- Item 1
- Item 2
    - Nested item (4+ space indent)
- Item 3
```

#### Numbered lists

```markdown
1. First
2. Second
3. Third
```

---

### Code

#### Inline code

```markdown
Call `doSomething()` to start.
```

#### Code blocks

````markdown
```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```
````

Language label is parsed but not used for syntax highlighting.

---

### Math

#### Inline math

```markdown
The formula $E = mc^2$ is rendered inline (Unicode).
```

#### Math blocks

Single-line:
```markdown
$$\frac{MTBF}{MTBF + MTTR} = \text{Availability}$$
```

Multi-line:
```markdown
$$
\int_{0}^{1} x^2 \, dx = \frac{1}{3}
$$
```

Math blocks render as centered Word OMML equations (native Word math objects).

**Supported constructs:** `\frac{}{}`, `\sqrt{}`, `^{}` superscript, `_{}` subscript, Greek letters (`\alpha`…`\Omega`), common operators (`\sum`, `\int`, `\prod`, `\pm`, `\times`, `\div`, `\leq`, `\geq`, `\neq`, `\approx`, `\infty`, `\cdot`, …).

Falls back to Unicode text rendering with a W004 warning if the formula is not parseable.

---

### Tables

```markdown
| Column A | Column B | Column C |
|----------|----------|----------|
| A1       | B1       | C1       |
| A2       | B2       | C2       |
```

- First row = header (bold, `primary` color fill, white text)
- Odd body rows shaded with `rowAlt`
- Column widths proportional to content
- Borders use `tableBorder` color

---

### Blockquotes

```markdown
> This is a blockquote.
> Multiple lines are joined.
```

Rendered indented, italic, in `note` color.

---

### Links

```markdown
[Link text](https://example.com)
```

---

### Images

```markdown
![Alt text / caption](./path/to/image.png)
```

Image is embedded and scaled to fit the page width. Alt text becomes the caption.

---

### Captions

Italic lines in the pattern `*Figure N — …*` / `*Tableau N — …*` are rendered as captions (9 pt, note color, centered).

```markdown
*Figure 1 — Comparison of analyzers by availability*
*Tableau 3 — Monthly KPI summary*
```

---

## Block Directives

All block directives use HTML comment syntax — invisible in plain Markdown renderers.

```
<!-- @verb -->
<!-- @verb: key: value | key: value -->
```

---

### `<!-- @import: path | options -->`

Import an external file at the current position. Supported file types: `.md`, `.txt`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`, `.js`, `.py`, `.ts`, `.docx`.

```markdown
<!-- @import: ./chapters/introduction.md -->
<!-- @import: ./shared/disclaimer.txt -->
<!-- @import: ./figures/chart.png | caption: Figure 1 — Sales by region -->
<!-- @import: ./figures/generate.js | caption: Figure 2 — Auto-generated chart -->
<!-- @import: ./appendix.docx | type: embed -->
```

See full details in [@import Directive](#import-directive-1).

---

### `<!-- @toc -->` / `<!-- @toc: title: X | depth: N -->`

Insert a table of contents built from all headings in the document.

```markdown
<!-- @toc -->
<!-- @toc: title: Table des Matières | depth: 3 -->
```

---

### `<!-- @list: figures|tables|annexes -->`

Insert a list of all figures, tables, or annexes collected during parsing.

```markdown
<!-- @list: figures -->
<!-- @list: tables -->
<!-- @list: annexes -->
```

---

### `<!-- @element: type: figure | title: … -->`

Attach a numbered caption to the next image or block.

**Supported types:** `figure`, `table`, `annex`

```markdown
<!-- @element: type: figure | title: Workflow of the ARCHITECT ci4100 -->
<!-- @import: ./figures/workflow.js -->

<!-- @element: type: table | title: Monthly KPI Summary -->
| Month | MTBF | MTTR | Availability |
|-------|------|------|--------------|
```

Default caption labels: `Figure` / `Tableau` / `Annexe` (French defaults matching the thesis project).

---

### `<!-- @style: style-name -->`

Apply a callout/admonition style to the **next** paragraph, blockquote, or imported block.

```markdown
<!-- @style: warning -->
> Calibration must be performed before any measurement session.

<!-- @style: info -->
This feature requires Node.js >= 18.

<!-- @style: tip -->
Use --watch during authoring for a faster feedback loop.
```

**Available styles:**

| Style | Icon | Use for |
|-------|------|---------|
| `info` | ℹ | Informational notes |
| `warning` | ⚠ | Cautions and caveats |
| `tip` | ✔ | Tips and best practices |
| `danger` | ✖ | Critical warnings |
| `note` | 📝 | Marginal notes |
| `box` | — | Emphasized boxed text (key statements, cover titles) |
| `quote` | ❝ | Pull quotes, excerpts |

---

### `<!-- @page-break -->`

Insert a hard page break.

```markdown
Content on page N.

<!-- @page-break -->

Content on page N+1.
```

---

### `<!-- @section: options -->`

Start a new document section with different page settings. The builder splits the DOCX at each section break.

```markdown
<!-- @section: orientation: landscape | margin: 15 | id: annexes -->
```

**Options:**

| Key | Values | Description |
|-----|--------|-------------|
| `orientation` | `portrait` \| `landscape` | Page orientation |
| `margin` | number (mm) | Uniform margin override |
| `id` | string | Matches a `sections[]` entry in config by `id` |
| `header` | string | Quick header text for this section |
| `footer` | string | Quick footer text for this section |

---

### `<!-- @anchor: id: anchor-id -->`

Insert a Word bookmark for internal cross-references.

```markdown
<!-- @anchor: id: results-section -->
## Results
```

---

### `<!-- @var: name = value -->`

Define a template variable scoped to the current file. Overrides the same key from `config.vars`.

```markdown
<!-- @var: year = 2026 -->
<!-- @var: version = 1.3.2 -->

Document version {{version}}, prepared in {{year}}.
```

Variables are collected in a first pass before rendering, so placement in the file does not matter.

---

### Deprecated Syntax

The following still work but emit W002 warnings. Migrate to the canonical forms to eliminate warnings.

| Old syntax | Replacement |
|------------|-------------|
| `<div align="center">…</div>` | `{.center}` modifier on each line |
| `---` / `***` / `___` (standalone line) | `<!-- @page-break -->` |
| `{.box}` paragraph modifier | `<!-- @style: box -->` before the paragraph |

---

## Inline Syntax

Extended Markdown inline formatting supported inside paragraphs, headings, list items, and table cells.

| Syntax | Effect |
|--------|--------|
| `**text**` | Bold |
| `*text*` | Italic |
| `__text__` | Underline |
| `~~text~~` | Strikethrough |
| `^text^` | Superscript |
| `~text~` | Subscript |
| `` `code` `` | Inline code (monospace, code color) |
| `==text==` | Highlight (yellow background) |
| `[text](url)` | Hyperlink (accent color) |
| `$formula$` | Inline math (Unicode rendering) |
| `{{varName}}` | Variable substitution (W003 if undefined) |
| `{color:X}text{/color}` | Colored text |
| `{font:Name}text{/font}` | Custom font family |
| `{size:N}text{/size}` | Custom font size in points |
| `{bg:X}text{/bg}` | Text highlight color |
| `{style:key=value;...}text{/style}` | Combined run styling (color/font/size/bold/italic/underline/strike/sub/sup) |
| `{b}text{/b}` / `{i}text{/i}` / `{u}text{/u}` / `{s}text{/s}` | Shorthand bold/italic/underline/strike |
| `<br>` / `<br />` | Hard line break |

**Color key names** for `{color:X}`: `primary`, `secondary`, `accent`, `h4`, `body`, `note`, `code`, `info`, `warning`, `tip`, `danger` — or any 6-digit hex value.

**Examples:**
- `{font:Times New Roman}Thesis title{/font}`
- `{size:14}Larger inline text{/size}`
- `{bg:FFFF00}Highlighted note{/bg}`
- `{style:color=accent; font=Calibri; size=12; bold=true; italic=true}Styled sentence{/style}`
- `{style:color=#8B0000; underline=true}Important{/style}`

```markdown
The metric is $MTBF$ measured in hours.

Visit {color:accent}our documentation{/color} for details.

Use {style:color=primary; font=Cambria; size=12; bold=true}custom inline styling{/style}.

CO~2~ concentration: 100 μg/m^3^.

Prepared by **{{author}}** — version ==1.0==.
```

---

## @import Directive

Full syntax:

```markdown
<!-- @import: <path> | <key>: <value> | <key>: <value> -->
```

The path is resolved relative to the **current Markdown file's directory**.

---

### Import Markdown / Text

```markdown
<!-- @import: ./chapters/introduction.md -->
<!-- @import: ./shared/disclaimer.txt -->
```

Parsed recursively — all directives and syntax work inside imported files. Circular imports are detected (E003).

---

### Import Image

```markdown
<!-- @import: ./figures/chart.png | caption: Figure 1 — Chart title -->
<!-- @import: ./figures/diagram.jpg -->
```

Pair with `<!-- @element -->` for auto-numbered captions:

```markdown
<!-- @element: type: figure | title: Architecture overview -->
<!-- @import: ./figures/architecture.png -->
```

---

### Import Script (.js / .py / .ts)

The script is executed; its stdout determines what is imported:

1. **Image path** (`*.png`, `*.jpg`, etc. that exists on disk) → embedded as image
2. **Any other text** → parsed as Markdown

```markdown
<!-- @element: type: figure | title: Pareto Chart of Failures -->
<!-- @import: ./figures/pareto.js | caption: Figure 3 — Pareto analysis -->
```

**Script requirements:**
- Write exactly one thing to stdout: an image path or Markdown text
- No extra output alongside the path
- Must complete within 30 seconds

**Example script:**

```js
const u = require('mdoc/canvas-utils');
const path = require('path');

const OUT = path.join(__dirname, '_pareto.png');
const canvas = u.createCanvas(800, 400);
const ctx = canvas.getContext('2d');

u.background(ctx, 800, 400, 'FFFFFF');
// ... draw chart ...
u.saveAndPrint(canvas, OUT);   // prints the path to stdout
```

**Interpreters:** `.js` → `node`, `.py` → `python`, `.ts` → `ts-node`

---

### Import Word Document (.docx)

```markdown
<!-- @import: ./appendix.docx | type: embed -->
<!-- @import: ./template.docx | type: extract -->
```

| `type` | Effect |
|--------|--------|
| `embed` (default) | AltChunk — preserves full Word fidelity; Word reconciles styles on open |
| `extract` | Extract plain text via `mammoth` (install separately: `npm i mammoth`), parse as Markdown |

---

## Figure Scripts

Use `core/canvas-utils.js` to generate figures programmatically from `.js` scripts.

```js
const u = require('mdoc/canvas-utils');
```

### API Reference

| Function | Signature | Description |
|----------|-----------|-------------|
| `createCanvas` | `(w, h)` | Create a canvas |
| `background` | `(ctx, w, h, color?)` | Fill entire canvas (default white) |
| `title` | `(ctx, text, x, y, opts?)` | Draw a title label |
| `subtitle` | `(ctx, text, x, y, opts?)` | Draw a smaller subtitle |
| `chartArea` | `(W, H, margin?)` | Compute chart bounds → `{ cW, cH, ox, oy }` |
| `hGrid` | `(ctx, ox, oy, cW, cH, ticks, opts?)` | Horizontal grid lines + Y-axis labels |
| `vGrid` | `(ctx, ox, oy, cW, cH, ticks, opts?)` | Vertical grid lines + X-axis labels |
| `axes` | `(ctx, ox, oy, cW, cH, opts?)` | X/Y axes with optional arrows |
| `roundRect` | `(ctx, x, y, w, h, r?)` | Rounded rectangle path |
| `drawBox` | `(ctx, x, y, w, h, lines, fill, textColor?, opts?)` | Labeled rounded box |
| `drawArrow` | `(ctx, x1, y1, x2, y2, opts?)` | Arrow with arrowhead and label |
| `drawLegend` | `(ctx, x, y, items, opts?)` | Color-swatch legend |
| `saveAndPrint` | `(canvas, outPath)` | Write PNG and print path to stdout |

### Example: Bar Chart

```js
const u = require('mdoc/canvas-utils');
const path = require('path');

const OUT = path.join(__dirname, '_chart.png');
const canvas = u.createCanvas(700, 400);
const ctx = canvas.getContext('2d');

u.background(ctx, 700, 400, 'FFFFFF');
const { cW, cH, ox, oy } = u.chartArea(700, 400, { top: 50, right: 20, bottom: 50, left: 60 });
u.title(ctx, 'Availability by Analyzer', 350, 24, { textAlign: 'center' });

const data   = [98.2, 96.4, 94.1, 99.0];
const labels = ['Immunology', 'Biochemistry', 'Coagulation', 'Hematology'];
const bW = cW / data.length * 0.7;
data.forEach((val, i) => {
  const x = ox + i * (cW / data.length) + (cW / data.length - bW) / 2;
  const h = (val / 100) * cH;
  ctx.fillStyle = '#2E75B6';
  ctx.fillRect(x, oy - h, bW, h);
  ctx.fillStyle = '#1A1A1A';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(labels[i], x + bW / 2, oy + 16);
  ctx.fillText(val + '%', x + bW / 2, oy - h - 6);
});

u.axes(ctx, ox, oy, cW, cH, { drawArrow: true });
u.hGrid(ctx, ox, oy, cW, cH, [0, 25, 50, 75, 100]);
u.saveAndPrint(canvas, OUT);
```

---

## Export Command

See [mdoc export](#mdoc-export) in the CLI Reference above.

---

## Programmatic API

```js
const mdoc = require('mdoc');
```

### `mdoc.build(configPath, opts)` → `Promise<result>`

High-level build from a config file path.

```js
const result = await mdoc.build('./projects/my-report/project.config.js', {
  verbose:     true,
  pdf:         true,
  sofficePath: '/usr/bin/soffice',
});
// result: { outputPath, byteLength, sectionCount, warnings }
```

### `mdoc.buildFromConfig(rawConfig, opts)` → `Promise<result>`

Build from a raw config object. Set `rawConfig._dir` to the project directory.

```js
const cfg = require('./project.config.js');
cfg._dir = __dirname;
const result = await mdoc.buildFromConfig(cfg, { logger: myLogger });
```

### `mdoc.validate(configPath, opts)` → `Promise<result>`

```js
const { valid, errors, warnings, imports } = await mdoc.validate('./project.config.js', {
  depGraph: true,   // write dependency.json
});
```

### Low-level exports

```js
const {
  createRenderer,   // (theme, pageConfig, vars, logger) → R
  parseMD,          // (text, dir, R, importFn, opts) → elements[]
  createImporter,   // (R, parseFn, opts) → handleImport()
  validateConfig,   // (rawConfig) → { valid, errors, warnings, config }
  createLogger,     // (opts) → logger
  makeNullLogger,   // () → silent logger
  CODES,            // warning/error code constants
} = require('mdoc');
```

---

### Exporter API

The exporter helpers are available from the public package API:

```js
const {
  exportPdfToImages,
  flattenToMarkdown,
  parsePageSpec,
  findExecutable,
} = require('mdoc');
```

#### `exportPdfToImages(pdfPath, opts)` → `Promise<{ page, path }[]>`

Convert a PDF to per-page image files.

```js
const pages = await exportPdfToImages('./thesis.pdf', {
  outDir:   './out/images',
  format:   'png',           // 'png' | 'jpg'
  dpi:      150,
  pageSpec: '1,3-5',         // null = all pages
  prefix:   'slide',
  pdftoppm: null,            // null = auto-detect
  gs:       null,
  logger:   null,
});
// → [{ page: 1, path: '/abs/out/images/slide-001.png' }, ...]
```

#### `flattenToMarkdown(configPath, opts)` → `Promise<{ outputPath, byteLength }>`

Flatten a project's entire Markdown tree into a single file.

```js
const result = await flattenToMarkdown('./projects/my-thesis/project.config.js', {
  out:     './thesis_flat.md',   // null = auto (<project>/<name>_flat.md)
  noCover: false,
  vars:    { year: '2027' },
  logger:  null,
});
// → { outputPath: '/abs/path/thesis_flat.md', byteLength: 142831 }
```

The flat file resolves all `<!-- @import: ... -->` directives:
- `.md` / `.txt` files are inlined recursively
- Script files (`.js`, `.py`, `.ts`) are executed and their stdout is embedded
- Images are converted to `![caption](relative-path)` references
- `{{vars}}` are substituted using config vars merged with `opts.vars`

#### `parsePageSpec(spec, totalPages)` → `number[]`

Parse a page range string into a sorted array of 1-based page numbers.

```js
parsePageSpec('1,3-5,8', 10)  // → [1, 3, 4, 5, 8]
parsePageSpec('2-',      5)   // → [2, 3, 4, 5]
parsePageSpec('all',     3)   // → [1, 2, 3]
parsePageSpec(null,      4)   // → [1, 2, 3, 4]
```

---

## Troubleshooting

### `No project.config.js found`

Create `project.config.js` with the required `name`, `input`, `output` fields. Run `mdoc validate .` to check without building.

---

### `Config validation failed`

```
Config validation failed:
  x theme.colors.primary: "GGGGGG" is not a valid 6-digit hex color
  x page.margins: Must be a positive number (mm)
```

Check the error messages and correct your config values.

---

### W001 — Missing import

```
[W001] Image not found: ./figures/missing.png
```

Paths in `@import` and `![]()` are relative to the **Markdown file's directory**, not the project root.

---

### W002 — Deprecated syntax

```
[W002] "---" for page breaks is deprecated. Use <!-- @page-break --> instead.
```

The document still builds. Migrate to canonical syntax to eliminate the warning.

---

### W003 — Undefined variable

```
[W003] Undefined variable: {{authorName}}
```

Add `authorName` to `config.vars` or define it with `<!-- @var: authorName = ... -->`.

---

### W004 — Math rendering fallback

```
[W004] OMML rendering failed for formula "...": ...
```

The formula uses unsupported LaTeX — it falls back to Unicode text. Simplify the formula or use Unicode directly in the Markdown.

---

### PDF fails: `LibreOffice not found`

- **Windows:** `mdoc --soffice "C:\Program Files\LibreOffice\program\soffice.exe" -p .`
- **macOS:** `brew install libreoffice`
- **Linux:** `sudo apt-get install libreoffice`
- **Skip PDF:** `mdoc --no-pdf .`

---

### Script import: output not captured

The script must write **only** the image path or Markdown text to stdout. Any prefix text breaks the import.

```js
// Correct
process.stdout.write(filePath);
// Also correct
console.log(filePath);

// Wrong — extra text
console.log('Generated:', filePath);
```

---

## Example Configurations

### Minimal

```js
module.exports = {
  name:   'Quick Document',
  input:  './content.md',
  output: './document.docx',
};
```

### Academic Thesis

```js
module.exports = {
  name:   'Master Thesis: AI in Medical Imaging',
  input:  './index.md',
  output: './thesis_final.docx',

  meta: {
    author:   'Jane Smith, University of Technology',
    subject:  'Deep learning in medical imaging diagnosis',
    keywords: ['AI', 'machine learning', 'medical imaging'],
    language: 'en-US',
  },

  page: {
    size:    'A4',
    margins: { top: 30, right: 25, bottom: 30, left: 30 },
    pageNumbers: { start: 1, format: 'decimal' },
  },

  vars: {
    author:      'Jane Smith',
    institution: 'University of Technology',
    year:        '2026',
    supervisor:  'Prof. John Doe',
  },

  theme: {
    fonts:    { body: 'Times New Roman', code: 'Courier New', math: 'Cambria Math' },
    fontSize: { body: 12, h1: 20, h2: 16, h3: 14, h4: 12, caption: 10, code: 10 },
    spacing:  { paragraphLine: 360, paragraphAfter: 150 },
  },

  cover: './cover.md',

  header: { text: 'Master Thesis — AI in Medical Imaging', align: 'center' },
  footer: { text: 'University — 2026', align: 'center', showPageNumbers: true },

  sections: [
    { id: 'annexes', orientation: 'landscape', pageNumbers: { format: 'upperRoman' } },
  ],
};
```

### Business Report

```js
module.exports = {
  name:   'Q1 2026 Business Review',
  input:  './report.md',
  output: './Q1_2026_Review.docx',

  meta: {
    author:   'Executive Team, Acme Inc.',
    keywords: ['Q1', '2026', 'business', 'review'],
    language: 'en-US',
  },

  page: { size: 'A4', margins: 20, pageNumbers: { start: 1, format: 'decimal' } },

  vars: {
    company:  'ACME CORPORATION',
    quarter:  'Q1 2026',
    prepared: 'May 15, 2026',
  },

  theme: {
    colors: {
      primary:   'C00000',  secondary: 'D94D58',  accent: 'FF6600',
      body:      '2F2F2F',  rowAlt:    'FFF4E6',  mathBg: 'FFEBE6',
    },
    fonts: { body: 'Arial', code: 'Consolas', math: 'Cambria Math' },
  },

  cover: [
    { text: '{{company}}',                        style: 'overline' },
    { spacer: 600 },
    { text: '{{quarter}} BUSINESS REVIEW',        style: 'banner' },
    { spacer: 400 },
    { text: 'Executive Summary & Strategic Outlook', style: 'title' },
    { spacer: 800 },
    { text: 'Prepared: {{prepared}}',             style: 'year' },
    { text: 'Confidential',                       style: 'year' },
  ],

  header: { text: '{{company}} — {{quarter}} Business Review', align: 'center' },
  footer: { text: 'Confidential', align: 'right', showPageNumbers: true },
};
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Build DOCX | `mdoc projects/my-doc` |
| Build DOCX + PDF | `mdoc -p projects/my-doc` |
| Build verbose, no PDF | `mdoc -v --no-pdf projects/my-doc` |
| PDF from existing DOCX | `mdoc --pdf-only projects/my-doc` |
| Quiet mode (errors only) | `mdoc -q projects/my-doc` |
| Custom output path | `mdoc -o ./dist/out.docx projects/my-doc` |
| Watch mode | `mdoc --watch --no-pdf projects/my-doc` |
| Validate only | `mdoc validate projects/my-doc` |
| Validate + dependency graph | `mdoc validate --dep-graph projects/my-doc` |
| Scaffold simple project | `mdoc init ./my-doc` |
| Scaffold thesis | `mdoc init --template thesis ./my-thesis` |
| Help | `mdoc --help` |
| Version | `mdoc --version` |
