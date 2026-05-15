/**
 * src/builder/header-footer.js
 * Header and footer docx element builders.
 *
 * Supports three modes:
 *   1. Rich mode  — `paragraphs: [{ runs: [...] }]` with full run-level control
 *   2. Object mode — `{ text, align, showPageNumbers }`
 *   3. String mode — plain text shorthand (resolved upstream before calling these)
 */
"use strict";

const {
  Header, Footer, Paragraph, TextRun, AlignmentType, BorderStyle, PageNumber,
} = require("docx");

const { ALIGN_MAP } = require("./page");

// ─── Run builder ──────────────────────────────────────────────────────────────

/**
 * Convert a rich-mode runs array into docx TextRun instances.
 * @param {object[]} runs     Array of run descriptors from config.
 * @param {object}   defaults Default TextRun properties.
 * @returns {TextRun[]}
 */
function makeRuns(runs, defaults) {
  const out = [];
  for (const run of (runs || [])) {
    // SECTIONPAGES is not reliably resolved by some DOCX->PDF converters.
    // Use TOTAL_PAGES so page totals remain visible in PDF output.
    const children = run.field === "PAGE_CURRENT"        ? [PageNumber.CURRENT]
                   : run.field === "PAGE_TOTAL"          ? [PageNumber.TOTAL_PAGES]
                   : run.field === "PAGE_SECTION_TOTAL"  ? [PageNumber.TOTAL_PAGES]
                   : undefined;
    out.push(new TextRun({
      text:    run.text,
      children,
      font:    run.font    ?? defaults.font,
      size:    run.size    ?  run.size * 2 : defaults.size,
      color:   run.color   ?? defaults.color,
      bold:    run.bold    ?? defaults.bold,
      italics: run.italics ?? defaults.italics,
      allCaps: run.allCaps ?? defaults.allCaps,
      break:   run.break,
    }));
  }
  return out;
}

// ─── Header builder ───────────────────────────────────────────────────────────

/**
 * Build a docx Header from a section config.
 * @param {object} cfg    Config object with `.header` property.
 * @param {object} colors Raw theme.colors object.
 * @param {string} FONT   Body font name.
 * @param {object} fsMap  theme.fontSize config object.
 * @returns {Header}
 */
function buildHeader(cfg, colors, FONT, fsMap) {
  const h     = cfg.header || {};
  const hdrFS = (fsMap.header || 9) * 2;
  const H2    = colors.secondary || "2E4C7E";
  const richParagraphs = Array.isArray(h.paragraphs) ? h.paragraphs : [];

  if (richParagraphs.length) {
    return new Header({
      children: richParagraphs.map((p, idx) => new Paragraph({
        alignment: ALIGN_MAP[p.align || h.align] || AlignmentType.CENTER,
        border:    idx === 0 ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: H2, space: 8 } } : undefined,
        spacing:   { before: p.spacingBefore ?? (idx === 0 ? 0 : 40), after: p.spacingAfter ?? 80 },
        children:  makeRuns(p.runs, { font: FONT, size: hdrFS, color: H2, bold: true, italics: false, allCaps: false }),
      })),
    });
  }

  return new Header({
    children: [new Paragraph({
      alignment: ALIGN_MAP[h.align] || AlignmentType.CENTER,
      border:    { bottom: { style: BorderStyle.SINGLE, size: 4, color: H2, space: 8 } },
      spacing:   { before: 0, after: 120 },
      children:  [new TextRun({ text: h.text || "", font: FONT, size: hdrFS, color: H2, bold: true })],
    })],
  });
}

// ─── Footer builder ───────────────────────────────────────────────────────────

/**
 * Build a docx Footer from a section config.
 * @param {object} cfg    Config object with `.footer` property.
 * @param {object} colors Raw theme.colors object.
 * @param {string} FONT   Body font name.
 * @param {object} fsMap  theme.fontSize config object.
 * @returns {Footer}
 */
function buildFooter(cfg, colors, FONT, fsMap) {
  const f     = cfg.footer || {};
  const ftrFS = (fsMap.footer || 9) * 2;
  const H2    = colors.secondary || "2E4C7E";
  const NOTE  = colors.note      || "555555";
  const ACCENT= colors.accent    || "2E75B6";
  const richParagraphs = Array.isArray(f.paragraphs) ? f.paragraphs : [];

  if (richParagraphs.length) {
    return new Footer({
      children: richParagraphs.map((p, idx) => new Paragraph({
        alignment: ALIGN_MAP[p.align || f.align] || AlignmentType.CENTER,
        border:    idx === 0 ? { top: { style: BorderStyle.SINGLE, size: 4, color: H2, space: 8 } } : undefined,
        spacing:   { before: p.spacingBefore ?? (idx === 0 ? 80 : 40), after: p.spacingAfter ?? 0 },
        children:  makeRuns(p.runs, { font: FONT, size: ftrFS, color: NOTE, bold: false, italics: false, allCaps: false }),
      })),
    });
  }

  const children = [];
  if (f.text) {
    children.push(new TextRun({
      text: f.showPageNumbers !== false ? f.text + "  —  " : f.text,
      font: FONT, size: ftrFS, color: NOTE,
    }));
  }
  if (f.showPageNumbers !== false) {
    children.push(new TextRun({ children: [PageNumber.CURRENT],     font: FONT, size: ftrFS, color: ACCENT, bold: true }));
    children.push(new TextRun({ text: " / ",                        font: FONT, size: ftrFS, color: NOTE }));
    children.push(new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: ftrFS, color: NOTE }));
  }

  return new Footer({
    children: [new Paragraph({
      alignment: ALIGN_MAP[f.align] || AlignmentType.CENTER,
      border:    { top: { style: BorderStyle.SINGLE, size: 4, color: H2, space: 8 } },
      spacing:   { before: 80, after: 0 },
      children,
    })],
  });
}

module.exports = { makeRuns, buildHeader, buildFooter };
