/**
 * src/math.js
 * Shim — re-exports from src/math/ sub-modules.
 * All math logic lives in src/math/ sub-modules.
 */
"use strict";
const { latexToMathParagraph, latexToInlineRun } = require("./math/index");
const { tokenize }  = require("./math/tokenize");
const { parseExpr } = require("./math/parse");
module.exports = { latexToMathParagraph, latexToInlineRun, tokenize, parseExpr };
