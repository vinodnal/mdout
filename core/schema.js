// core/schema.js — backward-compat shim. Delegates to src/schema.js.
module.exports = require("../src/schema");
// ─── Original implementation below (not executed) ────────────────────────────
/** @deprecated Use require('mdoc/src/schema') directly.
 * core/schema.js
 * Project config schema — definition, defaults, and validation.
 *
 * Every field that can appear in a project.config.js is described and
 * validated here. buildFromConfig() calls validateConfig() before building.
 *
 * Usage:
 *   const { validateConfig } = require('./core/schema');
 *   const { valid, errors, warnings, config } = validateConfig(raw);
 */

"use strict";

// ─── Defaults ─────────────────────────────────────────────────────────────────
// Used as a base; user config is deep-merged on top.

const DEFAULTS = {

  // ── Page ──────────────────────────────────────────────────────────────────
  page: {
    // "A4" | "Letter" | "A3" | { width: mm, height: mm }
    size: "A4",
    // mm — uniform number, or { top, right, bottom, left }
    margins: 25,
    pageNumbers: {
      start:  1,          // first page number in the body section
      format: "decimal",  // "decimal" | "upperRoman" | "lowerRoman" | "upperLetter" | "lowerLetter"
    },
  },

  // ── Theme ──────────────────────────────────────────────────────────────────
  theme: {
    // All hex colors: 6-digit strings WITHOUT the '#' prefix (e.g. "1F3864")
    colors: {
      primary:     "1F3864", // H1 headings, page header background, cover headings
      secondary:   "2E4C7E", // H2 headings
      accent:      "2E75B6", // H3, hyperlinks, code block border, math block border
      h4:          "4472C4", // H4 headings
      body:        "1A1A1A", // body text
      note:        "555555", // captions, blockquote text, footer secondary text
      code:        "2D2D2D", // text inside code blocks and inline code spans
      codeBg:      "F5F5F5", // code block background fill
      rowAlt:      "EBF2FA", // alternating (odd) table row fill
      headerText:  "FFFFFF", // page header text (on primary background)
      mathBg:      "EEF4FB", // background shading behind $$...$$ math blocks
      tableBorder: "AAAAAA", // table cell border color
    },

    // Font family names — must be installed on the machine opening the DOCX
    fonts: {
      body: "Calibri",
      code: "Courier New",
      math: "Cambria Math", // recommended; ships with Windows/Office
    },

    // Font sizes in pt — every element type is independently configurable
    fontSize: {
      body:    11,
      h1:      18,
      h2:      14,
      h3:      12,
      h4:      11,
      caption:  9,
      code:     9,  // applies to both code blocks and inline code spans
      header:   9,  // page header text
      footer:   9,  // page footer text
    },

    // Spacing in DXA units (1 inch = 1440 DXA, 1 cm ≈ 570 DXA)
    // Line spacing reference: 240=single · 288=1.2× · 320=1.33× · 360=1.5× · 480=double
    spacing: {
      paragraphLine:   320, // body paragraph line height
      paragraphAfter:  120, // space below each body paragraph
      bulletAfter:      80, // space below each bullet / numbered list item
      codeLineSpacing: 220, // line height inside code blocks (tighter than body)
      // DXA space above/below each heading level
      headings: {
        h1: { before: 480, after: 240 },
        h2: { before: 360, after: 180 },
        h3: { before: 280, after: 140 },
        h4: { before: 200, after: 100 },
      },
    },
  },

  // ── Cover ─────────────────────────────────────────────────────────────────
  cover: [],
  // May be either:
  //   - an array of cover entry objects (legacy/backward compatible), or
  //   - a path to a Markdown file parsed with the same markdown parser as body pages.
  //
  // Each entry is one of:
  //   { spacer: N }                             — vertical gap (DXA, ~570 per cm)
  //   { text, style }                           — text with a predefined style
  //   { text, size?, color?, bold?, italics?,   — fully custom entry
  //          allCaps?, font?, after? }
  //
  // Predefined styles:
  //   "overline"     Small grey text (e.g. country/ministry name)
  //   "institution"  Medium bold primary-colored text
  //   "banner"       Large bold all-caps primary-colored text
  //   "title"        Large bold primary-colored text
  //   "subtitle"     Medium secondary-colored text
  //   "chapterTitle" Medium bold accent-colored text
  //   "year"         Small italic grey text

  // ── Header ────────────────────────────────────────────────────────────────
  // Shorthand: header: "My Document Title"
  header: {
    text:  "",
    align: "center",  // "left" | "center" | "right"
    // Rich mode: array of paragraph objects, each with runs[]
    // Run supports either { text: "..." } or { field: "PAGE_CURRENT" | "PAGE_TOTAL" }
    paragraphs: [],
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  // Shorthand: footer: "My Footer Text"
  footer: {
    text:            "",
    align:           "center",  // "left" | "center" | "right"
    showPageNumbers: true,       // append "  N / Total" page counter
    // Rich mode: array of paragraph objects, each with runs[]
    paragraphs: [],
  },

  // ── Document metadata (stored in DOCX core properties) ───────────────────
  meta: {
    author:   "",
    subject:  "",
    keywords: [],    // array of strings
    language: "fr-FR",
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZES   = ["A4", "Letter", "A3"];
const PAGE_FORMATS = ["decimal", "upperRoman", "lowerRoman", "upperLetter", "lowerLetter"];
const ALIGNS       = ["left", "center", "right"];
const COVER_STYLES = ["overline", "institution", "banner", "title", "subtitle", "chapterTitle", "year"];
const DYNAMIC_FIELDS = ["PAGE_CURRENT", "PAGE_TOTAL"];
const HEX_RE       = /^[0-9A-Fa-f]{6}$/;

// ─── Deep merge ───────────────────────────────────────────────────────────────

function deepMerge(target, source) {
  if (source === null || typeof source !== "object" || Array.isArray(source)) return source;
  const result = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    const sv = source[key], tv = target[key];
    if (sv !== null && typeof sv === "object" && !Array.isArray(sv) &&
        tv !== null && typeof tv === "object" && !Array.isArray(tv)) {
      result[key] = deepMerge(tv, sv);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateConfig(raw) {
  if (typeof raw !== "object" || raw === null) {
    return {
      valid:    false,
      errors:   ["Config must be a non-null object exported from project.config.js"],
      warnings: [],
      config:   null,
    };
  }

  const errors   = [];
  const warnings = [];
  const e = (path, msg) => errors.push(`  ✗ ${path}: ${msg}`);
  const w = (path, msg) => warnings.push(`  ⚠ ${path}: ${msg}`);

  // ── 1. Required fields ────────────────────────────────────────────────────
  for (const field of ["name", "input", "output"]) {
    if (raw[field] === undefined || raw[field] === null)
      e(field, "Required — must be a non-empty string");
    else if (typeof raw[field] !== "string" || !raw[field].trim())
      e(field, `Must be a non-empty string, got: ${JSON.stringify(raw[field])}`);
  }

  // ── 2. Deep-merge with defaults ───────────────────────────────────────────
  const cfg = deepMerge(DEFAULTS, raw);

  // Normalize header/footer strings → objects
  if (typeof cfg.header === "string") cfg.header = { ...DEFAULTS.header, text: cfg.header };
  if (typeof cfg.footer === "string") cfg.footer = { ...DEFAULTS.footer, text: cfg.footer };

  // Ensure rich paragraph arrays exist when omitted
  if (!Array.isArray(cfg.header.paragraphs)) cfg.header.paragraphs = [];
  if (!Array.isArray(cfg.footer.paragraphs)) cfg.footer.paragraphs = [];

  // ── 3. page ───────────────────────────────────────────────────────────────
  {
    const pg = cfg.page;
    if (typeof pg.size === "string") {
      if (!PAGE_SIZES.includes(pg.size))
        e("page.size", `Unknown size "${pg.size}". Use: ${PAGE_SIZES.join(" | ")} — or { width: mm, height: mm }`);
    } else if (typeof pg.size === "object" && pg.size !== null) {
      if (typeof pg.size.width !== "number" || typeof pg.size.height !== "number")
        e("page.size", "Custom size must be { width: mm, height: mm } with numeric values");
    } else {
      e("page.size", `Must be a string (${PAGE_SIZES.join(", ")}) or { width: mm, height: mm }`);
    }

    if (typeof pg.margins === "number") {
      if (pg.margins <= 0) e("page.margins", "Must be a positive number (mm)");
    } else if (typeof pg.margins === "object" && pg.margins !== null) {
      for (const side of ["top", "right", "bottom", "left"]) {
        if (typeof pg.margins[side] !== "number" || pg.margins[side] < 0)
          e(`page.margins.${side}`, "Must be a non-negative number (mm)");
      }
    } else {
      e("page.margins", "Must be a number (mm) or { top, right, bottom, left } in mm");
    }

    if (!PAGE_FORMATS.includes(pg.pageNumbers.format))
      e("page.pageNumbers.format", `Must be one of: ${PAGE_FORMATS.join(", ")}`);
    if (!Number.isInteger(pg.pageNumbers.start) || pg.pageNumbers.start < 0)
      e("page.pageNumbers.start", "Must be a non-negative integer");
  }

  // ── 4. theme.colors ───────────────────────────────────────────────────────
  for (const [key, val] of Object.entries(cfg.theme.colors)) {
    if (typeof val !== "string")
      e(`theme.colors.${key}`, `Must be a 6-digit hex string without #, got ${JSON.stringify(val)}`);
    else if (!HEX_RE.test(val))
      e(`theme.colors.${key}`, `"${val}" is not a valid 6-digit hex color (no # prefix, e.g. "2E75B6")`);
  }

  // ── 5. theme.fonts ────────────────────────────────────────────────────────
  for (const [key, val] of Object.entries(cfg.theme.fonts)) {
    if (typeof val !== "string" || !val.trim())
      e(`theme.fonts.${key}`, "Must be a non-empty font name string");
  }

  // ── 6. theme.fontSize ─────────────────────────────────────────────────────
  for (const [key, val] of Object.entries(cfg.theme.fontSize)) {
    if (typeof val !== "number" || val <= 0)
      e(`theme.fontSize.${key}`, `Must be a positive number (pt), got ${JSON.stringify(val)}`);
  }

  // ── 7. theme.spacing ──────────────────────────────────────────────────────
  const sp = cfg.theme.spacing;
  for (const key of ["paragraphLine", "paragraphAfter", "bulletAfter", "codeLineSpacing"]) {
    if (typeof sp[key] !== "number" || sp[key] < 0)
      e(`theme.spacing.${key}`, `Must be a non-negative number (DXA), got ${JSON.stringify(sp[key])}`);
  }
  for (const level of ["h1", "h2", "h3", "h4"]) {
    const hs = sp.headings[level];
    if (!hs || typeof hs.before !== "number" || typeof hs.after !== "number")
      e(`theme.spacing.headings.${level}`, "Must be { before: DXA, after: DXA }");
  }

  // ── 8. header ─────────────────────────────────────────────────────────────
  if (typeof cfg.header !== "object" || cfg.header === null)
    e("header", "Must be a string or { text, align, paragraphs? }");
  else {
    if (cfg.header.text !== undefined && typeof cfg.header.text !== "string")
      e("header.text", "Must be a string");
    if (!ALIGNS.includes(cfg.header.align))
      e("header.align", `Must be one of: ${ALIGNS.join(", ")}`);
    if (!Array.isArray(cfg.header.paragraphs)) {
      e("header.paragraphs", "Must be an array of paragraph objects");
    } else {
      cfg.header.paragraphs.forEach((p, i) => {
        if (typeof p !== "object" || p === null) {
          e(`header.paragraphs[${i}]`, "Must be an object"); return;
        }
        if (p.align !== undefined && !ALIGNS.includes(p.align))
          e(`header.paragraphs[${i}].align`, `Must be one of: ${ALIGNS.join(", ")}`);
        if (p.spacingBefore !== undefined && (typeof p.spacingBefore !== "number" || p.spacingBefore < 0))
          e(`header.paragraphs[${i}].spacingBefore`, "Must be a non-negative number (DXA)");
        if (p.spacingAfter !== undefined && (typeof p.spacingAfter !== "number" || p.spacingAfter < 0))
          e(`header.paragraphs[${i}].spacingAfter`, "Must be a non-negative number (DXA)");
        if (!Array.isArray(p.runs)) {
          e(`header.paragraphs[${i}].runs`, "Must be an array of run objects"); return;
        }
        p.runs.forEach((r, j) => {
          if (typeof r !== "object" || r === null) {
            e(`header.paragraphs[${i}].runs[${j}]`, "Must be an object"); return;
          }
          if (!r.text && !r.field)
            e(`header.paragraphs[${i}].runs[${j}]`, "Must define either 'text' or 'field'");
          if (r.text !== undefined && typeof r.text !== "string")
            e(`header.paragraphs[${i}].runs[${j}].text`, "Must be a string");
          if (r.field !== undefined && !DYNAMIC_FIELDS.includes(r.field))
            e(`header.paragraphs[${i}].runs[${j}].field`, `Must be one of: ${DYNAMIC_FIELDS.join(", ")}`);
          if (r.color !== undefined && !HEX_RE.test(String(r.color)))
            e(`header.paragraphs[${i}].runs[${j}].color`, "Must be a valid 6-digit hex color");
          if (r.size !== undefined && (typeof r.size !== "number" || r.size <= 0))
            e(`header.paragraphs[${i}].runs[${j}].size`, "Must be a positive number (pt)");
          for (const b of ["bold", "italics", "allCaps"]) {
            if (r[b] !== undefined && typeof r[b] !== "boolean")
              e(`header.paragraphs[${i}].runs[${j}].${b}`, "Must be true or false");
          }
          if (r.break !== undefined && (!Number.isInteger(r.break) || r.break < 0))
            e(`header.paragraphs[${i}].runs[${j}].break`, "Must be a non-negative integer");
        });
      });
    }
  }

  // ── 9. footer ─────────────────────────────────────────────────────────────
  if (typeof cfg.footer !== "object" || cfg.footer === null)
    e("footer", "Must be a string or { text, align, showPageNumbers, paragraphs? }");
  else {
    if (cfg.footer.text !== undefined && typeof cfg.footer.text !== "string")
      e("footer.text", "Must be a string");
    if (!ALIGNS.includes(cfg.footer.align))
      e("footer.align", `Must be one of: ${ALIGNS.join(", ")}`);
    if (typeof cfg.footer.showPageNumbers !== "boolean")
      e("footer.showPageNumbers", "Must be true or false");
    if (!Array.isArray(cfg.footer.paragraphs)) {
      e("footer.paragraphs", "Must be an array of paragraph objects");
    } else {
      cfg.footer.paragraphs.forEach((p, i) => {
        if (typeof p !== "object" || p === null) {
          e(`footer.paragraphs[${i}]`, "Must be an object"); return;
        }
        if (p.align !== undefined && !ALIGNS.includes(p.align))
          e(`footer.paragraphs[${i}].align`, `Must be one of: ${ALIGNS.join(", ")}`);
        if (p.spacingBefore !== undefined && (typeof p.spacingBefore !== "number" || p.spacingBefore < 0))
          e(`footer.paragraphs[${i}].spacingBefore`, "Must be a non-negative number (DXA)");
        if (p.spacingAfter !== undefined && (typeof p.spacingAfter !== "number" || p.spacingAfter < 0))
          e(`footer.paragraphs[${i}].spacingAfter`, "Must be a non-negative number (DXA)");
        if (!Array.isArray(p.runs)) {
          e(`footer.paragraphs[${i}].runs`, "Must be an array of run objects"); return;
        }
        p.runs.forEach((r, j) => {
          if (typeof r !== "object" || r === null) {
            e(`footer.paragraphs[${i}].runs[${j}]`, "Must be an object"); return;
          }
          if (!r.text && !r.field)
            e(`footer.paragraphs[${i}].runs[${j}]`, "Must define either 'text' or 'field'");
          if (r.text !== undefined && typeof r.text !== "string")
            e(`footer.paragraphs[${i}].runs[${j}].text`, "Must be a string");
          if (r.field !== undefined && !DYNAMIC_FIELDS.includes(r.field))
            e(`footer.paragraphs[${i}].runs[${j}].field`, `Must be one of: ${DYNAMIC_FIELDS.join(", ")}`);
          if (r.color !== undefined && !HEX_RE.test(String(r.color)))
            e(`footer.paragraphs[${i}].runs[${j}].color`, "Must be a valid 6-digit hex color");
          if (r.size !== undefined && (typeof r.size !== "number" || r.size <= 0))
            e(`footer.paragraphs[${i}].runs[${j}].size`, "Must be a positive number (pt)");
          for (const b of ["bold", "italics", "allCaps"]) {
            if (r[b] !== undefined && typeof r[b] !== "boolean")
              e(`footer.paragraphs[${i}].runs[${j}].${b}`, "Must be true or false");
          }
          if (r.break !== undefined && (!Number.isInteger(r.break) || r.break < 0))
            e(`footer.paragraphs[${i}].runs[${j}].break`, "Must be a non-negative integer");
        });
      });
    }
  }

  // ── 10. cover ─────────────────────────────────────────────────────────────
  if (typeof cfg.cover === "string") {
    if (!cfg.cover.trim()) e("cover", "Must be a non-empty string or an array of cover entry objects");
  } else if (!Array.isArray(cfg.cover)) {
    e("cover", "Must be an array of cover entry objects or a path to a Markdown file");
  } else {
    cfg.cover.forEach((entry, i) => {
      if (typeof entry !== "object" || entry === null) {
        e(`cover[${i}]`, "Must be an object — { text, style? } or { spacer: N }"); return;
      }
      if ("spacer" in entry) {
        if (typeof entry.spacer !== "number" || entry.spacer < 0)
          e(`cover[${i}].spacer`, "Must be a non-negative number (DXA, ~570 per cm)");
        return; // spacer entries need nothing else
      }
      if (!entry.text) w(`cover[${i}]`, "Entry has no text — will render as an empty line");
      if (entry.style && !COVER_STYLES.includes(entry.style))
        w(`cover[${i}].style`, `Unknown style "${entry.style}". Known: ${COVER_STYLES.join(", ")}`);
      if (entry.color !== undefined && !HEX_RE.test(String(entry.color)))
        e(`cover[${i}].color`, `"${entry.color}" is not a valid 6-digit hex color`);
      if (entry.size  !== undefined && (typeof entry.size !== "number" || entry.size <= 0))
        e(`cover[${i}].size`, "Must be a positive number (pt)");
      if (entry.after !== undefined && typeof entry.after !== "number")
        e(`cover[${i}].after`, "Must be a number (DXA — vertical space below this paragraph)");
    });
  }

  // ── 11. meta ──────────────────────────────────────────────────────────────
  if (typeof cfg.meta !== "object" || cfg.meta === null) {
    e("meta", "Must be an object");
  } else {
    for (const field of ["author", "subject", "language"]) {
      if (cfg.meta[field] !== undefined && typeof cfg.meta[field] !== "string")
        e(`meta.${field}`, "Must be a string");
    }
    if (cfg.meta.keywords !== undefined && !Array.isArray(cfg.meta.keywords))
      e("meta.keywords", "Must be an array of strings");
  }

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
    config:   errors.length === 0 ? cfg : null,
  };
}

module.exports = { validateConfig, DEFAULTS, COVER_STYLES, PAGE_SIZES, PAGE_FORMATS, ALIGNS };
