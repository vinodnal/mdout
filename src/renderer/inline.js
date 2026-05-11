/**
 * src/renderer/inline.js
 * Inline run parsing — converts Markdown inline syntax into docx TextRun / ExternalHyperlink objects.
 *
 * Supported patterns (left-to-right, longest match first):
 *   **bold**              → bold TextRun
 *   ~~strike~~            → strikethrough TextRun
 *   __underline__         → underlined TextRun
 *   *italic*              → italic TextRun
 *   ^superscript^         → superscript TextRun
 *   ==highlight==         → highlighted TextRun
 *   ~subscript~           → subscript TextRun
 *   `code`                → code-style TextRun
 *   [text](url)           → ExternalHyperlink
 *   $formula$             → inline math TextRun (Unicode)
 *   {color:X}t{/color}    → colored TextRun
 *   {style:k=v;…}t{/style}→ combined styling
 *   {font:Name}t{/font}   → custom font
 *   {size:N}t{/size}      → custom font size
 *   {bg:X}t{/bg}          → highlight color
 *   {b}t{/b} {i}t{/i} {u}t{/u} {s}t{/s} → shorthand bold/italic/underline/strike
 *   {{varName}}           → variable substitution (applied via applyVars before regex)
 *   <br> / <br />         → line break
 */
"use strict";

const { TextRun, ExternalHyperlink, ShadingType, UnderlineType } = require("docx");
const { latexToInlineRun } = require("../math");

// ─── Compiled inline regex ────────────────────────────────────────────────────

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

// ─── RTL Detection ────────────────────────────────────────────────────────────

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

function hasArabic(text) {
  return ARABIC_RE.test(String(text || ""));
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create the inline rendering context.
 *
 * @param {object} ctx
 * @param {object}   ctx.C          Color map from buildColors()
 * @param {string}   ctx.FONT       Body font name
 * @param {string}   ctx.CODE_FONT  Monospace font name
 * @param {string}   ctx.MATH_FONT  Math font name
 * @param {number}   ctx.FS         Body font size in half-points
 * @param {number}   ctx.CODE_FS    Code font size in half-points
 * @param {object}   ctx.fsMap      Raw fontSize config (in points)
 * @param {Function} ctx.applyVars  Variable substitution function
 * @returns {{ parseInlineRuns, pushStyledRuns, makeRun, resolveColor }}
 */
function createInlineRenderer({ C, FONT, CODE_FONT, MATH_FONT, FS, CODE_FS, fsMap, applyVars }) {

  function resolveColor(name) {
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
      "FFFF00": "yellow", "00FF00": "green",      "00FFFF": "cyan",
      "FF00FF": "magenta","0000FF": "blue",        "FF0000": "red",
      "AAAAAA": "gray",   "C0C0C0": "lightGray",  "000000": "black",
      "FFFFFF": "white",  "00008B": "darkBlue",   "008B8B": "darkCyan",
      "006400": "darkGreen","800080":"darkMagenta","8B0000": "darkRed",
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
        const key   = match[1].toLowerCase();
        const value = match[2].trim();
        if (key === "color")                                   style.color    = resolveColor(value.replace(/^#/, ""));
        else if (key === "font")                               style.font     = value;
        else if (key === "size") {
          const pt = Number(value);
          if (Number.isFinite(pt) && pt > 0) style.size = Math.round(pt * 2);
        }
        else if (key === "bg" || key === "highlight")          style.highlight = resolveHighlight(value.replace(/^#/, ""));
        else if (key === "bold"      || key === "b")           style.bold      = toBool(value);
        else if (key === "italic"    || key === "italics" || key === "i") style.italics = toBool(value);
        else if (key === "underline" || key === "u")           style.underline = toBool(value) ? { type: UnderlineType.SINGLE } : undefined;
        else if (key === "strike"    || key === "strikethrough"|| key === "s") style.strike = toBool(value);
        else if (key === "sub"       || key === "subscript")   style.subScript   = toBool(value);
        else if (key === "sup"       || key === "super" || key === "superscript") style.superScript = toBool(value);
      } else {
        const flag = part.toLowerCase();
        if      (flag === "bold"      || flag === "b") style.bold      = true;
        else if (flag === "italic"    || flag === "italics" || flag === "i") style.italics  = true;
        else if (flag === "underline" || flag === "u") style.underline = { type: UnderlineType.SINGLE };
        else if (flag === "strike"    || flag === "strikethrough" || flag === "s") style.strike = true;
      }
    }
    return style;
  }

  function makeRun(text, overrides = {}) {
    const isArabic = hasArabic(text);
    const baseRun = { text, font: FONT, size: FS, color: C.BODY, ...overrides };
    if (isArabic) baseRun.rtl = true;
    return new TextRun(baseRun);
  }

  function pushStyledRuns(segment, runs) {
    if (!segment) return;
    const expanded = applyVars(segment);
    let last = 0;
    let m;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(expanded)) !== null) {
      if (m.index > last) runs.push(makeRun(expanded.slice(last, m.index)));

      if      (m[1]  !== undefined) runs.push(makeRun(m[1], { bold: true }));
      else if (m[2]  !== undefined) runs.push(makeRun(m[2], { strike: true }));
      else if (m[3]  !== undefined) runs.push(makeRun(m[3], { underline: { type: UnderlineType.SINGLE } }));
      else if (m[4]  !== undefined) runs.push(makeRun(m[4], { italics: true }));
      else if (m[5]  !== undefined) runs.push(makeRun(m[5], { superScript: true }));
      else if (m[6]  !== undefined) runs.push(makeRun(m[6], { highlight: "yellow" }));
      else if (m[7]  !== undefined) runs.push(makeRun(m[7], { subScript: true }));
      else if (m[8]  !== undefined) runs.push(new TextRun({
        text: m[8], font: CODE_FONT, size: CODE_FS, color: C.CODE,
        shading: { type: ShadingType.CLEAR, fill: C.CODEBG },
      }));
      else if (m[9]  !== undefined) runs.push(new ExternalHyperlink({
        link: m[10],
        children: [new TextRun({
          text: m[9], color: C.ACCENT, font: FONT, size: FS,
          underline: { type: UnderlineType.SINGLE, color: C.ACCENT },
        })],
      }));
      else if (m[11] !== undefined) runs.push(latexToInlineRun(m[11], {
        font: MATH_FONT, fontSize: fsMap.body || 11, color: C.H2,
      }));
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
    if (last < expanded.length) runs.push(makeRun(expanded.slice(last)));
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
    return runs.length
      ? runs
      : [new TextRun({ text: source, font: FONT, size: FS, color: C.BODY, ...(hasArabic(source) ? { rtl: true } : {}) })];
  }

  return { parseInlineRuns, pushStyledRuns, makeRun, resolveColor };
}

module.exports = { createInlineRenderer };
