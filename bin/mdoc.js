#!/usr/bin/env node
/**
 * bin/mdoc.js — mdoc CLI entry point
 * Delegates to src/cli.js
 */
"use strict";
require("../src/cli").run(process.argv);
