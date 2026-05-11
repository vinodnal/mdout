// core/docx-renderer.js — backward-compat shim. Delegates to src/renderer.js.
module.exports = require("../src/renderer");
// ─── Original implementation below (not executed) ────────────────────────────
/** @deprecated Use require('mdoc/src/renderer') directly.
 * core/docx-renderer.js
 * Theme-aware factory for docx element constructors.
 * Accepts the nested theme shape from the validated project config.
 *
 * Usage:
 *   const { createRenderer } = require('./core/docx-renderer');
 *   const R = createRenderer(config.theme, { contentWidth });
 */

"use strict";

const {
  Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, LevelFormat,
  ExternalHyperlink, UnderlineType, ImageRun, TableOfContents,
} = require("docx");

const { latexToReadable } = require("./latex");

// ─── Color map ────────────────────────────────────────────────────────────────

function buildColors(colors = {}) {
  return {
    H1:      colors.primary     || "1F3864",
    H2:      colors.secondary   || "2E4C7E",
    H3:      colors.accent      || "2E75B6",
    H4:      colors.h4          || "4472C4",
    BODY:    colors.body        || "1A1A1A",
    NOTE:    colors.note        || "555555",
    CODE:    colors.code        || "2D2D2D",
    CODEBG:  colors.codeBg      || "F5F5F5",
    HDRFILL: colors.primary     || "1F3864",
    HDRTEXT: colors.headerText  || "FFFFFF",
    ROWALT:  colors.rowAlt      || "EBF2FA",
    ROWBASE: "FFFFFF",
    BORDER:  colors.tableBorder || "AAAAAA",
    ACCENT:  colors.accent      || "2E75B6",
    MATHBG:  colors.mathBg      || "EEF4FB",
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function createRenderer(theme = {}, pageConfig = {}) {
  // ── Extract nested theme sections with safe fallbacks ─────────────────────
  const colors     = theme.colors    || {};
  const fonts      = theme.fonts     || {};
  const fsMap      = theme.fontSize  || {};
  const spacingCfg = theme.spacing   || {};
  const headingSp  = spacingCfg.headings || {};

  const C         = buildColors(colors);
  const FONT      = fonts.body || "Calibri";
  const CODE_FONT = fonts.code || "Courier New";
  const MATH_FONT = fonts.math || "Cambria Math";

  // Half-points (docx size unit = half a pt)
  const FS      = (fsMap.body    || 11) * 2;
  const H1_FS   = (fsMap.h1      || 18) * 2;
  const H2_FS   = (fsMap.h2      || 14) * 2;
  const H3_FS   = (fsMap.h3      || 12) * 2;
  const H4_FS   = (fsMap.h4      || 11) * 2;
  const CAP_FS  = (fsMap.caption ||  9) * 2;
  const CODE_FS = (fsMap.code    ||  9) * 2;

  // Spacing constants (DXA)
  const SP = {
    paragraphLine:   spacingCfg.paragraphLine   ?? 320,
    paragraphAfter:  spacingCfg.paragraphAfter  ?? 120,
    bulletAfter:     spacingCfg.bulletAfter      ?? 80,
    codeLineSpacing: spacingCfg.codeLineSpacing ?? 220,
    headings: {
      h1: headingSp.h1 || { before: 480, after: 240 },
      h2: headingSp.h2 || { before: 360, after: 180 },
      h3: headingSp.h3 || { before: 280, after: 140 },
      h4: headingSp.h4 || { before: 200, after: 100 },
    },
  };

  const CONTENT_W = pageConfig.contentWidth || 9070;

  const CAPTION_LABELS = {
    figure: "Figure",
    table:  "Tableau",
    annex:  "Annexe",
  };

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
    const raw = String(text || "").trim().replace(/\s+/g, " ");
    const normalizedRaw = raw.replace(/[–—]/g, "-");
    const explicitKind = opts.kind ? String(opts.kind).toLowerCase() : null;
    const label = getCaptionLabel(explicitKind, raw);
    const prefixRe = /^(Figure|Tableau|Table|Annexe)\s*(?:[A-Za-z0-9.]+)?\s*[:-]+\s*/i;
    let title = raw;

    if (explicitKind) {
      title = raw;
    } else {
      const match = normalizedRaw.match(prefixRe);
      if (match) {
        title = raw.slice(match[0].length).trim();
      }
    }

    return {
      kind: explicitKind || (label ? label.toLowerCase() : null),
      label,
      title,
    };
  }

  function makeCaptionText(text, opts = {}) {
    const spec = parseCaptionSpec(text, opts);
    const label = spec.label || getCaptionLabel(opts.kind, spec.title);
    const number = consumeElementNumber(spec.kind || opts.kind, opts.state);

    if (label && number) {
      return `${label} ${number}${spec.title ? ` - ${spec.title}` : ""}`;
    }
    if (label) {
      return spec.title ? `${label} - ${spec.title}` : label;
    }
    return spec.title || String(text || "");
  }

  function makeElementTitle(kind, title, opts = {}) {
    return new Paragraph({
      style: "Caption",
      alignment: opts.alignment,
      children: parseInlineRuns(makeCaptionText(title, { ...opts, kind })),
    });
  }

  function makeTableOfContents(opts = {}) {
    return new TableOfContents(opts.alias || "Table of Contents", {
      headingStyleRange: opts.headingStyleRange || "1-4",
      hyperlink: opts.hyperlink ?? true,
      useAppliedParagraphOutlineLevel: opts.useAppliedParagraphOutlineLevel ?? true,
      beginDirty: opts.beginDirty ?? true,
      preserveTabInEntries: opts.preserveTabInEntries ?? true,
      cachedEntries: Array.isArray(opts.cachedEntries) ? opts.cachedEntries : undefined,
    });
  }

  // ── Inline runs ───────────────────────────────────────────────────────────

  function parseInlineRuns(text) {
    const source = String(text ?? "");
    const runs = [];
    const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\(([^)]+)\)|\$(.+?)\$)/gs;
    const brRe = /<br\s*\/?\s*>/gi;
    let segmentStart = 0;
    let brMatch;

    function pushStyledRuns(segment) {
      if (!segment) return;
      let last = 0;
      let m;
      while ((m = re.exec(segment)) !== null) {
        if (m.index > last) {
          runs.push(new TextRun({ text: segment.slice(last, m.index), font: FONT, size: FS, color: C.BODY }));
        }
        if      (m[2] !== undefined)
          runs.push(new TextRun({ text: m[2], bold: true, font: FONT, size: FS, color: C.BODY }));
        else if (m[3] !== undefined)
          runs.push(new TextRun({ text: m[3], italics: true, font: FONT, size: FS, color: C.BODY }));
        else if (m[4] !== undefined)
          runs.push(new TextRun({ text: m[4], font: CODE_FONT, size: CODE_FS, color: C.CODE, shading: { type: ShadingType.CLEAR, fill: C.CODEBG } }));
        else if (m[5] !== undefined)
          runs.push(new ExternalHyperlink({ link: m[6], children: [new TextRun({ text: m[5], color: C.ACCENT, underline: { type: UnderlineType.SINGLE, color: C.ACCENT }, font: FONT, size: FS })] }));
        else if (m[7] !== undefined)
          runs.push(new TextRun({ text: latexToReadable(m[7]), italics: true, font: MATH_FONT, size: FS, color: C.H3 }));
        last = re.lastIndex;
      }
      if (last < segment.length) {
        runs.push(new TextRun({ text: segment.slice(last), font: FONT, size: FS, color: C.BODY }));
      }
      re.lastIndex = 0;
    }

    while ((brMatch = brRe.exec(source)) !== null) {
      pushStyledRuns(source.slice(segmentStart, brMatch.index));
      runs.push(new TextRun({ break: 1 }));
      segmentStart = brMatch.index + brMatch[0].length;
    }
    pushStyledRuns(source.slice(segmentStart));

    return runs.length ? runs : [new TextRun({ text: source, font: FONT, size: FS, color: C.BODY })];
  }

  // ── Paragraph elements ────────────────────────────────────────────────────

  function makeParagraph(text, opts = {}) {
    return new Paragraph({
      children: parseInlineRuns(text),
      spacing:  { line: SP.paragraphLine, after: SP.paragraphAfter },
      ...opts,
    });
  }

  function makeHeading(text, level, opts = {}) {
    const lvlMap = {
      1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4,
    };
    const clean = text
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/^(?:[IVXivx]+\s*[-\u2013]\s*|\d+(?:\.\d+)*[.]\s*|\d+(?:\.\d+)+\s+|\d+\s*[-\u2013]\s*|[a-e][)]\s*)/, "")
      .trim();
    const para = {
      heading: lvlMap[level] || HeadingLevel.HEADING_1,
      alignment: opts.alignment ?? (opts.nonumber ? AlignmentType.CENTER : undefined),
      children: [new TextRun(clean)],
    };
    if (!opts.nonumber) {
      para.numbering = { reference: "headings", level: Math.max(0, Math.min(3, (level || 1) - 1)) };
    }
    return new Paragraph(para);
  }

  function makeCaption(text, opts = {}) {
    const clean = String(text || "").replace(/^\*/, "").replace(/\*$/, "").trim();
    return new Paragraph({
      style: "Caption",
      alignment: opts.alignment,
      children: parseInlineRuns(makeCaptionText(clean, opts)),
    });
  }

  function makeBlockquote(text, opts = {}) {
    const clean = text.replace(/^>\s*/, "").trim();
    return new Paragraph({ style: "Blockquote", alignment: opts.alignment, children: parseInlineRuns(clean) });
  }

  function makeMathParagraph(formula) {
    const readable = latexToReadable(formula);
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { before: 200, after: 200 },
      border: {
        left:  { style: BorderStyle.SINGLE, size: 8, color: C.ACCENT, space: 10 },
        right: { style: BorderStyle.SINGLE, size: 8, color: C.ACCENT, space: 10 },
      },
      shading:  { type: ShadingType.CLEAR, fill: C.MATHBG },
      indent:   { left: 400, right: 400 },
      children: [new TextRun({ text: readable, font: MATH_FONT, size: FS + 4, bold: true, color: C.H2 })],
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
      width: { size: CONTENT_W, type: WidthType.DXA },
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
      numbering: { reference: "bullets", level: 0 },
      children: parseInlineRuns(String(text)),
      spacing: { line: SP.paragraphLine, after: SP.bulletAfter },
    }));
  }

  function makeBoxedText(text, opts = {}) {
    const border = { style: BorderStyle.SINGLE, size: 14, color: C.H1 };
    const TITLE_FS = Math.round(H2_FS * 1.15);
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      rows: [new TableRow({ children: [new TableCell({
        borders: { top: border, bottom: border, left: border, right: border },
        shading: { type: ShadingType.CLEAR, fill: C.MATHBG },
        margins: { top: 240, bottom: 240, left: 360, right: 360 },
        children: [new Paragraph({
          alignment: opts.alignment ?? AlignmentType.CENTER,
          spacing:   { line: 340, after: 0 },
          children:  [new TextRun({
            text:    text.replace(/\*\*/g, "").replace(/\*/g, ""),
            font:    FONT,
            size:    TITLE_FS,
            bold:    true,
            color:   C.H1,
          })],
        })],
      })] })],
    });
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  function cellBorders(color = C.BORDER) {
    const b = { style: BorderStyle.SINGLE, size: 4, color };
    return { top: b, bottom: b, left: b, right: b };
  }

  function parseTable(lines) {
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("|")) continue;
      if (/^\|[\s:|-]+\|/.test(line)) continue; // separator row
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      rows.push({ cells, isHeader: i === 0 });
    }
    if (!rows.length) return null;

    const colCount = Math.max(...rows.map(r => r.cells.length));
    const maxLens  = Array(colCount).fill(0);
    rows.forEach(row => row.cells.forEach((c, ci) => {
      if (ci < colCount) maxLens[ci] = Math.max(maxLens[ci], c.length);
    }));
    const totalLen = maxLens.reduce((a, b) => a + b, 0) || 1;
    const colWidths = maxLens.map(len => Math.max(Math.round((len / totalLen) * CONTENT_W), 900));
    const scale = CONTENT_W / colWidths.reduce((a, b) => a + b, 0);
    for (let k = 0; k < colWidths.length; k++) colWidths[k] = Math.round(colWidths[k] * scale);
    const colWidth = Math.floor(CONTENT_W / colCount);

    const tableRows = rows.map((row, ri) => {
      const isHdr = ri === 0;
      const fill  = isHdr ? C.HDRFILL : (ri % 2 === 0 ? C.ROWBASE : C.ROWALT);
      const cells = row.cells.map((cell, ci) => {
        const runs = isHdr
          ? [new TextRun({ text: cell.replace(/\*\*/g, ""), bold: true, color: C.HDRTEXT, font: FONT, size: FS - 2 })]
          : parseInlineRuns(cell);
        return new TableCell({
          borders:       cellBorders(isHdr ? C.HDRFILL : C.BORDER),
          width:         { size: colWidths[ci] || colWidth, type: WidthType.DXA },
          shading:       { type: ShadingType.CLEAR, fill },
          margins:       { top: 80, bottom: 80, left: 120, right: 120 },
          verticalAlign: VerticalAlign.CENTER,
          children:      [new Paragraph({ children: runs, spacing: { line: 280, after: 0 } })],
        });
      });
      while (cells.length < colCount) cells.push(new TableCell({
        width:   { size: colWidth, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun("")] })],
      }));
      return new TableRow({ children: cells, tableHeader: isHdr });
    });

    return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: colWidths, rows: tableRows });
  }

  // ── Image ─────────────────────────────────────────────────────────────────

  function makeImage(data, ext, opts = {}) {
    let dims = { width: 480, height: 320 };
    if (data[0] === 0x89 && data[1] === 0x50) {
      dims = { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    } else if (data[0] === 0xFF && data[1] === 0xD8) {
      let pos = 2;
      while (pos < data.length - 8) {
        if (data[pos] !== 0xFF) { pos++; continue; }
        const mk = data[pos + 1];
        if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xCC) {
          dims = { width: data.readUInt16BE(pos + 7), height: data.readUInt16BE(pos + 5) }; break;
        }
        if (pos + 4 >= data.length) break;
        pos += 2 + data.readUInt16BE(pos + 2);
      }
    }
    const maxPx  = opts.width ? parseInt(opts.width) : 520;
    const scale  = maxPx / dims.width;
    const typeMap = { ".png": "png", ".jpg": "jpg", ".jpeg": "jpg", ".gif": "gif", ".bmp": "bmp", ".webp": "png" };
    const imgType = typeMap[(ext || ".png").toLowerCase()] || "png";

    const elems = [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   { before: 160, after: opts.caption ? 60 : 200 },
      children:  [new ImageRun({
        data,
        transformation: { width: Math.round(dims.width * scale), height: Math.round(dims.height * scale) },
        type: imgType,
      })],
    })];
    if (opts.caption || opts.title) elems.push(makeCaption(opts.caption || opts.title, opts));
    return elems;
  }

  // ── Styles & Numbering ────────────────────────────────────────────────────

  function makeStyles() {
    const hs = SP.headings;
    return {
      default: { document: { run: { font: FONT, size: FS, color: C.BODY } } },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H1_FS, bold: true, color: C.H1, allCaps: true },
          paragraph: { spacing: { before: hs.h1.before, after: hs.h1.after }, outlineLevel: 0,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.H1, space: 6 } } },
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H2_FS, bold: true, color: C.H2 },
          paragraph: { spacing: { before: hs.h2.before, after: hs.h2.after }, outlineLevel: 1 },
        },
        {
          id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H3_FS, bold: true, color: C.H3 },
          paragraph: { spacing: { before: hs.h3.before, after: hs.h3.after }, outlineLevel: 2 },
        },
        {
          id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H4_FS, bold: true, italics: true, color: C.H4 },
          paragraph: { spacing: { before: hs.h4.before, after: hs.h4.after }, outlineLevel: 3 },
        },
        {
          id: "Normal", name: "Normal",
          run:       { font: FONT, size: FS, color: C.BODY },
          paragraph: { spacing: { line: SP.paragraphLine, after: SP.paragraphAfter } },
        },
        {
          id: "Caption", name: "Caption", basedOn: "Normal",
          run:       { font: FONT, size: CAP_FS, italics: true, color: C.NOTE },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 80, after: 160 } },
        },
        {
          id: "TOC1", name: "TOC 1", basedOn: "Normal", quickFormat: true,
          run:       { font: FONT, size: FS, bold: true, color: C.H1 },
          paragraph: { spacing: { before: 0, after: 80 }, indent: { left: 0, hanging: 0 } },
        },
        {
          id: "TOC2", name: "TOC 2", basedOn: "Normal", quickFormat: true,
          run:       { font: FONT, size: Math.max(FS - 1, 16), color: C.H2 },
          paragraph: { spacing: { before: 0, after: 60 }, indent: { left: 240, hanging: 0 } },
        },
        {
          id: "TOC3", name: "TOC 3", basedOn: "Normal", quickFormat: true,
          run:       { font: FONT, size: Math.max(FS - 2, 16), color: C.H3 },
          paragraph: { spacing: { before: 0, after: 40 }, indent: { left: 480, hanging: 0 } },
        },
        {
          id: "TOC4", name: "TOC 4", basedOn: "Normal", quickFormat: true,
          run:       { font: FONT, size: Math.max(FS - 2, 16), italics: true, color: C.H4 },
          paragraph: { spacing: { before: 0, after: 40 }, indent: { left: 720, hanging: 0 } },
        },
        {
          id: "CodeBlock", name: "Code Block", basedOn: "Normal",
          run:       { font: CODE_FONT, size: CODE_FS, color: C.CODE },
          paragraph: { spacing: { before: 60, after: 60, line: SP.codeLineSpacing } },
        },
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
            {
              level: 0,
              format: LevelFormat.UPPER_ROMAN,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } },
            },
            {
              level: 1,
              format: LevelFormat.DECIMAL,
              text: "%2.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } },
            },
            {
              level: 2,
              format: LevelFormat.DECIMAL,
              text: "%2.%3.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } },
            },
            {
              level: 3,
              format: LevelFormat.DECIMAL,
              text: "%2.%3.%4.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } },
            },
          ],
        },
        {
          reference: "bullets",
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { font: "Symbol" } } },
            { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1080, hanging: 360 } }, run: { font: "Courier New" } } },
          ],
        },
        {
          reference: "numbers",
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          ],
        },
      ],
    };
  }

  return {
    COLOR: C, CONTENT_W, FONT, CODE_FONT, MATH_FONT, FONT_SIZE: FS,
    parseInlineRuns, makeParagraph, makeHeading, makeCaption,
    makeElementTitle, makeTableOfContents,
    makeBlockquote, makeMathParagraph, makeCodeBlock,
    makeBullet, makeNumbered, makeElementList, makeBoxedText, parseTable, cellBorders, makeImage,
    makeStyles, makeNumbering,
    latexToReadable,
  };
}

module.exports = { createRenderer };
