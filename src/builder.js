/**
 * src/builder.js
 * Re-exports from sub-modules for backward compatibility.
 * All logic lives in src/builder/ sub-modules.
 */
"use strict";

const { buildFromConfig }              = require("./builder/index");
const { collectTocEntries, collectElementEntries } = require("./builder/first-pass");

module.exports = { buildFromConfig, collectTocEntries, collectElementEntries };
