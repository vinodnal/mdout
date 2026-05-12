/**
 * src/renderer/styles.js
 * Word paragraph styles and list numbering definitions.
 *
 * All heading levels (1–4) have both numbered and non-TOC variants:
 *   Heading1 / Heading1NoToc, Heading2 / Heading2NoToc, …
 *
 * Additional styles: Normal, Caption, Blockquote, CodeBlock, TOC1–TOC4.
 */
"use strict";

const {
  BorderStyle, LevelFormat, AlignmentType,
  TabStopType, TabStopPosition, LeaderType,
} = require("docx");

/**
 * @param {object} ctx
 * @param {object}   ctx.C         Color map from buildColors()
 * @param {string}   ctx.FONT      Body font name
 * @param {string}   ctx.CODE_FONT Monospace font name
 * @param {number}   ctx.FS        Body font size (half-points)
 * @param {number}   ctx.H1_FS    H1 font size (half-points)
 * @param {number}   ctx.H2_FS
 * @param {number}   ctx.H3_FS
 * @param {number}   ctx.H4_FS
 * @param {number}   ctx.CAP_FS   Caption font size (half-points)
 * @param {number}   ctx.CODE_FS  Code font size (half-points)
 * @param {object}   ctx.SP       Spacing config
 */
function createStylesRenderer({ C, FONT, CODE_FONT, FS, H1_FS, H2_FS, H3_FS, H4_FS, CAP_FS, CODE_FS, SP, rtl = false }) {
  const hs = SP.headings;
  const defaultAlign = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const tocAlign = rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;

  function headingAlignment() {
    return rtl ? AlignmentType.RIGHT : undefined;
  }

  function makeStyles() {
    return {
      default: { document: { run: { font: FONT, size: FS, color: C.BODY } } },
      paragraphStyles: [
        // ── Heading 1 ──────────────────────────────────────────────────────
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H1_FS, bold: true, color: C.H1, allCaps: true },
          paragraph: {
            alignment: headingAlignment(),
            spacing: { before: hs.h1.before, after: hs.h1.after }, outlineLevel: 0,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.H1, space: 6 } },
          },
        },
        {
          id: "Heading1NoToc", name: "Heading 1 No TOC", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H1_FS, bold: true, color: C.H1, allCaps: true },
          paragraph: {
            alignment: headingAlignment(),
            spacing: { before: hs.h1.before, after: hs.h1.after },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.H1, space: 6 } },
          },
        },
        // ── Heading 2 ──────────────────────────────────────────────────────
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H2_FS, bold: true, color: C.H2 },
          paragraph: { alignment: headingAlignment(), spacing: { before: hs.h2.before, after: hs.h2.after }, outlineLevel: 1 },
        },
        {
          id: "Heading2NoToc", name: "Heading 2 No TOC", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H2_FS, bold: true, color: C.H2 },
          paragraph: { alignment: headingAlignment(), spacing: { before: hs.h2.before, after: hs.h2.after } },
        },
        // ── Heading 3 ──────────────────────────────────────────────────────
        {
          id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H3_FS, bold: true, color: C.H3 },
          paragraph: { alignment: headingAlignment(), spacing: { before: hs.h3.before, after: hs.h3.after }, outlineLevel: 2 },
        },
        {
          id: "Heading3NoToc", name: "Heading 3 No TOC", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H3_FS, bold: true, color: C.H3 },
          paragraph: { alignment: headingAlignment(), spacing: { before: hs.h3.before, after: hs.h3.after } },
        },
        // ── Heading 4 ──────────────────────────────────────────────────────
        {
          id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H4_FS, bold: true, italics: true, color: C.H4 },
          paragraph: { alignment: headingAlignment(), spacing: { before: hs.h4.before, after: hs.h4.after }, outlineLevel: 3 },
        },
        {
          id: "Heading4NoToc", name: "Heading 4 No TOC", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H4_FS, bold: true, italics: true, color: C.H4 },
          paragraph: { alignment: headingAlignment(), spacing: { before: hs.h4.before, after: hs.h4.after } },
        },
        // ── Body ───────────────────────────────────────────────────────────
        {
          id: "Normal", name: "Normal",
          run:       { font: FONT, size: FS, color: C.BODY },
          paragraph: { alignment: defaultAlign, spacing: { line: SP.paragraphLine, after: SP.paragraphAfter } },
        },
        // ── Caption ────────────────────────────────────────────────────────
        {
          id: "Caption", name: "Caption", basedOn: "Normal",
          run:       { font: FONT, size: CAP_FS, italics: true, color: C.NOTE },
          paragraph: { alignment: rtl ? AlignmentType.RIGHT : AlignmentType.CENTER, spacing: { before: 80, after: 160 } },
        },
        // ── TOC entries ────────────────────────────────────────────────────
        {
          id: "TOC1", name: "TOC 1", basedOn: "Normal", quickFormat: true,
          run:       { font: FONT, size: FS, bold: true, color: C.H1 },
          paragraph: {
            alignment: tocAlign, spacing: { before: 0, after: 80 },
            indent: { left: 0, hanging: 0 },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
          },
        },
        {
          id: "TOC2", name: "TOC 2", basedOn: "Normal", quickFormat: true,
          run:       { font: FONT, size: Math.max(FS - 1, 16), color: C.H2 },
          paragraph: {
            alignment: tocAlign, spacing: { before: 0, after: 60 },
            indent: { left: 240, hanging: 0 },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
          },
        },
        {
          id: "TOC3", name: "TOC 3", basedOn: "Normal", quickFormat: true,
          run:       { font: FONT, size: Math.max(FS - 2, 16), color: C.H3 },
          paragraph: {
            alignment: tocAlign, spacing: { before: 0, after: 40 },
            indent: { left: 480, hanging: 0 },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
          },
        },
        {
          id: "TOC4", name: "TOC 4", basedOn: "Normal", quickFormat: true,
          run:       { font: FONT, size: Math.max(FS - 2, 16), italics: true, color: C.H4 },
          paragraph: {
            alignment: tocAlign, spacing: { before: 0, after: 40 },
            indent: { left: 720, hanging: 0 },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
          },
        },
        // ── Code block ─────────────────────────────────────────────────────
        {
          id: "CodeBlock", name: "Code Block", basedOn: "Normal",
          run:       { font: CODE_FONT, size: CODE_FS, color: C.CODE },
          paragraph: { spacing: { before: 60, after: 60, line: SP.codeLineSpacing } },
        },
        // ── Blockquote ─────────────────────────────────────────────────────
        {
          id: "Blockquote", name: "Blockquote", basedOn: "Normal",
          run: { font: FONT, size: FS, italics: true, color: C.NOTE },
          paragraph: {
            spacing: { before: 120, after: 120 },
            indent:  { left: 720, right: 720 },
            border:  { left: { style: BorderStyle.SINGLE, size: 12, color: C.ACCENT, space: 12 } },
          },
        },
      ],
    };
  }

  function makeNumbering() {
    return {
      config: [
        {
          reference: "headings",
          levels: [
            { level: 0, format: LevelFormat.UPPER_ROMAN, text: "%1.", alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
            { level: 1, format: LevelFormat.DECIMAL, text: "%2.", alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
            { level: 2, format: LevelFormat.DECIMAL, text: "%2.%3.", alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
            { level: 3, format: LevelFormat.DECIMAL, text: "%2.%3.%4.", alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
          ],
        },
        {
          reference: "bullets",
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720,  hanging: 360 } } } },
            { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
            { level: 2, format: LevelFormat.BULLET, text: "\u25AA", alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
          ],
        },
        {
          reference: "numbers",
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          ],
        },
      ],
    };
  }

  return { makeStyles, makeNumbering };
}

module.exports = { createStylesRenderer };
