/**
 * src/schema.js
 * Project config schema — definition, defaults, and validation.
 *
 * Every field in a project.config.js is described and validated here.
 * buildFromConfig() calls validateConfig() before building.
 *
 * Usage:
 *   const { validateConfig } = require('mdoc/src/schema');
 *   const { valid, errors, warnings, config } = validateConfig(raw);
 */
"use strict";

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS = {

  // ── Global text alignment fallback ───────────────────────────────────────
  // Applied to plain paragraphs/headings only when no explicit alignment
  // modifier/directive is set in Markdown.
  defaultAlignment: undefined,

  // ── Page ──────────────────────────────────────────────────────────────────
  page: {
    // "A4" | "Letter" | "A3" | { width: mm, height: mm }
    size: "A4",
    // mm — uniform or { top, right, bottom, left }
    margins: 25,
    pageNumbers: {
      start:  1,
      format: "decimal",
    },
  },

  // ── Theme ──────────────────────────────────────────────────────────────────
  theme: {
    colors: {
      primary:     "1F3864",
      secondary:   "2E4C7E",
      accent:      "2E75B6",
      h4:          "4472C4",
      body:        "1A1A1A",
      note:        "555555",
      code:        "2D2D2D",
      codeBg:      "F5F5F5",
      rowAlt:      "EBF2FA",
      headerText:  "FFFFFF",
      mathBg:      "EEF4FB",
      tableBorder: "AAAAAA",
      // Callout / admonition block colors
      info:        "1565C0",
      infoBg:      "E3F2FD",
      warning:     "E65100",
      warningBg:   "FFF3E0",
      tip:         "2E7D32",
      tipBg:       "E8F5E9",
      danger:      "B71C1C",
      dangerBg:    "FFEBEE",
      note:        "4A4A4A",
      noteBg:      "F5F5F5",
    },
    fonts: {
      body: "Calibri",
      code: "Courier New",
      math: "Cambria Math",
    },
    fontSize: {
      body:    11,
      h1:      18,
      h2:      14,
      h3:      12,
      h4:      11,
      caption:  9,
      code:     9,
      header:   9,
      footer:   9,
    },
    spacing: {
      paragraphLine:   320,
      paragraphAfter:  120,
      bulletAfter:      80,
      codeLineSpacing: 220,
      headings: {
        h1: { before: 480, after: 240 },
        h2: { before: 360, after: 180 },
        h3: { before: 280, after: 140 },
        h4: { before: 200, after: 100 },
      },
    },
  },

  // ── Template variables ────────────────────────────────────────────────────
  // Used for {{varName}} substitution throughout all Markdown files.
  // Document-level @var directives override these.
  vars: {},

  // ── Cover ─────────────────────────────────────────────────────────────────
  cover: [],

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    text:       "",
    align:      "center",
    paragraphs: [],
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    text:            "",
    align:           "center",
    showPageNumbers: true,
    paragraphs:      [],
  },

  // ── Document metadata ──────────────────────────────────────────────────────
  meta: {
    author:   "",
    subject:  "",
    keywords: [],
    language: "fr-FR",
  },

  // ── Section overrides ─────────────────────────────────────────────────────
  // Each entry matches a <!-- @section --> directive by index or id.
  // Overrides the global page settings for that section.
  //
  // Example:
  //   sections: [
  //     { id: "annexes", orientation: "landscape", margin: 15 },
  //   ]
  //
  // Supported per-section keys:
  //   orientation: "portrait" | "landscape"
  //   margin: mm (number) or { top, right, bottom, left }
  //   header: string | header object (same as global header)
  //   footer: string | footer object (same as global footer)
  //   pageNumbers: { start, format }
  sections: [],
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZES   = ["A4", "Letter", "A3"];
const PAGE_FORMATS = ["decimal", "upperRoman", "lowerRoman", "upperLetter", "lowerLetter"];
const ALIGNS       = ["left", "center", "right"];
const DEFAULT_PARAGRAPH_ALIGNS = ["left", "center", "right", "justify", "justified"];
const DYNAMIC_FIELDS = ["PAGE_CURRENT", "PAGE_TOTAL", "PAGE_SECTION_TOTAL"];
const HEX_RE       = /^[0-9A-Fa-f]{6}$/;
const ORIENTATIONS = ["portrait", "landscape"];

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

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateRuns(runs, path, errors) {
  if (!Array.isArray(runs)) { errors.push(`  ✗ ${path}: Must be an array of run objects`); return; }
  runs.forEach((r, j) => {
    const rp = `${path}[${j}]`;
    if (typeof r !== "object" || r === null) { errors.push(`  ✗ ${rp}: Must be an object`); return; }
    if (!r.text && !r.field) errors.push(`  ✗ ${rp}: Must define either 'text' or 'field'`);
    if (r.text  !== undefined && typeof r.text !== "string") errors.push(`  ✗ ${rp}.text: Must be a string`);
    if (r.field !== undefined && !DYNAMIC_FIELDS.includes(r.field))
      errors.push(`  ✗ ${rp}.field: Must be one of: ${DYNAMIC_FIELDS.join(", ")}`);
    if (r.color !== undefined && !HEX_RE.test(String(r.color)))
      errors.push(`  ✗ ${rp}.color: Must be a valid 6-digit hex color`);
    if (r.size  !== undefined && (typeof r.size !== "number" || r.size <= 0))
      errors.push(`  ✗ ${rp}.size: Must be a positive number (pt)`);
    for (const b of ["bold", "italics", "allCaps"]) {
      if (r[b] !== undefined && typeof r[b] !== "boolean")
        errors.push(`  ✗ ${rp}.${b}: Must be a boolean`);
    }
  });
}

function validateHeaderOrFooter(obj, field, errors) {
  if (typeof obj !== "object" || obj === null) {
    errors.push(`  ✗ ${field}: Must be a string or object`); return;
  }
  if (obj.text !== undefined && typeof obj.text !== "string")
    errors.push(`  ✗ ${field}.text: Must be a string`);
  if (!ALIGNS.includes(obj.align))
    errors.push(`  ✗ ${field}.align: Must be one of: ${ALIGNS.join(", ")}`);
  if (!Array.isArray(obj.paragraphs)) {
    errors.push(`  ✗ ${field}.paragraphs: Must be an array`); return;
  }
  obj.paragraphs.forEach((p, i) => {
    if (typeof p !== "object" || p === null) { errors.push(`  ✗ ${field}.paragraphs[${i}]: Must be an object`); return; }
    if (p.align !== undefined && !ALIGNS.includes(p.align))
      errors.push(`  ✗ ${field}.paragraphs[${i}].align: Must be one of: ${ALIGNS.join(", ")}`);
    validateRuns(p.runs, `${field}.paragraphs[${i}].runs`, errors);
  });
}

// ─── Main validator ───────────────────────────────────────────────────────────

function validateConfig(raw) {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, errors: ["Config must be a non-null object exported from project.config.js"], warnings: [], config: null };
  }

  const errors   = [];
  const warnings = [];
  const e = (p, msg) => errors.push(`  ✗ ${p}: ${msg}`);
  const w = (p, msg) => warnings.push(`  ⚠ ${p}: ${msg}`);

  // ── 1. Required fields ────────────────────────────────────────────────────
  for (const field of ["name", "input", "output"]) {
    if (raw[field] === undefined || raw[field] === null)
      e(field, "Required — must be a non-empty string");
    else if (typeof raw[field] !== "string" || !raw[field].trim())
      e(field, `Must be a non-empty string, got: ${JSON.stringify(raw[field])}`);
  }

  // ── 2. Deep-merge with defaults ───────────────────────────────────────────
  const cfg = deepMerge(DEFAULTS, raw);

  // Normalize header/footer
  if (typeof cfg.header === "string") cfg.header = { ...DEFAULTS.header, text: cfg.header };
  if (typeof cfg.footer === "string") cfg.footer = { ...DEFAULTS.footer, text: cfg.footer };
  if (!Array.isArray(cfg.header.paragraphs)) cfg.header.paragraphs = [];
  if (!Array.isArray(cfg.footer.paragraphs)) cfg.footer.paragraphs = [];

  // ── 3. page ───────────────────────────────────────────────────────────────
  {
    const pg = cfg.page;
    if (typeof pg.size === "string") {
      if (!PAGE_SIZES.includes(pg.size))
        e("page.size", `Unknown size "${pg.size}". Use: ${PAGE_SIZES.join(" | ")} or { width: mm, height: mm }`);
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
    if (key === "note" && Array.isArray(val)) continue; // Skip duplicate "note" edge case
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

  // ── 8. header & footer ────────────────────────────────────────────────────
  validateHeaderOrFooter(cfg.header, "header", errors);
  validateHeaderOrFooter(cfg.footer, "footer", errors);

  // ── 9. vars ───────────────────────────────────────────────────────────────
  if (cfg.vars !== null && typeof cfg.vars === "object" && !Array.isArray(cfg.vars)) {
    for (const [key, val] of Object.entries(cfg.vars)) {
      if (typeof val !== "string" && typeof val !== "number")
        w(`vars.${key}`, "Variable value should be a string or number");
    }
  } else if (cfg.vars !== undefined) {
    e("vars", "Must be a plain object { key: value } of string/number pairs");
  }

  // ── 10. sections[] ────────────────────────────────────────────────────────
  if (!Array.isArray(cfg.sections)) {
    e("sections", "Must be an array");
  } else {
    cfg.sections.forEach((sec, i) => {
      if (typeof sec !== "object" || sec === null) {
        e(`sections[${i}]`, "Must be an object"); return;
      }
      if (sec.orientation !== undefined && !ORIENTATIONS.includes(sec.orientation))
        e(`sections[${i}].orientation`, `Must be one of: ${ORIENTATIONS.join(", ")}`);
      if (sec.pageNumbers !== undefined) {
        if (typeof sec.pageNumbers !== "object" || sec.pageNumbers === null) {
          e(`sections[${i}].pageNumbers`, "Must be an object { start?, format? }");
        } else {
          if (sec.pageNumbers.start !== undefined && (!Number.isInteger(sec.pageNumbers.start) || sec.pageNumbers.start < 0)) {
            e(`sections[${i}].pageNumbers.start`, "Must be a non-negative integer");
          }
          if (sec.pageNumbers.format !== undefined && !PAGE_FORMATS.includes(sec.pageNumbers.format)) {
            e(`sections[${i}].pageNumbers.format`, `Must be one of: ${PAGE_FORMATS.join(", ")}`);
          }
        }
      }
    });
  }

  // ── 11. defaultAlignment ────────────────────────────────────────────────
  if (cfg.defaultAlignment !== undefined && cfg.defaultAlignment !== null) {
    if (typeof cfg.defaultAlignment !== "string") {
      e("defaultAlignment", `Must be one of: ${DEFAULT_PARAGRAPH_ALIGNS.join(", ")}`);
    } else {
      const normalizedAlign = cfg.defaultAlignment.trim().toLowerCase();
      if (!DEFAULT_PARAGRAPH_ALIGNS.includes(normalizedAlign)) {
        e("defaultAlignment", `Must be one of: ${DEFAULT_PARAGRAPH_ALIGNS.join(", ")}`);
      } else {
        cfg.defaultAlignment = normalizedAlign;
      }
    }
  }

  // ── 12. meta ──────────────────────────────────────────────────────────────
  if (cfg.meta) {
    if (cfg.meta.author   !== undefined && typeof cfg.meta.author   !== "string") e("meta.author", "Must be a string");
    if (cfg.meta.subject  !== undefined && typeof cfg.meta.subject  !== "string") e("meta.subject", "Must be a string");
    if (cfg.meta.keywords !== undefined && !Array.isArray(cfg.meta.keywords))     e("meta.keywords", "Must be an array of strings");
    if (cfg.meta.language !== undefined && typeof cfg.meta.language !== "string") e("meta.language", "Must be a string (BCP 47, e.g. 'en-US')");
  }

  return {
    valid:    errors.length === 0,
    errors,
    warnings,
    config:   errors.length === 0 ? cfg : null,
  };
}

module.exports = { validateConfig, DEFAULTS, PAGE_SIZES, PAGE_FORMATS, ALIGNS };
