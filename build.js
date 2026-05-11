#!/usr/bin/env node
"use strict";

// Backward-compatible entrypoint: delegate to the unified CLI implementation.
require("./src/cli").run(process.argv);
