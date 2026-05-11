// core/md-parser.js — backward-compat shim. Delegates to src/parser.js.
module.exports = require("../src/parser");
// ─── Original implementation below (not executed) ────────────────────────────
/** @deprecated Use require('mdoc/src/parser') directly.
 * core/md-parser.js
 * Converts Markdown text to an array of docx elements.
 *
 * Usage:
 *   const { parseMD } = require('./core/md-parser');
 *   const elements = parseMD(markdownText, absoluteDir, R, importFn);
 *   // R = createRenderer(theme, pageConfig)
 *   // importFn = createImporter(R, parseFn)
 */

"use strict";

const path = require("path");
const fs = require("fs");
const { Paragraph, PageBreak, AlignmentType } = require("docx");

const ALIGN_MAP = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
};

/**
 * Parse a Markdown string into docx elements.
 * @param {string}   text      — raw markdown content
 * @param {string}   dir       — absolute directory of the source file (for resolving imports/images)
 * @param {object}   R         — renderer object from createRenderer()
 * @param {Function} importFn  — handleImport(directive, dir) → elements[]
 * @returns {Array}  flat array of docx elements
 */
function parseMD(text, dir, R, importFn, opts = {}) {
  const alignStack = [];
  const currentAlignment = () => alignStack.length ? alignStack[alignStack.length - 1] : opts.defaultAlignment;
  const state = opts.numberingState || {};
  if (typeof state.chapterIndex !== "number") state.chapterIndex = 0;
  if (typeof state.figureIndex !== "number") state.figureIndex = 0;
  if (typeof state.tableIndex !== "number") state.tableIndex = 0;
  if (typeof state.annexIndex !== "number") state.annexIndex = 0;

  const lines = text.split(/\r?\n/);
  const elements = [];
  let pendingElement = null;
  let i = 0;

  function push(...items) { items.flat().forEach(el => { if (el) elements.push(el); }); }

  function clearPending() {
    pendingElement = null;
  }

  function consumeCaption(kind, title, alignment) {
    if (!R.makeCaption) return null;
    return R.makeCaption(title, {
      kind,
      state,
      alignment,
    });
  }

  function addAnnexTitle(title, alignment) {
    push(R.makeElementTitle ? R.makeElementTitle("annex", title, { alignment, state }) : R.makeCaption(title, { kind: "annex", alignment, state }));
  }

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (pendingElement && trimmed && !trimmed.startsWith("<!--")) {
      if (pendingElement.kind === "annex") {
        addAnnexTitle(pendingElement.title, currentAlignment());
        clearPending();
      }
    }

    // ── @import directive ──────────────────────────────────────────────────────
    const importMatch = trimmed.match(/^<!--\s*@import:\s*(.+?)\s*-->$/);
    if (importMatch) {
      if (importFn) push(importFn(importMatch[1], dir, { pendingElement, state }));
      if (pendingElement && pendingElement.kind !== "annex") clearPending();
      i++; continue;
    }

    const tocMatch = trimmed.match(/^<!--\s*@toc\s*-->$/i);
    if (tocMatch) {
      if (R.makeTableOfContents) push(R.makeTableOfContents({ cachedEntries: opts.tocEntries || [] }));
      i++; continue;
    }

    const listMatch = trimmed.match(/^<!--\s*@list:\s*(tables|figures|annexes|annex)\s*-->$/i);
    if (listMatch) {
      const bucket = listMatch[1].toLowerCase();
      const kind = bucket === "tables" ? "table" : (bucket === "figures" ? "figure" : "annex");
      const source = Array.isArray(opts.elementEntries) ? opts.elementEntries : [];
      const listItems = source.filter(item => item && item.kind === kind).map(item => item.text).filter(Boolean);
      if (R.makeElementList) push(R.makeElementList(kind, listItems));
      i++; continue;
    }

    const elementMatch = trimmed.match(/^<!--\s*@element:\s*(figure|table|annex)\s*\|\s*title:\s*(.+?)\s*-->$/i);
    if (elementMatch) {
      const kind = elementMatch[1].toLowerCase();
      const title = elementMatch[2].trim();
      if (kind === "annex") {
        addAnnexTitle(title, currentAlignment());
        clearPending();
      } else {
        pendingElement = { kind, title };
      }
      i++; continue;
    }

    // ── Block alignment wrappers (standard inline HTML) ──────────────────────
    const openDivAlign = trimmed.match(/^<div\s+align=["'](left|center|right)["']\s*>$/i);
    if (openDivAlign) {
      alignStack.push(ALIGN_MAP[openDivAlign[1].toLowerCase()] || undefined);
      i++; continue;
    }
    if (/^<\/div>$/i.test(trimmed)) {
      if (alignStack.length) alignStack.pop();
      i++; continue;
    }

    // ── Inline image ![alt](path) ──────────────────────────────────────────────
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const alt = imgMatch[1], relImg = imgMatch[2];
      const absImg = path.resolve(dir, relImg);
      if (fs.existsSync(absImg)) {
        const data = fs.readFileSync(absImg);
        const captionMeta = pendingElement ? { kind: pendingElement.kind, state, title: pendingElement.title } : { caption: alt, state };
        push(R.makeImage(data, path.extname(absImg).toLowerCase(), captionMeta));
        if (pendingElement) clearPending();
      }
      i++; continue;
    }

    // ── Page break (--- / *** / ___ on standalone lines) ─────────────────────
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      push(new Paragraph({ children: [new PageBreak()] }));
      i++; continue;
    }

    // ── Blockquote ─────────────────────────────────────────────────────────────
    if (trimmed.startsWith("> ") || trimmed === ">") {
      const alignment = currentAlignment();
      push(R.makeBlockquote(trimmed, alignment ? { alignment } : {}));
      i++; continue;
    }

    // ── ATX Headings: # to #### ────────────────────────────────────────────────
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      const alignment = currentAlignment();
      let headingText = hMatch[2];
      const nonumber  = /\{\s*\.no-num\s*\}/.test(headingText);
      if (nonumber) headingText = headingText.replace(/\s*\{\s*\.no-num\s*\}/, "").trim();
      const headingOpts = { ...(alignment ? { alignment } : {}), ...(nonumber ? { nonumber: true } : {}) };
      if (!nonumber && hMatch[1].length === 1) {
        state.chapterIndex += 1;
      }
      push(R.makeHeading(headingText, hMatch[1].length, headingOpts));
      i++; continue;
    }

    // ── Fenced code blocks (```...```) ────────────────────────────────────────
    if (trimmed.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      push(R.makeCodeBlock(codeLines));
      continue;
    }

    // ── Math blocks ($$...$$) — single-line ───────────────────────────────────
    if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
      push(R.makeMathParagraph(trimmed.slice(2, -2).trim()));
      i++; continue;
    }

    // ── Math blocks — multi-line $$\n...\n$$ ──────────────────────────────────
    if (trimmed === "$$") {
      const formulaLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "$$") {
        formulaLines.push(lines[i].trim());
        i++;
      }
      i++;
      push(R.makeMathParagraph(formulaLines.join(" ")));
      continue;
    }

    // ── Pipe tables ────────────────────────────────────────────────────────────
    if (trimmed.startsWith("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const tbl = R.parseTable(tableLines);
      if (tbl) {
        push(tbl);
        if (pendingElement) {
          if (pendingElement.kind === "table") {
            push(consumeCaption("table", pendingElement.title, currentAlignment()));
            clearPending();
          } else if (pendingElement.kind === "figure") {
            push(consumeCaption("figure", pendingElement.title, currentAlignment()));
            clearPending();
          }
        }
      }
      continue;
    }

    // ── Figure/table captions (*Figure... or *Tableau...) ────────────────────
    if (trimmed.startsWith("*Figure") || trimmed.startsWith("*Tableau") || trimmed.startsWith("*Graphique")) {
      const alignment = currentAlignment();
      push(R.makeCaption(trimmed, alignment ? { alignment } : {}));
      i++; continue;
    }

    // ── Bullet lists (- or *) ─────────────────────────────────────────────────
    if (/^[-*]\s+/.test(trimmed)) {
      let level = 0;
      const leadingSpaces = raw.match(/^(\s*)/)[1].length;
      if (leadingSpaces >= 4) level = 1;
      push(R.makeBullet(trimmed, level));
      i++; continue;
    }

    // ── Numbered list (1. ...) ────────────────────────────────────────────────
    if (/^\d+\.\s+/.test(trimmed)) {
      push(R.makeNumbered(trimmed));
      i++; continue;
    }

    // ── Blank line → skip ─────────────────────────────────────────────────────
    if (!trimmed) {
      if (pendingElement && pendingElement.kind !== "annex") {
        clearPending();
      }
      i++; continue;
    }

    // ── Default: normal paragraph ─────────────────────────────────────────────
    const alignment = currentAlignment();
    const isBoxed = /\s*\{\.box\}\s*$/.test(trimmed);
    if (isBoxed) {
      const boxText = trimmed.replace(/\s*\{\.box\}\s*$/, "").trim();
      push(R.makeBoxedText(boxText, alignment ? { alignment } : {}));
    } else {
      push(R.makeParagraph(trimmed, alignment ? { alignment } : {}));
    }
    i++;
  }

  return elements;
}

module.exports = { parseMD };
