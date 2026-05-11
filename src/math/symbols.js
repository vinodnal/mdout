/**
 * src/math/symbols.js
 * LaTeX symbol tables used by the math parser.
 *
 * GREEK   — Greek letter command → Unicode character
 * OPS     — Math operator command → Unicode character
 * NARY_CMDS — Commands that map to OMML nary (n-ary) elements (∫, ∑)
 */
"use strict";

/** Greek letter LaTeX commands → Unicode. */
const GREEK = {
  "\\varepsilon": "ε", "\\epsilon": "ε", "\\lambda": "λ",
  "\\alpha": "α", "\\beta": "β",   "\\gamma": "γ",  "\\delta": "δ",
  "\\Delta": "Δ", "\\mu": "μ",     "\\sigma": "σ",  "\\Sigma": "Σ",
  "\\pi": "π",    "\\Pi": "Π",     "\\theta": "θ",  "\\phi": "φ",
  "\\Phi": "Φ",   "\\omega": "ω",  "\\Omega": "Ω",  "\\rho": "ρ",
  "\\tau": "τ",   "\\eta": "η",    "\\nu": "ν",     "\\xi": "ξ",
  "\\kappa": "κ", "\\zeta": "ζ",   "\\psi": "ψ",    "\\chi": "χ",
  "\\Lambda": "Λ","\\Theta": "Θ",  "\\Psi": "Ψ",    "\\Xi": "Ξ",
  "\\Gamma": "Γ", "\\upsilon": "υ",
};

/** Math operator LaTeX commands → Unicode. */
const OPS = {
  "\\times": "×",   "\\div": "÷",      "\\cdot": "·",     "\\pm": "±",
  "\\leq": "≤",     "\\geq": "≥",      "\\neq": "≠",      "\\approx": "≈",
  "\\prod": "∏",    "\\infty": "∞",    "\\partial": "∂",  "\\nabla": "∇",
  "\\cdots": "⋯",   "\\ldots": "…",    "\\iint": "∬",     "\\oint": "∮",
  "\\rightarrow": "→",  "\\leftarrow": "←",   "\\Rightarrow": "⇒",
  "\\Leftarrow": "⇐",   "\\leftrightarrow": "↔", "\\Leftrightarrow": "⇔",
  "\\to": "→",      "\\forall": "∀",   "\\exists": "∃",
  "\\in": "∈",      "\\notin": "∉",    "\\subset": "⊂",   "\\supset": "⊃",
  "\\cup": "∪",     "\\cap": "∩",      "\\land": "∧",     "\\lor": "∨",
  "\\neg": "¬",     "\\langle": "⟨",   "\\rangle": "⟩",   "\\|": "‖",
  "\\sqrt": "√",
};

/** LaTeX commands that use OMML nary (n-ary) elements (∫, ∑). */
const NARY_CMDS = new Set(["\\int", "\\sum"]);

module.exports = { GREEK, OPS, NARY_CMDS };
