/**
 * src/parser/utils.js
 * Shared utilities for the Markdown parser.
 *
 * Exports:
 *   ALIGN_MAP              Maps config alignment strings to docx AlignmentType values.
 *   parseDirectiveOpts     Parse "path | key: value | key: value" directive option strings.
 *   extractModifiers       Extract and strip {.modifier} groups from a heading/line string.
 */
"use strict";

const { AlignmentType } = require("docx");

// ─── Alignment map ────────────────────────────────────────────────────────────

/** Maps Markdown alignment strings to docx AlignmentType enum values. */
const ALIGN_MAP = {
  left:      AlignmentType.LEFT,
  center:    AlignmentType.CENTER,
  right:     AlignmentType.RIGHT,
  justify:   AlignmentType.JUSTIFIED,
  justified: AlignmentType.JUSTIFIED,
};

// ─── Directive option parser ──────────────────────────────────────────────────

/**
 * Parse a pipe-separated directive option string.
 *
 * Input:  `"path/to/file.md | width: 500 | caption: My figure"`
 * Output: `{ _path: "path/to/file.md", width: "500", caption: "My figure" }`
 *
 * The first segment (before the first `|`) becomes `_path`.
 * Subsequent segments with a `:` become key-value pairs.
 *
 * @param {string} raw
 * @returns {object}
 */
function parseDirectiveOpts(raw) {
  const parts  = String(raw || "").split("|").map(s => s.trim());
  const result = { _path: parts[0] || "" };
  for (let i = 1; i < parts.length; i++) {
    const sep = parts[i].indexOf(":");
    if (sep > 0) {
      const key = parts[i].slice(0, sep).trim();
      const val = parts[i].slice(sep + 1).trim();
      if (key) result[key] = val;
    }
  }
  return result;
}

// ─── Modifier extractor ───────────────────────────────────────────────────────

/**
 * Extract CSS-class–style modifier groups from the end of a line.
 *
 * Supported modifiers: `.no-num`, `.center`, `.right`, `.left`, `.page-break`, etc.
 * Groups like `{.no-num .center}` or multiple groups `{.no-num} {.center}` are stripped
 * from the text and returned as a Set<string> of modifier names (without the dot prefix).
 *
 * Inline-style spans like `{color:red}text{/color}` are intentionally left untouched.
 *
 * @param {string} line  Raw heading or paragraph text (may include trailing modifiers).
 * @returns {{ text: string, modifiers: Set<string> }}
 */
function extractModifiers(line) {
  const modifiers = new Set();
  let text = String(line ?? "");

  while (true) {
    const m = text.match(/\s*(\{[^{}]*\})\s*$/);
    if (!m) break;

    const group      = m[1];
    const body       = group.slice(1, -1).trim();
    const modMatches = [...body.matchAll(/\.([a-z][\w-]*)/gi)];
    const onlyMods   = modMatches.length > 0
      && body.replace(/\.([a-z][\w-]*)/gi, "").trim() === "";

    if (!onlyMods) break;

    for (const mm of modMatches) modifiers.add(mm[1].toLowerCase());
    text = text.slice(0, m.index).trimEnd();
  }

  return { text: text.trim(), modifiers };
}

module.exports = { ALIGN_MAP, parseDirectiveOpts, extractModifiers };
