/**
 * src/math/index.js
 * Public API for the mdout math subsystem.
 *
 * Combines the symbol tables, tokenizer, and recursive parser into two
 * high-level functions consumed by the renderer:
 *   latexToMathParagraph  — Block equation → docx Paragraph with OMML Math element.
 *   latexToInlineRun      — Inline equation → docx TextRun (always Unicode).
 *
 * Falls back to latexToReadable() (Unicode text) when OMML rendering fails or
 * the docx Math API is unavailable, and logs a W004 warning.
 */
"use strict";

const { latexToReadable } = require("../latex");
const { tokenize }        = require("./tokenize");
const { DocxMath, MathRun, MathSuperScript, parseExpr } = require("./parse");

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert a LaTeX formula to a docx Paragraph containing a real Math element.
 * Returns a Paragraph (never throws; falls back to Unicode on errors).
 *
 * @param {string} formula    LaTeX formula string (with or without $…$ delimiters).
 * @param {object} [opts]
 * @param {object} [opts.logger]       Logger for W004 warnings.
 * @param {string} [opts.accentColor]  Hex accent color for the fallback border style.
 * @param {string} [opts.mathBg]       Hex background color for the fallback style.
 * @param {string} [opts.font]         Font name for the fallback style.
 * @param {number} [opts.fontSize]     Font size (pt) for the fallback style.
 * @returns {import("docx").Paragraph}
 */
function latexToMathParagraph(formula, opts = {}) {
  const { Paragraph, TextRun, AlignmentType, BorderStyle, ShadingType } = require("docx");

  const accentColor = opts.accentColor || "2E75B6";
  const mathBg      = opts.mathBg      || "EEF4FB";
  const font        = opts.font        || "Cambria Math";
  const fontSize    = ((opts.fontSize  || 11) * 2) + 4;

  // Strip outer delimiters ($$ … $$ or $ … $)
  const clean = String(formula ?? "").trim()
    .replace(/^\$\$/, "").replace(/\$\$$/, "")
    .replace(/^\$/, "").replace(/\$$/, "")
    .trim();

  // ── OMML rendering ────────────────────────────────────────────────────────
  if (DocxMath && MathRun && MathSuperScript) {
    try {
      const tokens = tokenize(clean);
      const { elements } = parseExpr(tokens, 0);
      const filtered = elements.filter(Boolean);
      if (filtered.length > 0) {
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing:   { before: 200, after: 200 },
          children:  [new DocxMath({ children: filtered })],
        });
      }
    } catch (err) {
      if (opts.logger) {
        opts.logger.warn(
          `OMML rendering failed for formula "${clean.slice(0, 40)}…": ${err.message}`,
          "W004"
        );
      }
    }
  }

  // ── Unicode fallback ──────────────────────────────────────────────────────
  if (opts.logger && (!DocxMath || !MathRun)) {
    opts.logger.warn("docx Math API unavailable — using Unicode math rendering.", "W004");
  }
  const readable = latexToReadable(formula);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { before: 200, after: 200 },
    border: {
      left:  { style: BorderStyle.SINGLE, size: 8, color: accentColor, space: 10 },
      right: { style: BorderStyle.SINGLE, size: 8, color: accentColor, space: 10 },
    },
    shading:  { type: ShadingType.CLEAR, fill: mathBg },
    indent:   { left: 400, right: 400 },
    children: [new TextRun({ text: readable, font, size: fontSize, bold: true, color: accentColor })],
  });
}

/**
 * Convert an inline LaTeX expression to a TextRun (for use inside paragraphs).
 * Always uses Unicode — OMML is block-level only in Word.
 *
 * @param {string} formula
 * @param {object} [opts]
 * @param {string} [opts.font]
 * @param {number} [opts.fontSize]
 * @param {string} [opts.color]
 * @returns {import("docx").TextRun}
 */
function latexToInlineRun(formula, opts = {}) {
  const { TextRun } = require("docx");
  const readable = latexToReadable(formula);
  return new TextRun({
    text:    readable,
    italics: true,
    font:    opts.font  || "Cambria Math",
    size:    (opts.fontSize || 11) * 2,
    color:   opts.color || "2E4C7E",
  });
}

module.exports = { latexToMathParagraph, latexToInlineRun };
