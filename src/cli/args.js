/**
 * src/cli/args.js
 * Argument parsers for each CLI command.
 *
 * Each parser accepts the argv tail (after the command word) and returns
 * a typed options object. Unknown flags cause the process to exit(1).
 */
"use strict";

const { die } = require("./utils");

// ─── Build ────────────────────────────────────────────────────────────────────

/**
 * Parse build command arguments.
 * New flags added over original:
 *   --var key=value   Override a project.config.js var from the command line.
 *   --json [path]     Write the build result as JSON. Omitting a path writes to stdout.
 *
 * @param {string[]} args  Argument list after the "build" command word.
 * @returns {object}
 */
function parseBuildArgs(args) {
  const opts = {
    help:          false,
    verbose:       false,
    quiet:         false,
    pdf:           false,
    pdfOnly:       false,
    out:           null,
    soffice:       null,
    projectDir:    null,
    watch:         false,
    watchDebounce: 300,
    vars:          {},         // --var overrides
    jsonOutput:    null,       // null = off, "-" = stdout, string = file path
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "-h": case "--help":    opts.help    = true; break;
      case "-v": case "--verbose": opts.verbose = true; break;
      case "-q": case "--quiet":   opts.quiet   = true; break;
      case "-p": case "--pdf":     opts.pdf     = true; break;
      case "--pdf-only":           opts.pdfOnly = true; break;
      case "--no-pdf":             opts.pdf     = false; break;
      case "--watch":              opts.watch   = true; break;

      case "--watch-debounce": {
        const val = Number(args[++i]);
        if (!Number.isFinite(val)) die("--watch-debounce requires a number (ms).");
        opts.watchDebounce = val;
        break;
      }

      case "-o": case "--out": {
        opts.out = args[++i];
        if (!opts.out) die(`${a} requires a path argument.`);
        break;
      }

      case "--soffice": {
        opts.soffice = args[++i];
        if (!opts.soffice) die("--soffice requires a path argument.");
        break;
      }

      case "--var": {
        const pair   = args[++i] || "";
        const eqIdx  = pair.indexOf("=");
        if (eqIdx <= 0) die(`--var requires key=value format, got: "${pair || "(empty)"}"`);
        const key    = pair.slice(0, eqIdx).trim();
        const value  = pair.slice(eqIdx + 1);
        if (!key)    die(`--var key cannot be empty.`);
        opts.vars[key] = value;
        break;
      }

      case "--json": {
        // Optional path; if next arg starts with - or is missing, write to stdout.
        const next = args[i + 1];
        if (next && !next.startsWith("-")) { opts.jsonOutput = next; i++; }
        else opts.jsonOutput = "-";
        break;
      }

      default:
        if (a.startsWith("-")) die(`Unknown option: ${a}\nRun with --help for usage.`);
        if (opts.projectDir !== null) die("Too many arguments — only one project directory expected.");
        opts.projectDir = a;
    }
  }

  return opts;
}

// ─── Validate ─────────────────────────────────────────────────────────────────

/**
 * @param {string[]} args
 * @returns {{ help: boolean, depGraph: boolean, target: string|null }}
 */
function parseValidateArgs(args) {
  const opts = { help: false, depGraph: false, target: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if      (a === "-h" || a === "--help") opts.help     = true;
    else if (a === "--dep-graph")          opts.depGraph = true;
    else if (a.startsWith("-"))            die(`Unknown option: ${a}`);
    else if (opts.target !== null)         die("Too many arguments.");
    else                                   opts.target   = a;
  }
  return opts;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * @param {string[]} args
 * @returns {{ help: boolean, template: string, target: string|null }}
 */
function parseInitArgs(args) {
  const opts = { help: false, template: "simple", target: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if      (a === "-h" || a === "--help")        opts.help    = true;
    else if (a === "-t" || a === "--template") {
      opts.template = args[++i] || "";
      if (!opts.template) die("--template requires a name (simple|report|thesis|manual).");
    }
    else if (a.startsWith("-"))                   die(`Unknown option: ${a}`);
    else if (opts.target !== null)                die("Too many arguments.");
    else                                          opts.target  = a;
  }
  return opts;
}

module.exports = { parseBuildArgs, parseValidateArgs, parseInitArgs };
