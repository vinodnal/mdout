/**
 * src/renderer.js
 * Theme-aware factory for docx element constructors.
 *
 * New in this version:
 *   - makeCallout(text, style, opts)     — admonition/callout boxes
 *   - makeAnchor(id)                     — Word bookmarks for cross-references
 *   - parseInlineRuns() extended with:
 *       ~~strikethrough~~, __underline__, ^superscript^, ~subscript~,
 *       ==highlight==, {{variable}}, {color:name}...{/color}
 *   - makeMathParagraph() uses OMML via src/math.js (falls back to Unicode)
 *
 * Usage:
 *   const { createRenderer } = require('mdoc/src/renderer');
 *   const R = createRenderer(config.theme, { contentWidth }, vars, logger);
 */
"use strict";

const {
  Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, LevelFormat,
  TabStopType, TabStopPosition, LeaderType,
  ExternalHyperlink, UnderlineType, ImageRun, TableOfContents,
  Bookmark, BookmarkType,
} = require("docx");

const { latexToInlineRun }    = require("./math");
const { latexToMathParagraph } = require("./math");

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
    // Callout colors
    INFO:     colors.info       || "1565C0",
    INFOBG:   colors.infoBg     || "E3F2FD",
    WARNING:  colors.warning    || "E65100",
    WARNBG:   colors.warningBg  || "FFF3E0",
    TIP:      colors.tip        || "2E7D32",
    TIPBG:    colors.tipBg      || "E8F5E9",
    DANGER:   colors.danger     || "B71C1C",
    DANGERBG: colors.dangerBg   || "FFEBEE",
    NOTEBG:   colors.noteBg     || "F5F5F5",
  };
}

// Callout style definitions
const CALLOUT_STYLES = {
  info:    { icon: "ℹ", colorKey: "INFO",    bgKey: "INFOBG" },
  warning: { icon: "⚠", colorKey: "WARNING", bgKey: "WARNBG" },
  tip:     { icon: "✔", colorKey: "TIP",     bgKey: "TIPBG"  },
  danger:  { icon: "✖", colorKey: "DANGER",  bgKey: "DANGERBG" },
  note:    { icon: "📝", colorKey: "NOTE",   bgKey: "NOTEBG"  },
  box:     { icon: "",   colorKey: "H1",      bgKey: "MATHBG"  },
  quote:   { icon: "❝", colorKey: "H2",      bgKey: "ROWALT"  },
};

// ─── Factory ──────────────────────────────────────────────────────────────────

function createRenderer(theme = {}, pageConfig = {}, vars = {}, logger = null) {
  const colors     = theme.colors    || {};
  const fonts      = theme.fonts     || {};
  const fsMap      = theme.fontSize  || {};
  const spacingCfg = theme.spacing   || {};
  const headingSp  = spacingCfg.headings || {};

  const C         = buildColors(colors);
  const FONT      = fonts.body || "Calibri";
  const CODE_FONT = fonts.code || "Courier New";
  const MATH_FONT = fonts.math || "Cambria Math";

  const FS      = (fsMap.body    || 11) * 2;
  const H1_FS   = (fsMap.h1      || 18) * 2;
  const H2_FS   = (fsMap.h2      || 14) * 2;
  const H3_FS   = (fsMap.h3      || 12) * 2;
  const H4_FS   = (fsMap.h4      || 11) * 2;
  const CAP_FS  = (fsMap.caption ||  9) * 2;
  const CODE_FS = (fsMap.code    ||  9) * 2;

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

  // ── Variable substitution ─────────────────────────────────────────────────

  function applyVars(text) {
    if (!text || typeof text !== "string") return text;
    return text.replace(/\{\{(\w[\w.]*)\}\}/g, (_, name) => {
      if (Object.prototype.hasOwnProperty.call(vars, name)) return String(vars[name]);
      if (logger) logger.warn(`Undefined variable: {{${name}}}`, "W003");
      return `{{${name}}}`;
    });
  }

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
    const raw = String(text || "").trim().replace(/\s+/g, " ");
    const normalizedRaw = raw.replace(/[–—]/g, "-");
    const explicitKind = opts.kind ? String(opts.kind).toLowerCase() : null;
    const label = getCaptionLabel(explicitKind, raw);
    const prefixRe = /^(Figure|Tableau|Table|Annexe)\s*(?:[A-Za-z0-9.]+)?\s*[:-]+\s*/i;
    let title = raw;
    if (!explicitKind) {
      const match = normalizedRaw.match(prefixRe);
      if (match) title = raw.slice(match[0].length).trim();
    }
    return { kind: explicitKind || (label ? label.toLowerCase() : null), label, title };
  }

  function makeCaptionText(text, opts = {}) {
    const spec = parseCaptionSpec(text, opts);
    const label = spec.label || getCaptionLabel(opts.kind, spec.title);
    const number = consumeElementNumber(spec.kind || opts.kind, opts.state);
    if (label && number) return `${label} ${number}${spec.title ? ` - ${spec.title}` : ""}`;
    if (label) return spec.title ? `${label} - ${spec.title}` : label;
    return spec.title || String(text || "");
  }

  function makeElementTitle(kind, title, opts = {}) {
    return new Paragraph({
      style: "Caption",
      alignment: opts.alignment,
      children: parseInlineRuns(makeCaptionText(title, { ...opts, kind })),
    });
  }

  // ── Inline runs ───────────────────────────────────────────────────────────
  // Supported inline patterns (processed left-to-right, longest match first):
  //   **bold**         → bold TextRun
  //   ~~strike~~       → strikethrough TextRun
  //   __underline__    → underlined TextRun
  //   *italic*         → italic TextRun
  //   ^superscript^    → superscript TextRun
  //   ==highlight==    → highlighted TextRun
  //   ~subscript~      → subscript TextRun
  //   `code`           → code-style TextRun
  //   [text](url)      → ExternalHyperlink
  //   $inline math$    → math TextRun (Unicode)
  //   {color:X}t{/color} → colored TextRun (X = theme color name or hex)
  //   {font:Name}t{/font} → custom font family
  //   {size:14}t{/size}   → custom font size in pt
  //   {bg:X}t{/bg}        → highlighted text (X = named or hex color)
  //   {style:k=v;...}t{/style} → combined custom run styling
  //   {b}t{/b} {i}t{/i} {u}t{/u} {s}t{/s} → shorthand styling tags
  //   {{varName}}      → variable substitution (applied before regex)
  //   <br> / <br />    → line break

  const INLINE_RE = new RegExp([
    /\*\*(.+?)\*\*/.source,             // 1: bold
    /~~(.+?)~~/.source,                 // 2: strikethrough
    /__(.+?)__/.source,                 // 3: underline
    /\*(.+?)\*/.source,                 // 4: italic
    /\^(.+?)\^/.source,                 // 5: superscript
    /==(.+?)==/.source,                 // 6: highlight
    /~([^~]+?)~/.source,               // 7: subscript
    /`(.+?)`/.source,                   // 8: code
    /\[([^\]]+)\]\(([^)]+)\)/.source,  // 9+10: link text + url
    /\$(.+?)\$/.source,                 // 11: inline math
    /\{color:([\w#]+)\}(.+?)\{\/color\}/.source, // 12+13: custom color
    /\{style:([^}]+)\}(.+?)\{\/style\}/.source,   // 14+15: style spec + text
    /\{font:([^}]+)\}(.+?)\{\/font\}/.source,     // 16+17: font family + text
    /\{size:(\d+(?:\.\d+)?)\}(.+?)\{\/size\}/.source, // 18+19: size (pt) + text
    /\{bg:([\w#]+)\}(.+?)\{\/bg\}/.source,       // 20+21: highlight color + text
    /\{b\}(.+?)\{\/b\}/.source,                   // 22: bold shorthand
    /\{i\}(.+?)\{\/i\}/.source,                   // 23: italic shorthand
    /\{u\}(.+?)\{\/u\}/.source,                   // 24: underline shorthand
    /\{s\}(.+?)\{\/s\}/.source,                   // 25: strike shorthand
  ].join("|"), "gs");

  const BR_RE = /<br\s*\/?\s*>/gi;

  function resolveColor(name) {
    // Name can be: hex "RRGGBB", theme key like "accent", "primary", etc.
    if (/^[0-9A-Fa-f]{6}$/.test(name)) return name;
    const map = {
      primary: C.H1, secondary: C.H2, accent: C.H3, body: C.BODY,
      note: C.NOTE, code: C.CODE, info: C.INFO, warning: C.WARNING,
      tip: C.TIP, danger: C.DANGER,
    };
    return map[name.toLowerCase()] || C.BODY;
  }

  function toBool(value) {
    if (value == null) return false;
    const v = String(value).trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  }

  function resolveHighlight(name) {
    const color = resolveColor(String(name || ""));
    const map = {
      "FFFF00": "yellow",
      "00FF00": "green",
      "00FFFF": "cyan",
      "FF00FF": "magenta",
      "0000FF": "blue",
      "FF0000": "red",
      "AAAAAA": "gray",
      "C0C0C0": "lightGray",
      "000000": "black",
      "FFFFFF": "white",
      "00008B": "darkBlue",
      "008B8B": "darkCyan",
      "006400": "darkGreen",
      "800080": "darkMagenta",
      "8B0000": "darkRed",
      "808000": "darkYellow",
    };
    return map[color.toUpperCase()] || "yellow";
  }

  function parseStyleSpec(spec) {
    const style = {};
    const parts = String(spec || "").split(/[;|,]/).map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/^([\w-]+)\s*[:=]\s*(.+)$/);
      if (match) {
        const key = match[1].toLowerCase();
        const value = match[2].trim();
        if (key === "color") style.color = resolveColor(value.replace(/^#/, ""));
        else if (key === "font") style.font = value;
        else if (key === "size") {
          const pt = Number(value);
          if (Number.isFinite(pt) && pt > 0) style.size = Math.round(pt * 2);
        }
        else if (key === "bg" || key === "highlight") style.highlight = resolveHighlight(value.replace(/^#/, ""));
        else if (key === "bold" || key === "b") style.bold = toBool(value);
        else if (key === "italic" || key === "italics" || key === "i") style.italics = toBool(value);
        else if (key === "underline" || key === "u") style.underline = toBool(value) ? { type: UnderlineType.SINGLE } : undefined;
        else if (key === "strike" || key === "strikethrough" || key === "s") style.strike = toBool(value);
        else if (key === "sub" || key === "subscript") style.subScript = toBool(value);
        else if (key === "sup" || key === "super" || key === "superscript") style.superScript = toBool(value);
      } else {
        const flag = part.toLowerCase();
        if (flag === "bold" || flag === "b") style.bold = true;
        else if (flag === "italic" || flag === "italics" || flag === "i") style.italics = true;
        else if (flag === "underline" || flag === "u") style.underline = { type: UnderlineType.SINGLE };
        else if (flag === "strike" || flag === "strikethrough" || flag === "s") style.strike = true;
      }
    }
    return style;
  }

  function makeRun(text, overrides = {}) {
    return new TextRun({
      text,
      font: FONT,
      size: FS,
      color: C.BODY,
      ...overrides,
    });
  }

  function pushStyledRuns(segment, runs) {
    if (!segment) return;
    const expanded = applyVars(segment);
    let last = 0;
    let m;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(expanded)) !== null) {
      if (m.index > last) {
        runs.push(makeRun(expanded.slice(last, m.index)));
      }
      if      (m[1]  !== undefined) runs.push(makeRun(m[1], { bold: true }));
      else if (m[2]  !== undefined) runs.push(makeRun(m[2], { strike: true }));
      else if (m[3]  !== undefined) runs.push(makeRun(m[3], { underline: { type: UnderlineType.SINGLE } }));
      else if (m[4]  !== undefined) runs.push(makeRun(m[4], { italics: true }));
      else if (m[5]  !== undefined) runs.push(makeRun(m[5], { superScript: true }));
      else if (m[6]  !== undefined) runs.push(makeRun(m[6], { highlight: "yellow" }));
      else if (m[7]  !== undefined) runs.push(makeRun(m[7], { subScript: true }));
      else if (m[8]  !== undefined) runs.push(new TextRun({ text: m[8],  font: CODE_FONT, size: CODE_FS, color: C.CODE, shading: { type: ShadingType.CLEAR, fill: C.CODEBG } }));
      else if (m[9]  !== undefined) runs.push(new ExternalHyperlink({ link: m[10], children: [new TextRun({ text: m[9], color: C.ACCENT, underline: { type: UnderlineType.SINGLE, color: C.ACCENT }, font: FONT, size: FS })] }));
      else if (m[11] !== undefined) runs.push(latexToInlineRun(m[11], { font: MATH_FONT, fontSize: fsMap.body || 11, color: C.H2 }));
      else if (m[12] !== undefined) runs.push(makeRun(m[13], { color: resolveColor(m[12].replace(/^#/, "")) }));
      else if (m[14] !== undefined) runs.push(makeRun(m[15], parseStyleSpec(m[14])));
      else if (m[16] !== undefined) runs.push(makeRun(m[17], { font: String(m[16]).trim() }));
      else if (m[18] !== undefined) runs.push(makeRun(m[19], { size: Math.round(Number(m[18]) * 2) || FS }));
      else if (m[20] !== undefined) runs.push(makeRun(m[21], { highlight: resolveHighlight(m[20].replace(/^#/, "")) }));
      else if (m[22] !== undefined) runs.push(makeRun(m[22], { bold: true }));
      else if (m[23] !== undefined) runs.push(makeRun(m[23], { italics: true }));
      else if (m[24] !== undefined) runs.push(makeRun(m[24], { underline: { type: UnderlineType.SINGLE } }));
      else if (m[25] !== undefined) runs.push(makeRun(m[25], { strike: true }));
      last = INLINE_RE.lastIndex;
    }
    if (last < expanded.length) {
      runs.push(makeRun(expanded.slice(last)));
    }
    INLINE_RE.lastIndex = 0;
  }

  function parseInlineRuns(text) {
    const source = String(text ?? "");
    const runs = [];
    let segmentStart = 0;
    let brMatch;
    BR_RE.lastIndex = 0;
    while ((brMatch = BR_RE.exec(source)) !== null) {
      pushStyledRuns(source.slice(segmentStart, brMatch.index), runs);
      runs.push(new TextRun({ break: 1 }));
      segmentStart = brMatch.index + brMatch[0].length;
    }
    pushStyledRuns(source.slice(segmentStart), runs);
    return runs.length ? runs : [new TextRun({ text: source, font: FONT, size: FS, color: C.BODY })];
  }

  // ── Block elements ────────────────────────────────────────────────────────

  function makeParagraph(text, opts = {}) {
    const t = applyVars(text);
    return new Paragraph({
      children:  parseInlineRuns(t),
      spacing:   { line: SP.paragraphLine, after: SP.paragraphAfter },
      alignment: opts.alignment,
      indent:    opts.indent,
    });
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
    const para = {
      alignment: opts.alignment ?? (opts.nonumber ? AlignmentType.CENTER : undefined),
      children:  [new TextRun(clean)],
    };
    if (!opts.nonumber) {
      para.heading = lvlMap[clampedLevel] || HeadingLevel.HEADING_1;
      para.numbering = { reference: "headings", level: Math.max(0, Math.min(3, (level || 1) - 1)) };
    } else {
      // Keep heading visuals while removing it from the document outline/TOC.
      para.style = `Heading${clampedLevel}NoToc`;
    }
    if (opts.pageBreakBefore) para.pageBreakBefore = true;
    return new Paragraph(para);
  }

  function makeCaption(text, opts = {}) {
    const clean = String(text || "").replace(/^\*/, "").replace(/\*$/, "").trim();
    return new Paragraph({
      style:     "Caption",
      alignment: opts.alignment,
      children:  parseInlineRuns(makeCaptionText(clean, opts)),
    });
  }

  function makeBlockquote(text, opts = {}) {
    const clean = text.replace(/^>\s*/, "").trim();
    return new Paragraph({ style: "Blockquote", alignment: opts.alignment, children: parseInlineRuns(clean) });
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
      style:    "Caption",
      alignment: AlignmentType.LEFT,
      children: parseInlineRuns(String(text)),
      spacing:  { line: SP.paragraphLine, after: 60 },
    }));
  }

  /**
   * Admonition / callout block.
   *
   * @param {string|string[]} content   Paragraph text or array of lines.
   * @param {string} style              "info" | "warning" | "tip" | "danger" | "note" | "box" | "quote"
   * @param {object} opts
   */
  function makeCallout(content, style = "info", opts = {}) {
    const def = CALLOUT_STYLES[style] || CALLOUT_STYLES.info;
    const borderColor = C[def.colorKey] || C.H1;
    const bgColor     = C[def.bgKey]    || C.MATHBG;
    const icon        = def.icon;

    const lines = Array.isArray(content) ? content : [content];
    const contentParagraphs = lines.map(line => new Paragraph({
      spacing:  { line: SP.paragraphLine, after: 80 },
      children: parseInlineRuns(applyVars(line)),
    }));

    const border = { style: BorderStyle.SINGLE, size: 6, color: borderColor };
    const thickLeft = { style: BorderStyle.SINGLE, size: 16, color: borderColor };
    // Keep a small safety gutter so callout borders never touch/crop at page edge.
    const CALLOUT_W = Math.max(1200, CONTENT_W - 120);

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

    // Callout style — icon cell + content cell
    const iconWidth = 500;
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

  /**
   * Deprecated box-style callout (backward compat — use makeCallout instead).
   */
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
          id: safeId,
          type: BookmarkType.START,
          children: [new TextRun("")],
        })],
      });
    } catch {
      // If Bookmark API not available in this docx version
      return new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun("")] });
    }
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  function cellBorders(color = C.BORDER) {
    const b = { style: BorderStyle.SINGLE, size: 4, color };
    return { top: b, bottom: b, left: b, right: b };
  }

  // Split a markdown table row while preserving pipe characters inside
  // inline math ($...$, $$...$$), inline code (`...`), and escaped pipes (\|).
  function splitTableRow(line) {
    const raw = String(line || "").trim();
    if (!raw.startsWith("|")) return [];

    const cells = [];
    let current = "";
    let escaped = false;
    let inCode = false;
    let inMath = false;
    let mathFence = "";

    // Skip first leading pipe and consume until end.
    for (let i = 1; i < raw.length; i++) {
      const ch = raw[i];
      const next = i + 1 < raw.length ? raw[i + 1] : "";

      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (!inMath && ch === "`") {
        inCode = !inCode;
        current += ch;
        continue;
      }

      if (!inCode && ch === "$") {
        const isDouble = next === "$";
        if (!inMath) {
          inMath = true;
          mathFence = isDouble ? "$$" : "$";
          current += mathFence;
          if (isDouble) i++;
          continue;
        }
        if (isDouble && mathFence === "$$") {
          inMath = false;
          current += "$$";
          i++;
          continue;
        }
        if (!isDouble && mathFence === "$") {
          inMath = false;
          current += "$";
          continue;
        }
      }

      if (ch === "|" && !inCode && !inMath) {
        cells.push(current.trim());
        current = "";
        continue;
      }

      current += ch;
    }

    // Do not push trailing empty cell when the row ends with '|'.
    if (current.length || !raw.endsWith("|")) cells.push(current.trim());
    return cells;
  }

  function parseTable(lines) {
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("|")) continue;
      if (/^\|[\s:|-]+\|/.test(line)) continue;
      const cells = splitTableRow(line);
      rows.push({ cells, isHeader: i === 0 });
    }
    if (!rows.length) return null;

    const colCount  = Math.max(...rows.map(r => r.cells.length));
    const maxLens   = Array(colCount).fill(0);
    rows.forEach(row => row.cells.forEach((c, ci) => {
      if (ci < colCount) maxLens[ci] = Math.max(maxLens[ci], c.length);
    }));
    const totalLen  = maxLens.reduce((a, b) => a + b, 0) || 1;
    const colWidths = maxLens.map(len => Math.max(Math.round((len / totalLen) * CONTENT_W), 900));
    const scale     = CONTENT_W / colWidths.reduce((a, b) => a + b, 0);
    for (let k = 0; k < colWidths.length; k++) colWidths[k] = Math.round(colWidths[k] * scale);
    const colWidth  = Math.floor(CONTENT_W / colCount);

    const tableRows = rows.map((row, ri) => {
      const isHdr = ri === 0;
      const fill  = isHdr ? C.HDRFILL : (ri % 2 === 0 ? C.ROWBASE : C.ROWALT);
      const cells = row.cells.map((cell, ci) => {
        const runs = isHdr
          ? [new TextRun({ text: cell.replace(/\*\*/g, ""), bold: true, color: C.HDRTEXT, font: FONT, size: FS - 2 })]
          : parseInlineRuns(applyVars(cell));
        return new TableCell({
          borders:       cellBorders(isHdr ? C.HDRFILL : C.BORDER),
          width:         { size: colWidths[ci] || colWidth, type: WidthType.DXA },
          shading:       { type: ShadingType.CLEAR, fill },
          margins:       { top: 80, bottom: 80, left: 120, right: 120 },
          verticalAlign: VerticalAlign.CENTER,
          children:      [new Paragraph({ children: runs, spacing: { line: 280, after: 0 } })],
        });
      });
      // Pad missing cells
      while (cells.length < colCount) {
        cells.push(new TableCell({
          width:   { size: colWidth, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun("")] })],
        }));
      }
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
    const maxPx   = opts.width ? Math.max(1, parseInt(opts.width) || 1) : Math.round(CONTENT_W / 15);
    const safeW   = dims.width  || 480;
    const safeH   = dims.height || 320;
    const scale   = maxPx / safeW;
    const typeMap = { ".png": "png", ".jpg": "jpg", ".jpeg": "jpg", ".gif": "gif", ".bmp": "bmp", ".webp": "png" };
    const imgType = typeMap[(ext || ".png").toLowerCase()] || "png";

    // Warn on very large images
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

  // ── Table of Contents ─────────────────────────────────────────────────────

  function makeTableOfContents(opts = {}) {
    const maxDepth = opts.depth ? Math.max(1, Math.min(9, opts.depth)) : 4;
    return new TableOfContents(opts.alias || "Table of Contents", {
      headingStyleRange:                   opts.headingStyleRange || `1-${maxDepth}`,
      hyperlink:                           opts.hyperlink ?? true,
      useAppliedParagraphOutlineLevel:     opts.useAppliedParagraphOutlineLevel ?? true,
      beginDirty:                          opts.beginDirty ?? true,
      preserveTabInEntries:                false,
      cachedEntries: Array.isArray(opts.cachedEntries) ? opts.cachedEntries : undefined,
    });
  }

  // ── Styles & Numbering ────────────────────────────────────────────────────

  function makeStyles() {
    const hs = SP.headings;
    return {
      default:         { document: { run: { font: FONT, size: FS, color: C.BODY } } },
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
          id: "Heading1NoToc", name: "Heading 1 No TOC", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H1_FS, bold: true, color: C.H1, allCaps: true },
          paragraph: { spacing: { before: hs.h1.before, after: hs.h1.after },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.H1, space: 6 } } },
        },
        {
          id: "Heading2NoToc", name: "Heading 2 No TOC", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H2_FS, bold: true, color: C.H2 },
          paragraph: { spacing: { before: hs.h2.before, after: hs.h2.after } },
        },
        {
          id: "Heading3NoToc", name: "Heading 3 No TOC", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H3_FS, bold: true, color: C.H3 },
          paragraph: { spacing: { before: hs.h3.before, after: hs.h3.after } },
        },
        {
          id: "Heading4NoToc", name: "Heading 4 No TOC", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: FONT, size: H4_FS, bold: true, italics: true, color: C.H4 },
          paragraph: { spacing: { before: hs.h4.before, after: hs.h4.after } },
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
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 80 },
            indent: { left: 0, hanging: 0 },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
          },
        },
        {
          id: "TOC2", name: "TOC 2", basedOn: "Normal", quickFormat: true,
          run:       { font: FONT, size: Math.max(FS - 1, 16), color: C.H2 },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 60 },
            indent: { left: 240, hanging: 0 },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
          },
        },
        {
          id: "TOC3", name: "TOC 3", basedOn: "Normal", quickFormat: true,
          run:       { font: FONT, size: Math.max(FS - 2, 16), color: C.H3 },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 40 },
            indent: { left: 480, hanging: 0 },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
          },
        },
        {
          id: "TOC4", name: "TOC 4", basedOn: "Normal", quickFormat: true,
          run:       { font: FONT, size: Math.max(FS - 2, 16), italics: true, color: C.H4 },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 40 },
            indent: { left: 720, hanging: 0 },
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.DOT }],
          },
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
            { level: 0, format: LevelFormat.UPPER_ROMAN, text: "%1.", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
            { level: 1, format: LevelFormat.DECIMAL, text: "%2.", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
            { level: 2, format: LevelFormat.DECIMAL, text: "%2.%3.", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
            { level: 3, format: LevelFormat.DECIMAL, text: "%2.%3.%4.", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 0, hanging: 0 } } } },
          ],
        },
        {
          reference: "bullets",
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
            { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
            { level: 2, format: LevelFormat.BULLET, text: "\u25AA", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
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

  // ── Public interface ──────────────────────────────────────────────────────

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
    parseTable,
    parseInlineRuns,
    makeStyles,
    makeNumbering,
    applyVars,
    // Expose for builder
    FONT,
    COLOR: C,
  };
}

module.exports = { createRenderer };
