/**
 * src/parser.js
 * Shim — re-exports from src/parser/index.js.
 * All parser logic lives in src/parser/ sub-modules.
 */
"use strict";
const { parseMD }            = require("./parser/index");
const { parseDirectiveOpts, extractModifiers } = require("./parser/utils");
module.exports = { parseMD, parseDirectiveOpts, extractModifiers };
