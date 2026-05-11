/**
 * src/builder/first-pass.js
 * First-pass document crawler: collects Table-of-Contents entries and
 * figure/table/annex entries by scanning Markdown source files without
 * a full parse.  The crawl resolves @import directives recursively so
 * nested includes are counted correctly.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { readTextFile } = require("./page");
const { IMAGE_EXTS, SCRIPT_EXTS } = require("../import-types");

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Heading modifier helpers ─────────────────────────────────────────────────

/**
 * Return true if the heading text contains a `.no-num` (or variant) modifier.
 * @param {string} text  Raw heading text including modifier groups like `{.no-num}`.
 */
function hasNoNumberModifier(text) {
  const value = String(text || "");
  return /\{[^{}]*\.(?:no-num|no-number|nonumber)\b[^{}]*\}/i.test(value);
}

/**
 * Strip trailing CSS-class–style modifier groups `{.class-name …}` from text.
 * @param {string} text
 * @returns {string}
 */
function stripTrailingModifiers(text) {
  let value = String(text || "");
  while (true) {
    const m = value.match(/\s*(\{[^{}]*\})\s*$/);
    if (!m) break;
    const body      = m[1].slice(1, -1).trim();
    const modMatches = [...body.matchAll(/\.([a-z][\w-]*)/gi)];
    const onlyMods   = modMatches.length > 0 && body.replace(/\.([a-z][\w-]*)/gi, "").trim() === "";
    if (!onlyMods) break;
    value = value.slice(0, m.index).trimEnd();
  }
  return value.trim();
}

// ─── ToC first pass ───────────────────────────────────────────────────────────

/**
 * Crawl the Markdown tree (resolving @import directives) and return an array
 * of `{ title, level }` objects suitable for rendering a Table of Contents.
 *
 * @param {string} entryPath  Absolute path to the root Markdown file.
 * @returns {{ title: string, level: number }[]}
 */
function collectTocEntries(entryPath) {
  const entries  = [];
  const counters = [0, 0, 0, 0];   // [h1, h2, h3, h4]

  function toRoman(value) {
    const map = [
      [1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],
      [100,"C"],[90,"XC"],[50,"L"],[40,"XL"],
      [10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"],
    ];
    let n = Math.max(1, value), out = "";
    for (const [amount, symbol] of map)
      while (n >= amount) { out += symbol; n -= amount; }
    return out;
  }

  function computeNum(level) {
    if (level === 1) return `${toRoman(counters[0])}.`;
    if (level === 2) return `${counters[1]}.`;
    if (level === 3) return `${counters[1]}.${counters[2]}.`;
    return `${counters[1]}.${counters[2]}.${counters[3]}.`;
  }

  function visit(filePath, stack) {
    const normalized = path.resolve(filePath);
    if (stack.has(normalized)) return;
    stack.add(normalized);

    const text  = readTextFile(normalized);
    const lines = text.split(/\r?\n/);
    const dir   = path.dirname(normalized);

    for (const line of lines) {
      const t = line.trim();

      const importMatch = t.match(/^<!--\s*@import:\s*(.+?)\s*-->$/);
      if (importMatch) {
        const relPath = importMatch[1].split("|")[0].trim();
        if (relPath) {
          const abs = path.resolve(dir, relPath);
          const ext = path.extname(abs).toLowerCase();
          if ((ext === ".md" || ext === ".txt") && fs.existsSync(abs)) visit(abs, stack);
        }
        continue;
      }

      const hMatch = t.match(/^(#{1,4})\s+(.+)$/);
      if (!hMatch) continue;

      const level    = hMatch[1].length;
      const rawTitle = hMatch[2].trim();
      if (hasNoNumberModifier(rawTitle)) continue;

      counters[level - 1] += 1;
      for (let idx = level; idx < 4; idx++) counters[idx] = 0;

      const title = stripTrailingModifiers(rawTitle)
        .replace(/\*\*/g, "").replace(/\*/g, "")
        .replace(/\{\{[\w.]+\}\}/g, "").trim();
      if (!title) continue;

      entries.push({ title: `${computeNum(level)} ${title}`, level });
    }

    stack.delete(normalized);
  }

  visit(entryPath, new Set());
  return entries;
}

// ─── Element-list first pass ──────────────────────────────────────────────────

/**
 * Crawl the Markdown tree and return an array of
 * `{ kind: "figure"|"table"|"annex", text: string }` objects for building
 * the List of Figures/Tables/Annexes.
 *
 * @param {string} entryPath  Absolute path to the root Markdown file.
 * @returns {{ kind: string, text: string }[]}
 */
function collectElementEntries(entryPath) {
  const entries = [];
  const state   = { figureIndex: 0, tableIndex: 0, annexIndex: 0 };
  const LABELS  = { figure: "Figure", table: "Tableau", annex: "Annexe" };

  function parseDirectiveParts(raw) {
    return String(raw || "").split("|").map(s => s.trim()).filter(Boolean);
  }

  function parseDirectiveOpts(raw) {
    const parts = parseDirectiveParts(raw);
    const opts  = { _path: parts[0] || "" };
    for (let i = 1; i < parts.length; i++) {
      const idx = parts[i].indexOf(":");
      if (idx <= 0) continue;
      const key = parts[i].slice(0, idx).trim().toLowerCase();
      const val = parts[i].slice(idx + 1).trim();
      if (key) opts[key] = val;
    }
    return opts;
  }

  function inferKindFromCaption(caption) {
    const value = String(caption || "").trim();
    if (/^annexe\b/i.test(value)) return "annex";
    if (/^(tableau|table)\b/i.test(value)) return "table";
    return "figure";
  }

  function captionToTitle(caption) {
    return String(caption || "")
      .trim()
      .replace(/[–—]/g, "-")
      .replace(/^(Figure|Tableau|Table|Annexe)\s*(?:[A-Za-z0-9.]+)?\s*[:-]+\s*/i, "")
      .trim();
  }

  function getLabel(kind, text) {
    const lower = (kind || "").toLowerCase();
    if (LABELS[lower]) return LABELS[lower];
    const m = (text || "").trim().match(/^(Figure|Tableau|Table|Annexe)\b/i);
    if (m) return /^table$/i.test(m[1]) ? "Tableau" : m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    return null;
  }

  function consumeNum(kind) {
    const k = (kind || "").toLowerCase();
    if (k === "annex")  { const i = state.annexIndex++;  return String.fromCharCode(65 + (i % 26)); }
    if (k === "figure") return String(++state.figureIndex);
    if (k === "table")  return String(++state.tableIndex);
    return null;
  }

  function makeCaptionText(kind, title) {
    const label = getLabel(kind, title);
    const num   = consumeNum(kind);
    if (label && num) return `${label} ${num}${title ? ` - ${title}` : ""}`;
    return title || "";
  }

  function visit(filePath, stack) {
    const normalized = path.resolve(filePath);
    if (stack.has(normalized)) return;
    stack.add(normalized);

    const text  = readTextFile(normalized);
    const lines = text.split(/\r?\n/);
    const dir   = path.dirname(normalized);
    let pending = null;

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();

      // Chapter counter (for possible future use)
      const hMatch = t.match(/^#{1}\s+(.+)$/);
      if (hMatch && !hasNoNumberModifier(hMatch[1])) state.chapterIndex = (state.chapterIndex || 0) + 1;

      // @element directive
      const elemMatch = t.match(/^<!--\s*@element:\s*(.+?)\s*-->$/i);
      if (elemMatch) {
        const parts   = elemMatch[1].split("|").map(s => s.trim());
        let kind, title;
        const typeOpt  = parts.find(p => /^type:/i.test(p));
        const titleOpt = parts.find(p => /^title:/i.test(p));
        if (typeOpt || titleOpt) {
          kind  = typeOpt  ? typeOpt.replace(/^type:\s*/i, "").toLowerCase()  : parts[0].toLowerCase();
          title = titleOpt ? titleOpt.replace(/^title:\s*/i, "")              : "";
        } else {
          kind  = parts[0].split(" ")[0].toLowerCase();
          const titlePart = parts.find(p => /^title:/i.test(p));
          title = titlePart ? titlePart.replace(/^title:\s*/i, "") : "";
        }
        if (kind === "annex") {
          entries.push({ kind: "annex", text: makeCaptionText("annex", title) });
          pending = null;
        } else {
          pending = { kind, title };
        }
        continue;
      }

      // @import directive
      const importMatch = t.match(/^<!--\s*@import:\s*(.+?)\s*-->$/);
      if (importMatch) {
        const importOpts = parseDirectiveOpts(importMatch[1]);
        const relPath    = importOpts._path || "";
        const abs        = relPath ? path.resolve(dir, relPath) : "";
        const ext        = abs ? path.extname(abs).toLowerCase() : "";
        const isMedia    = IMAGE_EXTS.has(ext) || SCRIPT_EXTS.has(ext);

        if (pending && isMedia) {
          entries.push({ kind: pending.kind, text: makeCaptionText(pending.kind, pending.title) });
          pending = null;
        } else if (isMedia && importOpts.caption) {
          const kind  = inferKindFromCaption(importOpts.caption);
          const title = captionToTitle(importOpts.caption);
          entries.push({ kind, text: makeCaptionText(kind, title) });
        }
        if ((ext === ".md" || ext === ".txt") && abs && fs.existsSync(abs)) visit(abs, stack);
        if (pending) pending = null;
        continue;
      }

      // Inline image
      const imgMatch = t.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch && pending) {
        entries.push({ kind: pending.kind, text: makeCaptionText(pending.kind, pending.title) });
        pending = null;
        continue;
      }

      // Markdown table
      if (t.startsWith("|")) {
        while (i < lines.length && lines[i].trim().startsWith("|")) i++;
        i--;
        if (pending && (pending.kind === "table" || pending.kind === "figure")) {
          entries.push({ kind: pending.kind, text: makeCaptionText(pending.kind, pending.title) });
          pending = null;
        }
        continue;
      }

      // Blank line resets pending
      if (!t && pending && pending.kind !== "annex") pending = null;
    }

    stack.delete(normalized);
  }

  visit(entryPath, new Set());
  return entries;
}

module.exports = {
  IMAGE_EXTS,
  hasNoNumberModifier,
  stripTrailingModifiers,
  collectTocEntries,
  collectElementEntries,
};
