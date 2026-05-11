/**
 * src/parser/index.js
 * Converts Markdown text to docx elements, with a rich directive system.
 *
 * ── Block directives (HTML comment syntax) ────────────────────────────────────
 *   <!-- @import: path | opt: val -->          Import MD/image/script/docx
 *   <!-- @toc -->                               Table of contents
 *   <!-- @toc: title: Contents | depth: 3 -->  ToC with options
 *   <!-- @list: figures|tables|annexes -->      List of figures/tables/annexes
 *   <!-- @element: type: figure | title: … --> Caption/numbering for next block
 *   <!-- @page-break -->                        Hard page break
 *   <!-- @section: orientation: landscape -->   New document section
 *   <!-- @style: info|warning|tip|danger|… -->  Callout style for next block
 *   <!-- @var: name = value -->                 Define a template variable
 *   <!-- @anchor: id: section-id -->            Word bookmark
 *   <!-- @columns: count: 2 | gap: 10 -->       [reserved — future]
 *
 * ── Heading / paragraph modifiers ({.modifier} at end of line) ───────────────
 *   {.no-num}          Skip automatic heading numbering
 *   {.center}          Center align
 *   {.right}           Right align
 *   {.page-break}      Page break before this element
 *
 * ── Inline syntax ─────────────────────────────────────────────────────────────
 *   **bold**           Bold
 *   ~~strikethrough~~  Strikethrough
 *   __underline__      Underline
 *   *italic*           Italic
 *   ^superscript^      Superscript
 *   ==highlight==      Yellow highlight
 *   ~subscript~        Subscript
 *   `code`             Inline code
 *   [text](url)        Hyperlink
 *   $formula$          Inline math (Unicode)
 *   {{varName}}        Variable interpolation
 *   {color:X}t{/color} Colored text (X = theme key or hex)
 *   <br> / <br />      Line break
 *
 * ── Deprecated (still work with W002 warning) ─────────────────────────────────
 *   <div align="...">...</div>    Use {.center} / {.right} instead
 *   {.box}                        Use <!-- @style: box --> before the paragraph instead
 *   --- / *** / ___               Use <!-- @page-break --> instead
 */
"use strict";

const path = require("path");
const fs   = require("fs");
const { Paragraph, PageBreak } = require("docx");
const { retrySync }            = require("../utils");

const { ALIGN_MAP, parseDirectiveOpts, extractModifiers } = require("./utils");

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse Markdown text into docx elements.
 *
 * @param {string}   text         Raw markdown content.
 * @param {string}   dir          Absolute directory of the source file.
 * @param {object}   R            Renderer from createRenderer().
 * @param {Function} importFn     handleImport(directive, dir, context) → elements[]
 * @param {object}   [opts]
 * @param {object}   [opts.numberingState]   Shared counters for figures/tables/annexes.
 * @param {Array}    [opts.tocEntries]       Cached TOC entries from first pass.
 * @param {Array}    [opts.elementEntries]   Cached element entries from first pass.
 * @param {object}   [opts.vars]             Template variables (merged config+document).
 * @param {object}   [opts.logger]           Logger instance.
 * @param {string}   [opts.defaultAlignment] Default paragraph alignment.
 * @returns {Array}  Flat array of docx elements (may include SECTION_BREAK markers).
 */
function parseMD(text, dir, R, importFn, opts = {}) {
  const logger     = opts.logger || null;
  const alignStack = [];
  const currentAlignment = () =>
    alignStack.length ? alignStack[alignStack.length - 1] : opts.defaultAlignment;

  // Shared numbering state
  const state = opts.numberingState || {};
  if (typeof state.chapterIndex !== "number") state.chapterIndex = 0;
  if (typeof state.figureIndex  !== "number") state.figureIndex  = 0;
  if (typeof state.tableIndex   !== "number") state.tableIndex   = 0;
  if (typeof state.annexIndex   !== "number") state.annexIndex   = 0;

  // Document-level variables (collected in first pass or passed in)
  const vars = Object.assign({}, opts.vars || {});

  // First pass: collect @var definitions in this file's text
  for (const line of text.split(/\r?\n/)) {
    const varMatch = line.trim().match(/^<!--\s*@var:\s*(\w[\w.]*)\s*=\s*(.+?)\s*-->$/i);
    if (varMatch) vars[varMatch[1]] = varMatch[2];
  }

  const lines    = text.split(/\r?\n/);
  const elements = [];
  let pendingElement = null;
  let pendingStyle   = null;   // @style directive — applied to next block
  let i = 0;

  function push(...items) {
    items.flat().forEach(el => { if (el) elements.push(el); });
  }

  function clearPending() { pendingElement = null; }

  function consumeCaption(kind, title, alignment) {
    return R.makeCaption ? R.makeCaption(title, { kind, state, alignment }) : null;
  }

  function addAnnexTitle(title, alignment) {
    push(
      R.makeElementTitle
        ? R.makeElementTitle("annex", title, { alignment, state })
        : consumeCaption("annex", title, alignment)
    );
  }

  while (i < lines.length) {
    const raw     = lines[i];
    const trimmed = raw.trim();

    // Flush pending annex title when a non-empty, non-directive line appears
    if (pendingElement && pendingElement.kind === "annex" && trimmed && !trimmed.startsWith("<!--")) {
      addAnnexTitle(pendingElement.title, currentAlignment());
      clearPending();
    }

    // ════════════════════════════════════════════════════════════════════════
    // BLOCK DIRECTIVES
    // ════════════════════════════════════════════════════════════════════════

    const directiveMatch = trimmed.match(/^<!--\s*@([\w-]+)(?::\s*(.*?))?\s*-->$/i);
    if (directiveMatch) {
      const verb = directiveMatch[1].toLowerCase();
      const body = directiveMatch[2] || "";

      // @import
      if (verb === "import") {
        if (importFn) push(importFn(body, dir, { pendingElement, state, vars }));
        if (pendingElement && pendingElement.kind !== "annex") clearPending();
        i++; continue;
      }

      // @toc / @toc: title: ... | depth: N
      if (verb === "toc") {
        const tocOpts = parseDirectiveOpts(body);
        if (R.makeTableOfContents) push(R.makeTableOfContents({
          cachedEntries: opts.tocEntries || [],
          alias:         tocOpts.title || "Table of Contents",
          depth:         tocOpts.depth ? Number(tocOpts.depth) : undefined,
        }));
        i++; continue;
      }

      // @list: figures|tables|annexes
      if (verb === "list") {
        const bucket = body.trim().toLowerCase();
        const kind   = bucket === "tables" ? "table" : bucket === "figures" ? "figure" : "annex";
        const source = Array.isArray(opts.elementEntries) ? opts.elementEntries : [];
        const items  = source.filter(it => it && it.kind === kind).map(it => it.text).filter(Boolean);
        if (R.makeElementList) push(R.makeElementList(kind, items));
        i++; continue;
      }

      // @element: type: figure | title: ...
      if (verb === "element") {
        const eOpts = parseDirectiveOpts(body);
        const kind  = (eOpts.type || eOpts._path || "figure").toLowerCase();
        const title = eOpts.title || "";
        if (kind === "annex") {
          addAnnexTitle(title, currentAlignment());
          clearPending();
        } else {
          pendingElement = { kind, title };
        }
        i++; continue;
      }

      // @page-break
      if (verb === "page-break") {
        push(new Paragraph({ children: [new PageBreak()] }));
        i++; continue;
      }

      // @section: orientation: landscape | margin: 20 | id: mySection
      if (verb === "section") {
        const sOpts = parseDirectiveOpts(body);
        elements.push({
          _type:       "SECTION_BREAK",
          orientation: sOpts.orientation || "portrait",
          margin:      sOpts.margin      ? Number(sOpts.margin) : undefined,
          id:          sOpts.id          || sOpts._path         || undefined,
          header:      sOpts.header      || undefined,
          footer:      sOpts.footer      || undefined,
        });
        i++; continue;
      }

      // @style: info|warning|tip|danger|note|box|quote
      if (verb === "style") {
        pendingStyle = body.trim().toLowerCase() || "info";
        i++; continue;
      }

      // @var: name = value  (already collected above; skip at render time)
      if (verb === "var") { i++; continue; }

      // @anchor: id: section-id
      if (verb === "anchor") {
        const aOpts = parseDirectiveOpts(body);
        const anchorId = aOpts.id || aOpts._path || "";
        if (anchorId && R.makeAnchor) push(R.makeAnchor(anchorId));
        i++; continue;
      }

      // @columns — reserved for future column layout support
      if (verb === "columns") { i++; continue; }

      // Unknown directive — skip silently
      i++; continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // DEPRECATED: <div align="…"> … </div>
    // ════════════════════════════════════════════════════════════════════════

    const openDivAlign = trimmed.match(/^<div\s+align=["'](left|center|right)["']\s*>$/i);
    if (openDivAlign) {
      if (logger) logger.warn(
        `<div align="${openDivAlign[1]}"> is deprecated. Use {.${openDivAlign[1]}} modifier instead.`,
        "W002"
      );
      alignStack.push(ALIGN_MAP[openDivAlign[1].toLowerCase()]);
      i++; continue;
    }
    if (/^<\/div>$/i.test(trimmed)) {
      if (alignStack.length) alignStack.pop();
      i++; continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // DEPRECATED: --- / *** / ___ (standalone page break)
    // ════════════════════════════════════════════════════════════════════════

    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      if (logger) logger.warn(
        `"${trimmed}" for page breaks is deprecated. Use <!-- @page-break --> instead.`,
        "W002"
      );
      push(new Paragraph({ children: [new PageBreak()] }));
      i++; continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // INLINE IMAGE  ![alt](path)
    // ════════════════════════════════════════════════════════════════════════

    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const relImg = imgMatch[2];
      const absImg = path.resolve(dir, relImg);
      if (fs.existsSync(absImg)) {
        const data        = retrySync(() => fs.readFileSync(absImg));
        const captionMeta = pendingElement
          ? { kind: pendingElement.kind, state, title: pendingElement.title }
          : { caption: imgMatch[1], state };
        const imgElems = R.makeImage(data, path.extname(absImg).toLowerCase(), captionMeta);
        if (pendingStyle) pendingStyle = null; // callout wrapping images — skip
        push(imgElems);
        if (pendingElement) clearPending();
      }
      i++; continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // BLOCKQUOTE  > text
    // ════════════════════════════════════════════════════════════════════════

    if (trimmed.startsWith("> ") || trimmed === ">") {
      const alignment = currentAlignment();
      if (pendingStyle) {
        const style = pendingStyle;
        pendingStyle = null;
        push(R.makeCallout(trimmed.replace(/^>\s*/, "").trim(), style, alignment ? { alignment } : {}));
      } else {
        push(R.makeBlockquote(trimmed, alignment ? { alignment } : {}));
      }
      i++; continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // ATX HEADINGS  # to ####
    // ════════════════════════════════════════════════════════════════════════

    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      const { text: headingText, modifiers } = extractModifiers(hMatch[2]);
      const nonumber  = modifiers.has("no-num") || modifiers.has("nonumber") || modifiers.has("no-number");
      const pageBreak = modifiers.has("page-break");
      const alignMod  = modifiers.has("center")  ? ALIGN_MAP.center
                      : modifiers.has("right")    ? ALIGN_MAP.right
                      : modifiers.has("left")     ? ALIGN_MAP.left
                      : (alignStack.length ? alignStack[alignStack.length - 1] : undefined);

      if (!nonumber && hMatch[1].length === 1) state.chapterIndex += 1;

      push(R.makeHeading(headingText, hMatch[1].length, {
        ...(alignMod  ? { alignment: alignMod }  : {}),
        ...(nonumber  ? { nonumber: true }        : {}),
        ...(pageBreak ? { pageBreakBefore: true } : {}),
      }));
      pendingStyle = null;
      i++; continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // FENCED CODE BLOCKS  ```…```
    // ════════════════════════════════════════════════════════════════════════

    if (trimmed.startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      pendingStyle = null;
      if (pendingElement && pendingElement.kind !== "annex") clearPending();
      push(R.makeCodeBlock(codeLines));
      continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // MATH BLOCKS  $$…$$ (single or multi-line)
    // ════════════════════════════════════════════════════════════════════════

    if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
      if (pendingElement && pendingElement.kind !== "annex") clearPending();
      push(R.makeMathParagraph(trimmed.slice(2, -2).trim()));
      i++; continue;
    }
    if (trimmed === "$$") {
      const formulaLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "$$") {
        formulaLines.push(lines[i].trim());
        i++;
      }
      i++;
      if (pendingElement && pendingElement.kind !== "annex") clearPending();
      push(R.makeMathParagraph(formulaLines.join(" ")));
      continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // PIPE TABLES  | col | col |
    // ════════════════════════════════════════════════════════════════════════

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
          if (pendingElement.kind === "table" || pendingElement.kind === "figure") {
            push(consumeCaption(pendingElement.kind, pendingElement.title, currentAlignment()));
            clearPending();
          }
        }
      }
      pendingStyle = null;
      continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // LEGACY CAPTIONS  *Figure…  *Tableau…
    // ════════════════════════════════════════════════════════════════════════

    if (/^\*(Figure|Tableau|Graphique|Table|Annexe)/i.test(trimmed)) {
      push(R.makeCaption(trimmed, currentAlignment() ? { alignment: currentAlignment() } : {}));
      i++; continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // BULLET LIST  - item  or  * item
    // ════════════════════════════════════════════════════════════════════════

    if (/^[-*]\s+/.test(trimmed)) {
      const leadingSpaces = raw.match(/^(\s*)/)[1].length;
      const level         = leadingSpaces >= 4 ? 1 : 0;
      push(R.makeBullet(trimmed, level));
      i++; continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // NUMBERED LIST  1. item
    // ════════════════════════════════════════════════════════════════════════

    if (/^\d+\.\s+/.test(trimmed)) {
      push(R.makeNumbered(trimmed));
      i++; continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // BLANK LINE
    // ════════════════════════════════════════════════════════════════════════

    if (!trimmed) {
      if (pendingElement && pendingElement.kind !== "annex") clearPending();
      pendingStyle = null;
      i++; continue;
    }

    // ════════════════════════════════════════════════════════════════════════
    // DEFAULT: PARAGRAPH
    // ════════════════════════════════════════════════════════════════════════

    const { text: paraText, modifiers } = extractModifiers(trimmed);
    const alignMod = modifiers.has("center") ? ALIGN_MAP.center
                   : modifiers.has("right")  ? ALIGN_MAP.right
                   : modifiers.has("left")   ? ALIGN_MAP.left
                   : currentAlignment();
    const pageBreak = modifiers.has("page-break");

    // Deprecated {.box} — remap to pending style
    if (modifiers.has("box")) {
      if (logger) logger.warn("{.box} is deprecated. Use <!-- @style: box --> before the paragraph instead.", "W002");
      pendingStyle = "box";
    }

    if (pendingStyle) {
      const style = pendingStyle;
      pendingStyle = null;
      push(R.makeCallout(paraText, style, { alignment: alignMod }));
    } else if (pageBreak) {
      push(new Paragraph({ children: [new PageBreak()] }));
      push(R.makeParagraph(paraText, { alignment: alignMod }));
    } else {
      push(R.makeParagraph(paraText, { alignment: alignMod }));
    }
    i++;
  }

  return elements;
}

module.exports = { parseMD };
