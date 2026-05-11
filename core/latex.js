// core/latex.js — backward-compat shim. Delegates to src/latex.js.
module.exports = require("../src/latex");
// ─── Original implementation below (not executed) ────────────────────────────
/** @deprecated Use require('mdoc/src/latex') directly.
 * core/latex.js
 * LaTeX-to-Unicode conversion for display in DOCX.
 * Standalone — no dependencies.
 */

"use strict";

function latexToReadable(formula) {
  let f = formula.trim();

  // Strip outer delimiters
  if (f.startsWith("$$") && f.endsWith("$$") && f.length > 4) f = f.slice(2, -2).trim();
  if (f.startsWith("$") && f.endsWith("$") && f.length > 2) f = f.slice(1, -1).trim();

  // Resolve nested \frac{num}{den} → (num) / (den) iteratively
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
  };
  for (const [k, v] of Object.entries(greek)) f = f.replaceAll(k, v);

  // Operators
  const ops = {
    "\\times": " × ", "\\div": " ÷ ", "\\cdot": " · ", "\\pm": " ± ",
    "\\leq": " ≤ ", "\\geq": " ≥ ", "\\neq": " ≠ ", "\\approx": " ≈ ",
    "\\sum": "Σ", "\\prod": "Π", "\\infty": "∞", "\\partial": "∂",
    "\\nabla": "∇", "\\cdots": "…", "\\ldots": "…", "\\%": "%",
  };
  for (const [k, v] of Object.entries(ops)) f = f.replaceAll(k, v);

  // Named functions: \text{...} → content, \mathrm{...} → content
  f = f.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|operatorname)\{([^}]*)\}/g, "$1");

  // Superscripts / subscripts: ^{expr} → ^(expr), _{expr} → _(expr)
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
