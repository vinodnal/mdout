#!/usr/bin/env node
/**
 * bin/mdoc.js — mdout CLI entry point
 * Delegates to src/cli/index.js
 */
"use strict";
require("../src/cli/index").run(process.argv);
