/**
 * src/cli.js
 * Shim — re-exports from src/cli/index.js.
 * All CLI logic lives in src/cli/ sub-modules.
 */
"use strict";
const { run } = require("./cli/index");
module.exports = { run };
