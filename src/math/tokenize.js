/**
 * src/math/tokenize.js
 * LaTeX tokenizer for the mdoc math parser.
 *
 * Splits a raw LaTeX string into a flat array of typed tokens consumed by
 * the recursive-descent parser in src/math/parse.js.
 *
 * Token types:
 *   CMD    — LaTeX command starting with \ (e.g. \frac, \alpha)
 *   CHAR   — Single non-special character
 *   LBRACE — Opening curly brace {
 *   RBRACE — Closing curly brace }
 *   CARET  — Superscript operator ^
 *   UNDER  — Subscript operator _
 *   SPACE  — Whitespace (space, tab)
 */
"use strict";

/**
 * Tokenize a LaTeX formula string.
 * @param {string} str
 * @returns {{ type: string, value?: string }[]}
 */
function tokenize(str) {
  const tokens = [];
  let i = 0;

  while (i < str.length) {
    const c = str[i];

    if (c === "\\") {
      let j = i + 1;
      if (j < str.length && /[a-zA-Z]/.test(str[j])) {
        while (j < str.length && /[a-zA-Z*']/.test(str[j])) j++;
        tokens.push({ type: "CMD", value: str.slice(i, j) });
      } else if (j < str.length) {
        tokens.push({ type: "CMD", value: str.slice(i, j + 1) });
        j++;
      } else {
        j++;
      }
      i = j;
    } else if (c === "{") {
      tokens.push({ type: "LBRACE" }); i++;
    } else if (c === "}") {
      tokens.push({ type: "RBRACE" }); i++;
    } else if (c === "^") {
      tokens.push({ type: "CARET" });  i++;
    } else if (c === "_") {
      tokens.push({ type: "UNDER" });  i++;
    } else if (c === " " || c === "\t") {
      tokens.push({ type: "SPACE" });  i++;
    } else if (c === "\n") {
      i++;
    } else {
      tokens.push({ type: "CHAR", value: c }); i++;
    }
  }

  return tokens;
}

module.exports = { tokenize };
