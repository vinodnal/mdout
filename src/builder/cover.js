/**
 * src/builder/cover.js
 * Built-in cover page entry renderer.
 *
 * Cover entries are plain objects with shape:
 *   { text, style, size?, color?, font?, bold?, italics?, allCaps?, after? }
 *   { spacer: N }   — vertical space in DXA units
 *
 * Available styles: overline | institution | banner | title | subtitle | chapterTitle | year
 */
"use strict";

const { Paragraph, TextRun, AlignmentType } = require("docx");

const STYLE_DEFS = {
  overline:     { size: 20, color: null,    bold: false, italics: false, allCaps: false },
  institution:  { size: 22, color: null,    bold: true,  italics: false, allCaps: false },
  banner:       { size: 32, color: null,    bold: true,  italics: false, allCaps: true  },
  title:        { size: 28, color: null,    bold: true,  italics: false, allCaps: false },
  subtitle:     { size: 22, color: "H2",   bold: false, italics: false, allCaps: false },
  chapterTitle: { size: 24, color: "H3",   bold: true,  italics: false, allCaps: false },
  year:         { size: 20, color: "NOTE", bold: false, italics: true,  allCaps: false },
};

/**
 * Build a single docx Paragraph for a cover entry.
 *
 * @param {object} entry   Cover entry descriptor.
 * @param {string} FONT    Body font name.
 * @param {object} colors  Raw theme.colors config object.
 * @param {object} vars    Template variables for {{name}} substitution.
 * @returns {Paragraph}
 */
function buildCoverParagraph(entry, FONT, colors, vars) {
  function subVars(text) {
    if (!text || typeof text !== "string") return text;
    return text.replace(/\{\{([\w.]+)\}\}/g, (_, k) =>
      (vars && k in vars ? String(vars[k]) : `{{${k}}}`)
    );
  }

  // Spacer entry — empty paragraph with spacing
  if ("spacer" in entry) {
    return new Paragraph({
      children: [new TextRun("")],
      spacing:  { before: entry.spacer, after: 0 },
    });
  }

  const def = STYLE_DEFS[entry.style] || {};

  // Resolve color: entry.color overrides style default; fallback to theme or primary
  function resolveColor(key) {
    const themeMap = {
      H1: colors.primary   || "1F3864",
      H2: colors.secondary || "2E4C7E",
      H3: colors.accent    || "2E75B6",
      NOTE: colors.note    || "555555",
    };
    if (!key) return colors.primary || "1F3864";
    return themeMap[key] || key;
  }

  const sz  = entry.size  ? entry.size * 2  : (def.size  || 22);
  const clr = entry.color || resolveColor(def.color);
  const run = {
    font:    entry.font    || FONT,
    size:    sz,
    color:   clr,
    bold:    entry.bold    ?? def.bold    ?? false,
    italics: entry.italics ?? def.italics ?? false,
    allCaps: entry.allCaps ?? def.allCaps ?? false,
  };

  const children = [];
  (subVars(entry.text) || "").split("\n").forEach((line, i) => {
    if (i > 0) children.push(new TextRun({ break: 1 }));
    children.push(new TextRun({ ...run, text: line }));
  });

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { after: entry.after ?? 120 },
    children,
  });
}

module.exports = { buildCoverParagraph };
