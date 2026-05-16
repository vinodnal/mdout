/**
 * src/cli/index.js
 * Main dispatcher — parses the top-level command and routes to the appropriate handler.
 */
"use strict";

const { runBuild }    = require("./build");
const { runValidate } = require("./validate");
const { runInit }     = require("./init");
const { runExport }   = require("./export");
const { makeHelp }    = require("./help");
const { C, getVersion, die } = require("./utils");

const COMMANDS = new Set(["build", "validate", "init", "export", "help", "--help", "-h", "--version", "version"]);

/**
 * Entry point — call with `process.argv`.
 * @param {string[]} argv
 */
function run(argv) {
  const args = argv.slice(2);

  let cmd  = "build";
  let rest = args;

  if (args.length > 0 && COMMANDS.has(args[0])) {
    cmd  = args[0];
    rest = args.slice(1);
  }

  if (cmd === "--version" || cmd === "version") {
    process.stdout.write(`markfi v${getVersion()}\n`);
    return;
  }

  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(makeHelp("main"));
    return;
  }

  const handlers = { build: runBuild, validate: runValidate, init: runInit, export: runExport };
  const handler  = handlers[cmd];
  if (!handler) {
    process.stderr.write(`Unknown command: ${cmd}\n`);
    process.stdout.write(makeHelp("main"));
    process.exit(1);
  }

  handler(rest).catch(err => {
    process.stderr.write(`${C.red}Fatal:${C.reset} ${err.message}\n`);
    if (process.env.DEBUG) process.stderr.write(err.stack + "\n");
    process.exit(1);
  });
}

module.exports = { run };
