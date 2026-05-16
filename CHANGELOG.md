# Changelog

All notable changes to **mdout** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Fixed
- Word PDF export now uses print-optimized rendering (`ExportAsFixedFormat` OptimizeFor=Print) to improve chart/image clarity.
- Generated DOCX now sets `w:doNotCompressPictures` via native docx settings, reducing automatic image downsampling in Word.

## [1.0.0] — Initial release

### Added
- Markdown → DOCX compiler with full heading, paragraph, list, table, code, and math support
- `<!-- @import -->` directive — embeds `.md`, images, script figures, and `.docx` files
- `<!-- @toc -->` — auto-generated table of contents from headings
- `<!-- @list: figures|tables|annexes -->` — collected lists of numbered elements
- `<!-- @element: type: … | title: … -->` — auto-numbered figure/table/annex captions
- `<!-- @style: info|warning|tip|danger|note|box|quote -->` — callout/admonition blocks
- `<!-- @section: … -->` — multi-section documents with per-section page layout
- `<!-- @anchor: id: … -->` — named Word bookmarks for cross-references
- `<!-- @var: … -->` and `config.vars` — template variable substitution (`{{name}}`)
- `<!-- @page-break -->` — explicit page breaks
- Inline styling spans: `{color:X}`, `{font:Name}`, `{size:N}`, `{bg:X}`, `{style:…}`, `{b}`, `{i}`, `{u}`, `{s}`
- Superscript `^…^`, subscript `~…~`, highlight `==…==`
- Math blocks (`$$…$$`) rendered as native Word OMML equations; inline `$…$` via Unicode
- Script-generated figures: `.js` / `.py` / `.ts` scripts executed at build time via `canvas`
- Word document import via AltChunk (`embed`) or mammoth text extraction (`extract`)
- Full theme system — colors, fonts, font sizes, spacing, all configurable per project
- Cover page: Markdown file or built-in cover builder (styled entry array)
- Rich headers/footers: simple text or run-level control with `PAGE_CURRENT`/`PAGE_TOTAL` fields
- Per-section header/footer and page number overrides via `config.sections[]`
- PDF generation via LibreOffice; Word COM fallback on Windows
- `--watch` mode with configurable debounce; Windows-friendly file-lock retry
- `mdoc validate` — pre-build validation (missing imports, undefined variables, circular imports)
- `mdoc init` — scaffold new projects from `simple`, `report`, `thesis`, `manual` templates
- `src/canvas-utils.js` — shared drawing primitives (`background`, `title`, `chartArea`, `hGrid`, `vGrid`, `axes`, `roundRect`, `drawBox`, `drawArrow`, `drawLegend`, `saveAndPrint`)
- Programmatic API (`mdoc.build`, `mdoc.buildFromConfig`, `mdoc.validate`)
- Structured logger with codes W001–W005, E001–E004
- Config schema validation with detailed error messages

### Fixed
- Shell injection: `execSync` replaced with `execFileSync` for script imports and mammoth calls
- Inline image dimension NaN prevented for zero-size PNG/JPEG files
- `pendingElement` leak when parser encounters math/code blocks at document boundary
- `core/pdf.js` dead-code: wrong `require("fs").existsSync` replaced with `require("path")`
- `schema.js` duplicate `note` color key; enhanced `sections[]` validation
- `canvas-utils.js` stream errors now call `process.exit(1)` instead of hanging
- `validator.js` cover file warning used wrong code `E001` (fixed to `W001`)
- ALTCHUNK import now emits `W001` warning instead of silently dropping elements
- `IMAGE_EXTS` constant placement fixed in `builder.js`
- Double `fs.existsSync()` call eliminated in `validator.js`
