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

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Parse export command arguments.
 *
 * Formats:  images (or png / jpg) | md (or markdown)
 * Multiple formats can be requested in one run with repeated --format flags.
 *
 * @param {string[]} args
 * @returns {object}
 */
function parseExportArgs(args) {
  const opts = {
    help:        false,
    verbose:     false,
    quiet:       false,
    projectDir:  null,
    formats:     [],          // ["images", "md", …]
    // images options
    imageFormat: "png",       // "png" | "jpg"
    dpi:         150,
    pages:       null,        // null = all, string = spec like "1,3-5"
    prefix:      null,
    pdftoppm:    null,
    gs:          null,
    soffice:     null,
    skipBuild:   false,       // --no-build: skip DOCX build, use existing output
    // md options
    noCover:     false,
    // shared
    out:         null,
    vars:        {},
    jsonOutput:  null,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "-h": case "--help":    opts.help    = true; break;
      case "-v": case "--verbose": opts.verbose = true; break;
      case "-q": case "--quiet":   opts.quiet   = true; break;
      case "--no-build":           opts.skipBuild = true; break;
      case "--no-cover":           opts.noCover   = true; break;

      case "-f": case "--format": {
        const fmt = (args[++i] || "").toLowerCase();
        if (!fmt) die("--format requires a value (images|md).");
        if (!opts.formats.includes(fmt)) opts.formats.push(fmt);
        break;
      }

      case "--image-format": {
        const f = (args[++i] || "").toLowerCase();
        if (f !== "png" && f !== "jpg") die("--image-format must be png or jpg.");
        opts.imageFormat = f;
        break;
      }

      case "--dpi": {
        const v = Number(args[++i]);
        if (!Number.isFinite(v) || v < 1) die("--dpi requires a positive number.");
        opts.dpi = v;
        break;
      }

      case "--pages": {
        opts.pages = args[++i] || "";
        if (!opts.pages) die("--pages requires a value (e.g. 1,3-5 or all).");
        break;
      }

      case "--prefix": {
        opts.prefix = args[++i] || "";
        if (!opts.prefix) die("--prefix requires a value.");
        break;
      }

      case "-o": case "--out": {
        opts.out = args[++i];
        if (!opts.out) die(`${a} requires a path argument.`);
        break;
      }

      case "--soffice": {
        opts.soffice = args[++i];
        if (!opts.soffice) die("--soffice requires a path.");
        break;
      }

      case "--pdftoppm": {
        opts.pdftoppm = args[++i];
        if (!opts.pdftoppm) die("--pdftoppm requires a path.");
        break;
      }

      case "--gs": {
        opts.gs = args[++i];
        if (!opts.gs) die("--gs requires a path.");
        break;
      }

      case "--var": {
        const pair  = args[++i] || "";
        const eqIdx = pair.indexOf("=");
        if (eqIdx <= 0) die(`--var requires key=value format, got: "${pair || "(empty)"}"`);
        const key   = pair.slice(0, eqIdx).trim();
        const value = pair.slice(eqIdx + 1);
        if (!key) die("--var key cannot be empty.");
        opts.vars[key] = value;
        break;
      }

      case "--json": {
        const next = args[i + 1];
        if (next && !next.startsWith("-")) { opts.jsonOutput = next; i++; }
        else opts.jsonOutput = "-";
        break;
      }

      default:
        if (a.startsWith("-")) die(`Unknown option: ${a}\nRun 'mdoc export --help' for usage.`);
        // Positional: first = format shorthand (images/md/png/jpg) or project dir
        if (!opts.projectDir) {
          const knownFormats = new Set(["images", "md", "markdown", "png", "jpg"]);
          if (knownFormats.has(a.toLowerCase())) {
            if (!opts.formats.includes(a.toLowerCase())) opts.formats.push(a.toLowerCase());
          } else {
            opts.projectDir = a;
          }
        } else {
          die("Too many arguments.");
        }
    }
  }

  // Default to both formats if none specified
  if (!opts.formats.length) opts.formats = ["images", "md"];

  return opts;
}

module.exports = { parseBuildArgs, parseValidateArgs, parseInitArgs, parseExportArgs };
