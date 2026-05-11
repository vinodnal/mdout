/**
 * src/renderer/elements.js
 * Block-level element factories: paragraphs, headings, captions, callouts,
 * images, math blocks, code blocks, lists, and the table of contents.
 */
"use strict";

const {
  Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, ImageRun, TableOfContents,
  Bookmark, BookmarkType,
} = require("docx");

const { latexToMathParagraph }   = require("../math");
const { readImageDimensions }    = require("./image-utils");

// ─── RTL Detection ────────────────────────────────────────────────────────────

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

function hasArabic(text) {
  return ARABIC_RE.test(String(text || ""));
}

// ─── Caption labels ───────────────────────────────────────────────────────────

const CAPTION_LABELS = {
  figure: "Figure",
  table:  "Tableau",
  annex:  "Annexe",
};

/**
 * @param {object} ctx
 * @param {object}   ctx.C              Color map
 * @param {string}   ctx.FONT           Body font
 * @param {string}   ctx.CODE_FONT      Monospace font
 * @param {string}   ctx.MATH_FONT      Math font
 * @param {number}   ctx.FS             Body size (half-points)
 * @param {number}   ctx.CAP_FS         Caption size (half-points)
 * @param {number}   ctx.CODE_FS        Code size (half-points)
 * @param {object}   ctx.SP             Spacing config
 * @param {number}   ctx.CONTENT_W      Content width (DXA)
 * @param {object}   ctx.fsMap          Raw font size map (points)
 * @param {Function} ctx.applyVars      Variable substitution
 * @param {Function} ctx.parseInlineRuns Inline run parser
 * @param {object}   ctx.logger         Logger instance (may be null)
 * @param {object}   ctx.CALLOUT_STYLES Callout style definitions
 */
function createElementsRenderer({
  C, FONT, CODE_FONT, MATH_FONT, FS, CAP_FS, CODE_FS,
  SP, CONTENT_W, fsMap, applyVars, parseInlineRuns, logger, CALLOUT_STYLES,
}) {

  // ── Caption helpers ───────────────────────────────────────────────────────

  function getCaptionLabel(kind, text) {
    const lower = (kind || "").toLowerCase();
    if (CAPTION_LABELS[lower]) return CAPTION_LABELS[lower];
    const match = (text || "").trim().match(/^(Figure|Tableau|Table|Annexe)\b/i);
    if (match) {
      if (/^table$/i.test(match[1])) return "Tableau";
      return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
    }
    return null;
  }

  function consumeElementNumber(kind, state = {}) {
    const lower = (kind || "").toLowerCase();
    if (lower === "annex") {
      const index = Math.max(0, Number(state.annexIndex || 0));
      state.annexIndex = index + 1;
      return String.fromCharCode(65 + (index % 26));
    }
    if (lower === "figure") {
      const index = Math.max(0, Number(state.figureIndex || 0));
      state.figureIndex = index + 1;
      return String(index + 1);
    }
    if (lower === "table") {
      const index = Math.max(0, Number(state.tableIndex || 0));
      state.tableIndex = index + 1;
      return String(index + 1);
    }
    return null;
  }

  function parseCaptionSpec(text, opts = {}) {
    const raw             = String(text || "").trim().replace(/\s+/g, " ");
    const normalizedRaw   = raw.replace(/[–—]/g, "-");
    const explicitKind    = opts.kind ? String(opts.kind).toLowerCase() : null;
    const label           = getCaptionLabel(explicitKind, raw);
    const prefixRe        = /^(Figure|Tableau|Table|Annexe)\s*(?:[A-Za-z0-9.]+)?\s*[:-]+\s*/i;
    let title             = raw;
    if (!explicitKind) {
      const match = normalizedRaw.match(prefixRe);
      if (match) title = raw.slice(match[0].length).trim();
    }
    return { kind: explicitKind || (label ? label.toLowerCase() : null), label, title };
  }

  function makeCaptionText(text, opts = {}) {
    const spec   = parseCaptionSpec(text, opts);
    const label  = spec.label || getCaptionLabel(opts.kind, spec.title);
    const number = consumeElementNumber(spec.kind || opts.kind, opts.state);
    if (label && number) return `${label} ${number}${spec.title ? ` - ${spec.title}` : ""}`;
    if (label)           return spec.title ? `${label} - ${spec.title}` : label;
    return spec.title || String(text || "");
  }

  function makeElementTitle(kind, title, opts = {}) {
    const captionText = makeCaptionText(title, { ...opts, kind });
    const isArabic = hasArabic(captionText);
    const para = {
      style:     "Caption",
      alignment: isArabic ? AlignmentType.RIGHT : opts.alignment,
      children:  parseInlineRuns(captionText),
    };
    if (isArabic) {
      para.bidi = true;
    }
    return new Paragraph(para);
  }

  // ── Block elements ────────────────────────────────────────────────────────

  function makeParagraph(text, opts = {}) {
    const appliedText = applyVars(text);
    const isArabic = hasArabic(appliedText);
    const para = {
      children:  parseInlineRuns(appliedText),
      spacing:   { line: SP.paragraphLine, after: SP.paragraphAfter },
      alignment: isArabic ? AlignmentType.RIGHT : opts.alignment,
      indent:    opts.indent,
    };
    if (isArabic) {
      para.bidi = true;
    }
    return new Paragraph(para);
  }

  function makeHeading(text, level, opts = {}) {
    const lvlMap = {
      1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4,
    };
    const clean = applyVars(text)
      .replace(/\*\*/g, "").replace(/\*/g, "")
      .replace(/^(?:[IVXivx]+\s*[-\u2013]\s*|\d+(?:\.\d+)*[.]\s*|\d+(?:\.\d+)+\s+|\d+\s*[-\u2013]\s*|[a-e][)]\s*)/, "")
      .trim();
    const clampedLevel = Math.max(1, Math.min(4, level || 1));
    const isArabic = hasArabic(clean);
    const para = {
      alignment: opts.alignment ?? (isArabic ? AlignmentType.RIGHT : (opts.nonumber ? AlignmentType.CENTER : undefined)),
      children:  [new TextRun(clean)],
    };
    if (isArabic) {
      para.bidi = true;
    }
    if (!opts.nonumber) {
      para.heading   = lvlMap[clampedLevel] || HeadingLevel.HEADING_1;
      para.numbering = { reference: "headings", level: Math.max(0, Math.min(3, (level || 1) - 1)) };
    } else {
      para.style = `Heading${clampedLevel}NoToc`;
    }
    if (opts.pageBreakBefore) para.pageBreakBefore = true;
    return new Paragraph(para);
  }

  function makeCaption(text, opts = {}) {
    const clean = String(text || "").replace(/^\*/, "").replace(/\*$/, "").trim();
    const captionText = makeCaptionText(clean, opts);
    const isArabic = hasArabic(captionText);
    const para = {
      style:     "Caption",
      alignment: isArabic ? AlignmentType.RIGHT : opts.alignment,
      children:  parseInlineRuns(captionText),
    };
    if (isArabic) {
      para.bidi = true;
    }
    return new Paragraph(para);
  }

  function makeBlockquote(text, opts = {}) {
    const clean = text.replace(/^>\s*/, "").trim();
    const isArabic = hasArabic(clean);
    const para = {
      style:     "Blockquote",
      alignment: isArabic ? AlignmentType.RIGHT : opts.alignment,
      children:  parseInlineRuns(clean),
    };
    if (isArabic) {
      para.bidi = true;
    }
    return new Paragraph(para);
  }

  function makeMathParagraph(formula) {
    return latexToMathParagraph(formula, {
      logger,
      accentColor: C.H2,
      mathBg:      C.MATHBG,
      font:        MATH_FONT,
      fontSize:    fsMap.body || 11,
    });
  }

  function makeCodeBlock(codeLines) {
    const paragraphs = codeLines.map(line =>
      new Paragraph({
        children: [new TextRun({ text: line || " ", font: CODE_FONT, size: CODE_FS, color: C.CODE })],
        spacing:  { line: SP.codeLineSpacing, before: 0, after: 0 },
      })
    );
    const border = { style: BorderStyle.SINGLE, size: 6, color: C.ACCENT };
    return new Table({
      width:        { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      rows: [new TableRow({ children: [new TableCell({
        borders: { top: border, bottom: border, left: border, right: border },
        width:   { size: CONTENT_W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: C.CODEBG },
        margins: { top: 120, bottom: 120, left: 200, right: 200 },
        children: paragraphs,
      })] })],
    });
  }

  function makeBullet(text, level = 0) {
    return new Paragraph({
      numbering: { reference: "bullets", level },
      children:  parseInlineRuns(text.replace(/^[-*]\s+/, "")),
      spacing:   { line: SP.paragraphLine, after: SP.bulletAfter },
    });
  }

  function makeNumbered(text) {
    return new Paragraph({
      numbering: { reference: "numbers", level: 0 },
      children:  parseInlineRuns(text.replace(/^\d+\.\s+/, "")),
      spacing:   { line: SP.paragraphLine, after: SP.bulletAfter },
    });
  }

  function makeElementList(kind, entries = []) {
    if (!Array.isArray(entries) || !entries.length) return [];
    return entries.map(text => new Paragraph({
      style:     "Caption",
      alignment: AlignmentType.LEFT,
      children:  parseInlineRuns(String(text)),
      spacing:   { line: SP.paragraphLine, after: 60 },
    }));
  }

  /**
   * Admonition / callout block.
   * @param {string|string[]} content  Paragraph text or array of lines.
   * @param {string} style             "info"|"warning"|"tip"|"danger"|"note"|"box"|"quote"
   * @param {object} opts
   */
  function makeCallout(content, style = "info", opts = {}) {
    const def         = CALLOUT_STYLES[style] || CALLOUT_STYLES.info;
    const borderColor = C[def.colorKey] || C.H1;
    const bgColor     = C[def.bgKey]    || C.MATHBG;
    const icon        = def.icon;

    const lines = Array.isArray(content) ? content : [content];
    const contentParagraphs = lines.map(line => new Paragraph({
      spacing:  { line: SP.paragraphLine, after: 80 },
      children: parseInlineRuns(applyVars(line)),
    }));

    const border     = { style: BorderStyle.SINGLE, size: 6,  color: borderColor };
    const thickLeft  = { style: BorderStyle.SINGLE, size: 16, color: borderColor };
    const CALLOUT_W  = Math.max(1200, CONTENT_W - 120);

    if (!icon) {
      // Box style — single cell, thick left border
      return new Table({
        width:        { size: CALLOUT_W, type: WidthType.DXA },
        columnWidths: [CALLOUT_W],
        rows: [new TableRow({ children: [new TableCell({
          borders:  { top: border, bottom: border, left: thickLeft, right: border },
          width:    { size: CALLOUT_W, type: WidthType.DXA },
          shading:  { type: ShadingType.CLEAR, fill: bgColor },
          margins:  { top: 140, bottom: 140, left: 300, right: 200 },
          children: contentParagraphs,
        })] })],
      });
    }

    // Icon cell + content cell
    const iconWidth    = 500;
    const contentWidth = CALLOUT_W - iconWidth;
    return new Table({
      width:        { size: CALLOUT_W, type: WidthType.DXA },
      columnWidths: [iconWidth, contentWidth],
      rows: [new TableRow({ children: [
        new TableCell({
          borders:       { top: border, bottom: border, left: border, right: { style: BorderStyle.NONE } },
          width:         { size: iconWidth, type: WidthType.DXA },
          shading:       { type: ShadingType.CLEAR, fill: bgColor },
          verticalAlign: VerticalAlign.CENTER,
          margins:       { top: 140, bottom: 140, left: 120, right: 80 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children:  [new TextRun({ text: icon, font: FONT, size: (fsMap.body || 11) * 2 + 4, color: borderColor })],
          })],
        }),
        new TableCell({
          borders:  { top: border, bottom: border, left: { style: BorderStyle.NONE }, right: border },
          width:    { size: contentWidth, type: WidthType.DXA },
          shading:  { type: ShadingType.CLEAR, fill: bgColor },
          margins:  { top: 140, bottom: 140, left: 200, right: 200 },
          children: contentParagraphs,
        }),
      ] })],
    });
  }

  /** @deprecated Use makeCallout(text, 'box') instead. */
  function makeBoxedText(text, opts = {}) {
    return makeCallout(text, "box", opts);
  }

  /**
   * Word bookmark anchor for cross-references.
   * @param {string} id  Bookmark ID (letters/numbers/underscores only).
   */
  function makeAnchor(id) {
    const safeId = String(id || "").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
    if (!safeId) return null;
    try {
      return new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new Bookmark({
          id:       safeId,
          type:     BookmarkType.START,
          children: [new TextRun("")],
        })],
      });
    } catch {
      return new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun("")] });
    }
  }

  function makeImage(data, ext, opts = {}) {
    const dims = readImageDimensions(data);
    const maxPx  = opts.width ? Math.max(1, parseInt(opts.width) || 1) : Math.round(CONTENT_W / 15);
    const safeW  = dims.width  || 480;
    const safeH  = dims.height || 320;
    const scale  = maxPx / safeW;
    const typeMap = { ".png": "png", ".jpg": "jpg", ".jpeg": "jpg", ".gif": "gif", ".bmp": "bmp", ".webp": "png" };
    const imgType = typeMap[(ext || ".png").toLowerCase()] || "png";

    if (logger && data.length > 5 * 1024 * 1024) {
      logger.warn(`Image is very large (${(data.length / 1024 / 1024).toFixed(1)} MB) — may slow builds.`, "W005");
    }

    const elems = [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { before: 160, after: opts.caption ? 60 : 200 },
      children:  [new ImageRun({
        data,
        transformation: { width: Math.round(safeW * scale), height: Math.round(safeH * scale) },
        type: imgType,
      })],
    })];
    if (opts.caption || opts.title || opts.kind) elems.push(makeCaption(opts.caption || opts.title || "", opts));
    return elems;
  }

  function makeTableOfContents(opts = {}) {
    const maxDepth = opts.depth ? Math.max(1, Math.min(9, opts.depth)) : 4;
    return new TableOfContents(opts.alias || "Table of Contents", {
      headingStyleRange:               opts.headingStyleRange || `1-${maxDepth}`,
      hyperlink:                       opts.hyperlink ?? true,
      useAppliedParagraphOutlineLevel: opts.useAppliedParagraphOutlineLevel ?? true,
      beginDirty:                      opts.beginDirty ?? true,
      preserveTabInEntries:            false,
      cachedEntries: Array.isArray(opts.cachedEntries) ? opts.cachedEntries : undefined,
    });
  }

  return {
    makeParagraph,
    makeHeading,
    makeCaption,
    makeBlockquote,
    makeMathParagraph,
    makeCodeBlock,
    makeBullet,
    makeNumbered,
    makeElementList,
    makeCallout,
    makeBoxedText,
    makeAnchor,
    makeImage,
    makeTableOfContents,
    makeElementTitle,
  };
}

module.exports = { createElementsRenderer };
