/**
 * src/cli/init.js
 * Implementation of the "markfi init" command — scaffold a new project from a template.
 */
"use strict";

const path = require("path");
const fs   = require("fs");

const { parseInitArgs } = require("./args");
const { makeHelp }      = require("./help");
const { C, die }        = require("./utils");

const TEMPLATES = ["simple", "report", "thesis", "manual"];

/**
 * Recursively copy a directory.
 * @param {string} src
 * @param {string} dest
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else                     fs.copyFileSync(srcPath, destPath);
  }
}

/**
 * Run the init command.
 * @param {string[]} args  Argument list after the "init" command word.
 */
async function runInit(args) {
  const opts = parseInitArgs(args);
  if (opts.help) { process.stdout.write(makeHelp("init")); return; }

  if (!opts.target) die("No destination directory specified.\nUsage: markfi init [--template <name>] <dir>");

  if (!TEMPLATES.includes(opts.template)) {
    die(`Unknown template "${opts.template}". Available: ${TEMPLATES.join(", ")}`);
  }

  const templateDir = path.join(__dirname, "..", "templates", opts.template);
  if (!fs.existsSync(templateDir)) {
    die(`Template "${opts.template}" not found. Expected: ${templateDir}`);
  }

  const targetDir = path.resolve(opts.target);
  if (fs.existsSync(targetDir)) {
    if (fs.readdirSync(targetDir).length > 0) {
      die(`Directory already exists and is not empty: ${targetDir}`);
    }
  } else {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  copyDir(templateDir, targetDir);

  process.stdout.write(
    `${C.green}✔${C.reset}  Created project from template "${opts.template}":\n` +
    `   ${targetDir}\n\n` +
    `${C.bold}Next steps:${C.reset}\n` +
    `   cd ${opts.target}\n` +
    `   markfi build .\n`
  );
}

module.exports = { runInit };
