/**
 * src/math.js
 * LaTeX → OMML (Office Open Math Markup Language) rendering for DOCX.
 *
 * Uses the docx library's native Math API to produce real Word equations.
 * Falls back to Unicode text rendering (src/latex.js) when a formula is
 * too complex for the built-in parser, logging W004.
 *
 * Supported LaTeX constructs:
 *   \frac{}{}, \sqrt{}, ^{}, _{}, \alpha…Ω, \sum, \int, \prod,
 *   \text{}, \mathrm{}, \mathbf{}, plain text, operators
 */
"use strict";

const { latexToReadable } = require("./latex");

// ── Docx Math classes (docx@9.x API) ────────────────────────────────────────
// Note: MathBase, MathNumerator, MathDenominator, MathRadicandElement are NOT
// exported by docx@9.x. Use: MathFraction({numerator,denominator}),
// MathRadical({children}), MathSuperScript({children:[base,...sup]}).
let DocxMath, MathRun, MathFraction, MathSuperScript, MathSubScript, MathRadical, MathIntegral, MathSum;

try {
  const docx = require("docx");
  DocxMath        = docx.Math;
  MathRun         = docx.MathRun;
  MathFraction    = docx.MathFraction;
  MathSuperScript = docx.MathSuperScript;
  MathSubScript   = docx.MathSubScript;
  MathRadical     = docx.MathRadical;
  MathIntegral    = docx.MathIntegral;
  MathSum         = docx.MathSum;
} catch { /* handled via fallback */ }

// ── Unicode symbol tables ─────────────────────────────────────────────────────

const GREEK = {
  "\\varepsilon": "ε", "\\epsilon": "ε", "\\lambda": "λ",
  "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ",
  "\\Delta": "Δ", "\\mu": "μ", "\\sigma": "σ", "\\Sigma": "Σ",
  "\\pi": "π", "\\Pi": "Π", "\\theta": "θ", "\\phi": "φ",
  "\\Phi": "Φ", "\\omega": "ω", "\\Omega": "Ω", "\\rho": "ρ",
  "\\tau": "τ", "\\eta": "η", "\\nu": "ν", "\\xi": "ξ",
  "\\kappa": "κ", "\\zeta": "ζ", "\\psi": "ψ", "\\chi": "χ",
  "\\Lambda": "Λ", "\\Theta": "Θ", "\\Psi": "Ψ", "\\Xi": "Ξ",
  "\\Gamma": "Γ", "\\upsilon": "υ",
};

const OPS = {
  "\\times": "×", "\\div": "÷", "\\cdot": "·", "\\pm": "±",
  "\\leq": "≤", "\\geq": "≥", "\\neq": "≠", "\\approx": "≈",
  "\\prod": "∏", "\\infty": "∞", "\\partial": "∂",
  "\\nabla": "∇", "\\cdots": "⋯", "\\ldots": "…",
  "\\iint": "∬", "\\oint": "∮",
  "\\rightarrow": "→", "\\leftarrow": "←", "\\Rightarrow": "⇒",
  "\\Leftarrow": "⇐", "\\leftrightarrow": "↔", "\\Leftrightarrow": "⇔",
  "\\to": "→", "\\forall": "∀", "\\exists": "∃",
  "\\in": "∈", "\\notin": "∉", "\\subset": "⊂", "\\supset": "⊃",
  "\\cup": "∪", "\\cap": "∩", "\\land": "∧", "\\lor": "∨", "\\neg": "¬",
  "\\langle": "⟨", "\\rangle": "⟩", "\\|": "‖",
  "\\sqrt": "√",
};

// Commands that use OMML nary (integral/sum) elements
const NARY_CMDS = new Set(["\\int", "\\sum"]);

// ── Tokenizer ─────────────────────────────────────────────────────────────────

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
      } else { j++; }
      i = j;
    } else if (c === "{") { tokens.push({ type: "LBRACE" }); i++; }
    else if (c === "}") { tokens.push({ type: "RBRACE" }); i++; }
    else if (c === "^") { tokens.push({ type: "CARET" }); i++; }
    else if (c === "_") { tokens.push({ type: "UNDER" }); i++; }
    else if (c === " " || c === "\t") { tokens.push({ type: "SPACE" }); i++; }
    else if (c === "\n") { i++; }
    else { tokens.push({ type: "CHAR", value: c }); i++; }
  }
  return tokens;
}

// ── Element builder helpers ───────────────────────────────────────────────────

function mRun(text) {
  if (MathRun) return new MathRun(String(text));
  return null;
}

// ── Recursive parser → docx Math elements ────────────────────────────────────

/**
 * Parse a group {...} or single atom.
 * Returns { children: Element[], pos: number }
 */
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

/**
 * Like parseGroup but preserves spaces — used for \text{}, \mathrm{} etc.
 */
function parseTextGroup(tokens, pos) {
  while (pos < tokens.length && tokens[pos].type === "SPACE") pos++;
  if (pos >= tokens.length) return { children: [], pos };
  if (tokens[pos].type === "LBRACE") {
    pos++;
    const parts = [];
    while (pos < tokens.length && tokens[pos].type !== "RBRACE") {
      const t = tokens[pos];
      if (t.type === "SPACE")      parts.push(" ");
      else if (t.type === "CHAR") parts.push(t.value);
      else if (t.type === "CMD")  parts.push(t.value.slice(1)); // \' → ' etc.
      pos++;
    }
    if (pos < tokens.length) pos++; // consume RBRACE
    const text = parts.join("");
    return { children: text ? [mRun(text)] : [], pos };
  }
  const { elem, pos: np } = parseAtom(tokens, pos);
  return { children: elem.filter(Boolean), pos: np };
}

/**
 * Parse a single atom (command, character, or braced group).
 * Returns { elem: Element[], pos: number }
 */
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
        const elem = new MathFraction({
          numerator:   num.length ? num : [mRun("·")],
          denominator: den.length ? den : [mRun("·")],
        });
        return { elem: [elem], pos: p2 };
      }
      return { elem: [mRun("("), ...num, mRun("/"), ...den, mRun(")")], pos: p2 };
    }

    // \sqrt{expr}
    if (cmd === "\\sqrt") {
      const { children: radicand, pos: p1 } = parseGroup(tokens, pos);
      if (MathRadical) {
        const elem = new MathRadical({
          children: radicand.length ? radicand : [mRun("·")],
        });
        return { elem: [elem], pos: p1 };
      }
      return { elem: [mRun("√("), ...radicand, mRun(")")], pos: p1 };
    }

    // \text{...}, \mathrm{...}, \mathbf{...}, \mathit{...}, \operatorname{...}
    if (/^\\(?:text|mathrm|mathbf|mathit|mathsf|operatorname)$/.test(cmd)) {
      const { children, pos: p1 } = parseTextGroup(tokens, pos);
      return { elem: children, pos: p1 };
    }

    // Greek letters
    if (GREEK[cmd]) return { elem: [mRun(GREEK[cmd])], pos };

    // \int and \sum — use OMML nary elements with optional sub/super limits
    if (NARY_CMDS.has(cmd)) {
      // Peek ahead for _ and ^ limits (any order), skipping spaces
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
      // No limits → emit bare Unicode symbol (avoids OMML nary formatting on plain ∑/∫)
      if (!subChildren && !supChildren) {
        return { elem: [mRun(isIntegral ? "∫" : "∑")], pos };
      }

      const NaryClass  = isIntegral ? MathIntegral : MathSum;
      if (NaryClass) {
        const naryOpts = {};
        if (subChildren) naryOpts.subScript = subChildren;
        if (supChildren) naryOpts.superScript = supChildren;
        return { elem: [new NaryClass(naryOpts)], pos };
      }
      // Fallback: Unicode symbol
      return { elem: [mRun(isIntegral ? "∫" : "∑")], pos };
    }

    // Operators
    if (OPS[cmd]) return { elem: [mRun(OPS[cmd])], pos };

    // Unknown command → render name without backslash
    return { elem: [mRun(cmd.slice(1))], pos };
  }

  if (t.type === "CHAR") {
    return { elem: [mRun(t.value)], pos: pos + 1 };
  }

  if (t.type === "SPACE") {
    return { elem: [], pos: pos + 1 };
  }

  if (t.type === "LBRACE") {
    const { children, pos: np } = parseGroup(tokens, pos);
    return { elem: children, pos: np };
  }

  // Skip RBRACE, AMP, and unknown tokens
  return { elem: [], pos: pos + 1 };
}

/**
 * Parse a full expression sequence, applying ^ and _ operators.
 * Returns { elements: Element[], pos: number }
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

      const base = elements.length > 0 ? [elements.pop()] : [mRun("\u00B7")]; // ·

      if (MathSuperScript && MathSubScript) {
        const scriptChildren = script.length ? script : [mRun("·")];
        if (isSup) {
          elements.push(new MathSuperScript({
            children: [...base, ...scriptChildren],
          }));
        } else {
          elements.push(new MathSubScript({
            children: [...base, ...scriptChildren],
          }));
        }
      } else {
        const symbol = isSup ? "^" : "_";
        elements.push(...base, mRun(symbol), ...script);
      }
      continue;
    }

    const { elem, pos: np } = parseAtom(tokens, pos);
    elements.push(...elem.filter(Boolean));
    pos = np;
  }

  return { elements, pos };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert a LaTeX formula to a docx Paragraph containing a real Math element.
 * Returns a Paragraph (never throws; falls back to Unicode on errors).
 *
 * @param {string} formula    LaTeX formula string (with or without $...$ delimiters).
 * @param {object} opts
 * @param {object} [opts.logger]    Logger for W004 warnings.
 * @param {string} [opts.accentColor]  Hex color for border/text in fallback mode.
 * @param {string} [opts.mathBg]    Hex bg color for fallback mode.
 * @param {string} [opts.font]      Font name for fallback mode.
 * @param {number} [opts.fontSize]  Font size (pt) for fallback mode.
 * @returns {Paragraph}
 */
function latexToMathParagraph(formula, opts = {}) {
  const { Paragraph, TextRun, AlignmentType, BorderStyle, ShadingType } = require("docx");

  const accentColor = opts.accentColor || "2E75B6";
  const mathBg      = opts.mathBg      || "EEF4FB";
  const font        = opts.font        || "Cambria Math";
  const fontSize    = ((opts.fontSize  || 11) * 2) + 4;

  // Strip outer delimiters
  const clean = String(formula ?? "").trim()
    .replace(/^\$\$/, "").replace(/\$\$$/, "")
    .replace(/^\$/, "").replace(/\$$/, "")
    .trim();

  // Attempt OMML rendering
  if (DocxMath && MathRun && MathSuperScript) {
    try {
      const tokens = tokenize(clean);
      const { elements } = parseExpr(tokens, 0);
      const filtered = elements.filter(Boolean);
      if (filtered.length > 0) {
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing:   { before: 200, after: 200 },
          children:  [new DocxMath({ children: filtered })],
        });
      }
    } catch (err) {
      if (opts.logger) {
        opts.logger.warn(
          `OMML rendering failed for formula "${clean.slice(0, 40)}…": ${err.message}`,
          "W004"
        );
      }
    }
  }

  // Unicode fallback
  if (opts.logger && (!DocxMath || !MathRun)) {
    opts.logger.warn("docx Math API unavailable — using Unicode math rendering.", "W004");
  }
  const readable = latexToReadable(formula);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { before: 200, after: 200 },
    border: {
      left:  { style: BorderStyle.SINGLE, size: 8, color: accentColor, space: 10 },
      right: { style: BorderStyle.SINGLE, size: 8, color: accentColor, space: 10 },
    },
    shading:  { type: ShadingType.CLEAR, fill: mathBg },
    indent:   { left: 400, right: 400 },
    children: [new TextRun({ text: readable, font, size: fontSize, bold: true, color: accentColor })],
  });
}

/**
 * Convert an inline LaTeX expression to a TextRun (for use inside paragraphs).
 * Always falls back to Unicode — OMML is block-level only in Word.
 */
function latexToInlineRun(formula, opts = {}) {
  const { TextRun } = require("docx");
  const readable = latexToReadable(formula);
  return new TextRun({
    text:    readable,
    italics: true,
    font:    opts.font  || "Cambria Math",
    size:    (opts.fontSize || 11) * 2,
    color:   opts.color || "2E4C7E",
  });
}

module.exports = { latexToMathParagraph, latexToInlineRun, tokenize, parseExpr };
