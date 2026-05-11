/**
 * src/math/parse.js
 * Recursive-descent parser that converts a token stream (from tokenize.js) into
 * an array of docx Math child elements for OMML rendering.
 *
 * Supports: \frac, \sqrt, ^, _, \text, \mathrm, \mathbf, Greek letters,
 *           \int, \sum (with optional limits), and all operators in symbols.js.
 *
 * Falls back to Unicode text rendering for anything unrecognized.
 */
"use strict";

const { GREEK, OPS, NARY_CMDS } = require("./symbols");

// ── Docx Math classes (docx@9.x API) ────────────────────────────────────────
let DocxMath, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, MathIntegral, MathSum;

try {
  const docx   = require("docx");
  DocxMath        = docx.Math;
  MathRun         = docx.MathRun;
  MathFraction    = docx.MathFraction;
  MathSuperScript = docx.MathSuperScript;
  MathSubScript   = docx.MathSubScript;
  MathRadical     = docx.MathRadical;
  MathIntegral    = docx.MathIntegral;
  MathSum         = docx.MathSum;
} catch { /* handled via fallback in index.js */ }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mRun(text) {
  if (MathRun) return new MathRun(String(text));
  return null;
}

// ─── Group parser ─────────────────────────────────────────────────────────────

function parseGroup(tokens, pos) {
  while (pos < tokens.length && tokens[pos].type === "SPACE") pos++;
  if (pos >= tokens.length) return { children: [], pos };

  if (tokens[pos].type === "LBRACE") {
    pos++; // consume {
    const children = [];
    while (pos < tokens.length && tokens[pos].type !== "RBRACE") {
      while (pos < tokens.length && tokens[pos].type === "SPACE") pos++;
      if (pos < tokens.length && tokens[pos].type !== "RBRACE") {
        const { elem, pos: np } = parseAtom(tokens, pos);
        children.push(...elem.filter(Boolean));
        pos = np;
      }
    }
    if (pos < tokens.length && tokens[pos].type === "RBRACE") pos++;
    return { children, pos };
  }

  const { elem, pos: np } = parseAtom(tokens, pos);
  return { children: elem.filter(Boolean), pos: np };
}

/** Like parseGroup but preserves whitespace — for \text{}, \mathrm{}, etc. */
function parseTextGroup(tokens, pos) {
  while (pos < tokens.length && tokens[pos].type === "SPACE") pos++;
  if (pos >= tokens.length) return { children: [], pos };

  if (tokens[pos].type === "LBRACE") {
    pos++;
    const parts = [];
    while (pos < tokens.length && tokens[pos].type !== "RBRACE") {
      const t = tokens[pos];
      if      (t.type === "SPACE") parts.push(" ");
      else if (t.type === "CHAR")  parts.push(t.value);
      else if (t.type === "CMD")   parts.push(t.value.slice(1));
      pos++;
    }
    if (pos < tokens.length) pos++; // consume RBRACE
    const text = parts.join("");
    return { children: text ? [mRun(text)] : [], pos };
  }

  const { elem, pos: np } = parseAtom(tokens, pos);
  return { children: elem.filter(Boolean), pos: np };
}

// ─── Atom parser ──────────────────────────────────────────────────────────────

function parseAtom(tokens, pos) {
  if (pos >= tokens.length) return { elem: [], pos };
  const t = tokens[pos];

  if (t.type === "CMD") {
    pos++;
    const cmd = t.value;

    // \frac{numerator}{denominator}
    if (cmd === "\\frac") {
      const { children: num, pos: p1 } = parseGroup(tokens, pos);
      const { children: den, pos: p2 } = parseGroup(tokens, p1);
      if (MathFraction) {
        return { elem: [new MathFraction({
          numerator:   num.length ? num : [mRun("·")],
          denominator: den.length ? den : [mRun("·")],
        })], pos: p2 };
      }
      return { elem: [mRun("("), ...num, mRun("/"), ...den, mRun(")")], pos: p2 };
    }

    // \sqrt{expr}
    if (cmd === "\\sqrt") {
      const { children: radicand, pos: p1 } = parseGroup(tokens, pos);
      if (MathRadical) {
        return { elem: [new MathRadical({ children: radicand.length ? radicand : [mRun("·")] })], pos: p1 };
      }
      return { elem: [mRun("√("), ...radicand, mRun(")")], pos: p1 };
    }

    // \text, \mathrm, \mathbf, \mathit, \mathsf, \operatorname
    if (/^\\(?:text|mathrm|mathbf|mathit|mathsf|operatorname)$/.test(cmd)) {
      const { children, pos: p1 } = parseTextGroup(tokens, pos);
      return { elem: children, pos: p1 };
    }

    // Greek letters
    if (GREEK[cmd]) return { elem: [mRun(GREEK[cmd])], pos };

    // \int and \sum — OMML nary with optional sub/super limits
    if (NARY_CMDS.has(cmd)) {
      let subChildren = null;
      let supChildren = null;
      let p = pos;

      for (let attempt = 0; attempt < 2; attempt++) {
        while (p < tokens.length && tokens[p].type === "SPACE") p++;
        if (p < tokens.length && tokens[p].type === "UNDER") {
          const { children, pos: np } = parseGroup(tokens, p + 1);
          subChildren = children.length ? children : [mRun("·")];
          p = np;
        } else if (p < tokens.length && tokens[p].type === "CARET") {
          const { children, pos: np } = parseGroup(tokens, p + 1);
          supChildren = children.length ? children : [mRun("·")];
          p = np;
        } else {
          break;
        }
      }
      pos = p;

      const isIntegral = cmd === "\\int";
      if (!subChildren && !supChildren) {
        return { elem: [mRun(isIntegral ? "∫" : "∑")], pos };
      }

      const NaryClass = isIntegral ? MathIntegral : MathSum;
      if (NaryClass) {
        const naryOpts = {};
        if (subChildren) naryOpts.subScript   = subChildren;
        if (supChildren) naryOpts.superScript  = supChildren;
        return { elem: [new NaryClass(naryOpts)], pos };
      }
      return { elem: [mRun(isIntegral ? "∫" : "∑")], pos };
    }

    // Operators
    if (OPS[cmd]) return { elem: [mRun(OPS[cmd])], pos };

    // Unknown — render name without backslash
    return { elem: [mRun(cmd.slice(1))], pos };
  }

  if (t.type === "CHAR")   return { elem: [mRun(t.value)], pos: pos + 1 };
  if (t.type === "SPACE")  return { elem: [], pos: pos + 1 };
  if (t.type === "LBRACE") { const { children, pos: np } = parseGroup(tokens, pos); return { elem: children, pos: np }; }

  // Skip RBRACE and unknown tokens
  return { elem: [], pos: pos + 1 };
}

// ─── Expression parser ────────────────────────────────────────────────────────

/**
 * Parse a full expression sequence, applying ^ and _ operators.
 * @param {{ type: string, value?: string }[]} tokens
 * @param {number} pos  Starting position.
 * @returns {{ elements: object[], pos: number }}
 */
function parseExpr(tokens, pos) {
  const elements = [];

  while (pos < tokens.length && tokens[pos].type !== "RBRACE") {
    const t = tokens[pos];

    if (t.type === "SPACE") { pos++; continue; }

    if (t.type === "CARET" || t.type === "UNDER") {
      const isSup = t.type === "CARET";
      pos++;
      const { children: script, pos: np } = parseGroup(tokens, pos);
      pos = np;
      const base           = elements.length > 0 ? [elements.pop()] : [mRun("·")];
      const scriptChildren = script.length ? script : [mRun("·")];

      if (MathSuperScript && MathSubScript) {
        elements.push(isSup
          ? new MathSuperScript({ children: [...base, ...scriptChildren] })
          : new MathSubScript({ children: [...base, ...scriptChildren] })
        );
      } else {
        elements.push(...base, mRun(isSup ? "^" : "_"), ...script);
      }
      continue;
    }

    const { elem, pos: np } = parseAtom(tokens, pos);
    elements.push(...elem.filter(Boolean));
    pos = np;
  }

  return { elements, pos };
}

module.exports = {
  DocxMath, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, MathIntegral, MathSum,
  mRun, parseGroup, parseTextGroup, parseAtom, parseExpr,
};
