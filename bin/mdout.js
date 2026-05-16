#!/usr/bin/env node
/**
 * bin/mdout.js — mdout CLI entry point
 * Delegates to src/cli/index.js
 */
"use strict";
require("../src/cli/index").run(process.argv);
