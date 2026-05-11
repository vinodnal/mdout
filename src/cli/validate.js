/**
 * src/cli/validate.js
 * Implementation of the "mdoc validate" command.
 */
"use strict";

const path = require("path");
const fs   = require("fs");

const { validate }           = require("../validator");
const { parseValidateArgs }  = require("./args");
const { makeHelp }           = require("./help");
const { C, die }             = require("./utils");

/**
 * Run the validate command.
 * @param {string[]} args  Argument list after the "validate" command word.
 */
async function runValidate(args) {
  const opts = parseValidateArgs(args);
  if (opts.help) { process.stdout.write(makeHelp("validate")); return; }
  if (!opts.target) die("No project directory or config path specified.");

  const target = path.resolve(opts.target);
  if (!fs.existsSync(target)) die(`Path not found: ${target}`);

  const configPath = fs.statSync(target).isDirectory()
    ? path.join(target, "project.config.js")
    : target;
  if (!fs.existsSync(configPath)) die(`Config not found: ${configPath}`);

  const { valid, errors, warnings } = await validate(configPath, { depGraph: opts.depGraph });

  const relFile = (f, l) =>
    f ? `\n     ${path.relative(process.cwd(), f)}${l ? `:${l}` : ""}` : "";

  warnings.forEach(w => process.stderr.write(
    `${C.yellow}⚠${C.reset}  [${w.code}] ${w.message}${relFile(w.file, w.line)}\n`
  ));
  errors.forEach(e => process.stderr.write(
    `${C.red}✖${C.reset}  [${e.code}] ${e.message}${relFile(e.file, e.line)}\n`
  ));

  if (valid) {
    process.stdout.write(
      `${C.green}✔${C.reset}  Validation passed` +
      (warnings.length ? ` with ${warnings.length} warning(s)` : "") + ".\n"
    );
    process.exit(0);
  } else {
    process.stdout.write(
      `${C.red}✖${C.reset}  Validation failed with ${errors.length} error(s).\n`
    );
    process.exit(1);
  }
}

module.exports = { runValidate };
