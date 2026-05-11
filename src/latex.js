/**
 * src/latex.js
 * LaTeX → Unicode conversion for DOCX display (fallback when OMML unavailable).
 * Standalone — no dependencies.
 */
"use strict";

function latexToReadable(formula) {
  let f = String(formula ?? "").trim();

  // Strip outer delimiters
  if (f.startsWith("$$") && f.endsWith("$$") && f.length > 4) f = f.slice(2, -2).trim();
  if (f.startsWith("$")  && f.endsWith("$")  && f.length > 2) f = f.slice(1, -1).trim();

  // Resolve nested \frac{num}{den} → (num) / (den)
  let prev;
  do {
    prev = f;
    f = f.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1) / ($2)");
  } while (f !== prev);

  // Greek letters
  const greek = {
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
  for (const [k, v] of Object.entries(greek)) f = f.replaceAll(k, v);

  // Operators
  const ops = {
    "\\times": " × ", "\\div": " ÷ ", "\\cdot": " · ", "\\pm": " ± ",
    "\\leq": " ≤ ", "\\geq": " ≥ ", "\\neq": " ≠ ", "\\approx": " ≈ ",
    "\\sum": "Σ", "\\prod": "Π", "\\infty": "∞", "\\partial": "∂",
    "\\nabla": "∇", "\\cdots": "⋯", "\\ldots": "…", "\\%": "%",
    "\\int": "∫", "\\iint": "∬", "\\oint": "∮",
    "\\rightarrow": "→", "\\leftarrow": "←", "\\Rightarrow": "⇒",
    "\\Leftarrow": "⇐", "\\leftrightarrow": "↔", "\\Leftrightarrow": "⇔",
    "\\to": "→", "\\forall": "∀", "\\exists": "∃",
    "\\in": "∈", "\\notin": "∉", "\\subset": "⊂", "\\supset": "⊃",
    "\\cup": "∪", "\\cap": "∩", "\\land": "∧", "\\lor": "∨", "\\neg": "¬",
    "\\langle": "⟨", "\\rangle": "⟩",
  };
  for (const [k, v] of Object.entries(ops)) f = f.replaceAll(k, v);

  // Named functions: \text{...} → content
  f = f.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|operatorname)\{([^}]*)\}/g, "$1");

  // Superscripts / subscripts: ^{expr} → (expr)
  f = f.replace(/\^\{([^}]*)\}/g, "^($1)").replace(/_\{([^}]*)\}/g, "_($1)");
  f = f.replace(/\^([\w])/g, "^$1").replace(/_([\w])/g, "_$1");

  // sqrt
  f = f.replace(/\\sqrt\{([^}]*)\}/g, "√($1)");

  // Remove remaining LaTeX commands and braces
  f = f.replace(/\\[a-zA-Z]+\*/g, "").replace(/\\[a-zA-Z]+/g, "");
  f = f.replace(/[{}]/g, "");

  return f.replace(/\s+/g, " ").trim();
}

module.exports = { latexToReadable };
