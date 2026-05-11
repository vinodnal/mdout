/**
 * src/cli.js
 * CLI entry point for mdoc.
 *
 * Commands:
 *   mdoc build <project-dir>     Build DOCX (and optionally PDF).
 *   mdoc validate <config-path>  Validate imports and variables without building.
 *   mdoc init <dir>              Scaffold a new project from a template.
 *
 * When no command is given (or the first argument is a directory/path), defaults to "build"
 * for backward compatibility with the original build.js interface.
 *
 * Usage:
 *   mdoc [build] [options] <project-dir>
 *   mdoc validate [--dep-graph] <project-dir|config-path>
 *   mdoc init [--template report] <new-dir>
 */
"use strict";

const path = require("path");
const fs   = require("fs");
const { performance } = require("perf_hooks");

const { createLogger }   = require("./logger");
const { buildFromConfig } = require("./builder");
const { validate }       = require("./validator");

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const isTTY = Boolean(process.stdout.isTTY);
const C = {
  reset:  isTTY ? "\x1b[0m"  : "",
  bold:   isTTY ? "\x1b[1m"  : "",
  dim:    isTTY ? "\x1b[2m"  : "",
  green:  isTTY ? "\x1b[32m" : "",
  yellow: isTTY ? "\x1b[33m" : "",
  red:    isTTY ? "\x1b[31m" : "",
  cyan:   isTTY ? "\x1b[36m" : "",
  blue:   isTTY ? "\x1b[34m" : "",
  grey:   isTTY ? "\x1b[90m" : "",
};

function die(msg, code = 1) {
  process.stderr.write(`${C.red}Error:${C.reset} ${msg}\n`);
  process.exit(code);
}

function fmt(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

// ─── Argument parsers ─────────────────────────────────────────────────────────

function parseBuildArgs(args) {
  const opts = {
    help:       false,
    verbose:    false,
    quiet:      false,
    pdf:        false,
    pdfOnly:    false,
    out:        null,
    soffice:    null,
    projectDir: null,
    watch:      false,
    watchDebounce: 300,
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
      case "--watch-debounce":
        opts.watchDebounce = Number(args[++i]);
        if (!Number.isFinite(opts.watchDebounce)) die("--watch-debounce requires a number.");
        break;
      case "-o": case "--out":
        opts.out = args[++i];
        if (!opts.out) die(`${a} requires a path argument.`);
        break;
      case "--soffice":
        opts.soffice = args[++i];
        if (!opts.soffice) die("--soffice requires a path argument.");
        break;
      default:
        if (a.startsWith("-")) die(`Unknown option: ${a}\nRun with --help for usage.`);
        if (opts.projectDir !== null) die("Too many arguments — only one project directory expected.");
        opts.projectDir = a;
    }
  }
  return opts;
}

function parseValidateArgs(args) {
  const opts = { help: false, depGraph: false, target: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-h" || a === "--help")         opts.help     = true;
    else if (a === "--dep-graph")             opts.depGraph = true;
    else if (a.startsWith("-"))               die(`Unknown option: ${a}`);
    else if (opts.target !== null)            die("Too many arguments.");
    else                                      opts.target   = a;
  }
  return opts;
}

function parseInitArgs(args) {
  const opts = { help: false, template: "simple", target: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-h" || a === "--help")      opts.help    = true;
    else if (a === "-t" || a === "--template") {
      opts.template = args[++i] || "";
      if (!opts.template) die("--template requires a name (simple|report|thesis|manual).");
    } else if (a.startsWith("-"))          die(`Unknown option: ${a}`);
    else if (opts.target !== null)         die("Too many arguments.");
    else                                   opts.target  = a;
  }
  return opts;
}

// ─── HELP text ────────────────────────────────────────────────────────────────

function makeHelp(cmd) {
  if (cmd === "validate") return `
${C.bold}mdoc validate${C.reset} — Validate a project without building

${C.bold}Usage:${C.reset}
  mdoc validate [options] <project-dir|project.config.js>

${C.bold}Options:${C.reset}
  -h, --help        Show this help
      --dep-graph   Write a dependency graph to dependency.json

${C.bold}Exit codes:${C.reset}
  0 — No errors
  1 — Validation errors found
`.trimStart();

  if (cmd === "init") return `
${C.bold}mdoc init${C.reset} — Scaffold a new project

${C.bold}Usage:${C.reset}
  mdoc init [options] <new-dir>

${C.bold}Options:${C.reset}
  -h, --help                  Show this help
  -t, --template <name>       Template to use (default: simple)
      Templates: simple | report | thesis | manual

${C.bold}Example:${C.reset}
  mdoc init --template report ./my-report
`.trimStart();

  return `
${C.bold}mdoc${C.reset} — Markdown → DOCX/PDF document builder  v${getVersion()}

${C.bold}Usage:${C.reset}
  mdoc [build] [options] <project-dir>
  mdoc validate [--dep-graph] <project-dir>
  mdoc init [--template <name>] <new-dir>

${C.bold}Build options:${C.reset}
  -h, --help           Show this help and exit
  -v, --verbose        Show per-step timings
  -q, --quiet          Suppress all output except errors
  -p, --pdf            Convert DOCX to PDF after building (requires LibreOffice)
      --pdf-only       Convert existing DOCX to PDF without rebuilding
      --no-pdf         Skip PDF conversion
  -o, --out <path>     Override output path from project.config.js
      --soffice <path> Path to soffice binary (auto-detected by default)
      --watch          Watch project files and rebuild on changes
      --watch-debounce <ms>  Debounce delay (default: 300 ms)

${C.bold}Examples:${C.reset}
  mdoc projects/my-thesis
  mdoc -v --pdf projects/my-thesis
  mdoc validate projects/my-thesis
  mdoc init --template thesis ./projects/new-thesis
`.trimStart();
}

function getVersion() {
  try { return require("../package.json").version; } catch { return "?"; }
}

// ─── Build command ────────────────────────────────────────────────────────────

async function runBuild(args) {
  const opts = parseBuildArgs(args);
  if (opts.help) { process.stdout.write(makeHelp("build")); return; }

  if (!opts.projectDir) die("No project directory specified.\nRun with --help for usage.");

  const projectDir = path.resolve(opts.projectDir);
  const configPath = path.join(projectDir, "project.config.js");

  if (!fs.existsSync(projectDir)) die(`Project directory not found: ${projectDir}`);
  if (!fs.existsSync(configPath)) die(
    `No project.config.js found in: ${projectDir}\n` +
    `  Run "mdoc init ${opts.projectDir}" to create one.`
  );
  if (opts.pdfOnly && opts.watch) {
    die("--pdf-only cannot be used with --watch.");
  }

  const log = createLogger({ verbose: opts.verbose, quiet: opts.quiet });

  async function doBuild() {
    let rawConfig;
    try {
      delete require.cache[require.resolve(configPath)];
      rawConfig = require(configPath);
    } catch (err) {
      die(`Failed to load project.config.js: ${err.message}`);
    }
    rawConfig._dir = projectDir;
    if (opts.out) rawConfig.output = opts.out;

    if (opts.pdfOnly) {
      const existingDocx = path.resolve(projectDir, rawConfig.output || "");
      if (!rawConfig.output) {
        die("project.config.js must define output when using --pdf-only.");
      }
      if (!fs.existsSync(existingDocx)) {
        die(`DOCX not found for --pdf-only: ${existingDocx}`);
      }
      const { convertToPdf } = require("./pdf");
      log.info(`\n${C.bold}${C.blue}▶ ${rawConfig.name || path.basename(projectDir)}${C.reset}`);
      log.blank();
      log.step("Converting existing DOCX to PDF (LibreOffice)...");
      const tp = performance.now();
      const pdfResult = await convertToPdf(existingDocx, {
        sofficePath: opts.soffice,
        logger: log,
      });
      log.step(`PDF  → ${pdfResult}`, performance.now() - tp);
      return;
    }

    log.info(`\n${C.bold}${C.blue}▶ ${rawConfig.name || path.basename(projectDir)}${C.reset}`);
    log.blank();

    const t0 = performance.now();
    const result = await buildFromConfig(rawConfig, { logger: log });
    const elapsed = performance.now() - t0;

    log.blank();
    log.info(
      `${C.bold}${C.green}✔ Done${C.reset}  ` +
      `${result.outputPath}  ` +
      `${C.dim}(${fmt(result.byteLength)}, ${elapsed.toFixed(0)} ms)${C.reset}`
    );

    if (opts.pdf && !opts.pdfOnly) {
      const { convertToPdf } = require("./pdf");
      log.blank();
      log.step("Converting to PDF (LibreOffice)...");
      const tp = performance.now();
      const pdfResult = await convertToPdf(result.outputPath, {
        sofficePath: opts.soffice,
        logger: log,
      });
      log.step(`PDF  → ${pdfResult}`, performance.now() - tp);
    }
  }

  if (opts.watch) {
    const chokidar = (() => { try { return require("chokidar"); } catch { die("chokidar not installed. Run: npm install chokidar"); } })();
    let debounce;
    const rebuild = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => doBuild().catch(err => log.error(err.message)), opts.watchDebounce);
    };
    await doBuild().catch(err => { log.error(err.message); });
    log.blank();
    log.info(`${C.dim}Watching for changes… (Ctrl+C to stop)${C.reset}`);
    chokidar.watch(projectDir, { ignoreInitial: true, ignored: /(node_modules|\.git)/ })
      .on("all", rebuild);
  } else {
    await doBuild().catch(err => { die(err.message); });
  }
}

// ─── Validate command ─────────────────────────────────────────────────────────

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

  warnings.forEach(w => process.stderr.write(`${C.yellow}⚠${C.reset}  [${w.code}] ${w.message}${w.file ? `\n     ${path.relative(process.cwd(), w.file)}${w.line ? `:${w.line}` : ""}` : ""}\n`));
  errors.forEach(e =>   process.stderr.write(`${C.red}✖${C.reset}  [${e.code}] ${e.message}${e.file ? `\n     ${path.relative(process.cwd(), e.file)}${e.line ? `:${e.line}` : ""}` : ""}\n`));

  if (valid) {
    process.stdout.write(`${C.green}✔${C.reset}  Validation passed${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.\n`);
    process.exit(0);
  } else {
    process.stdout.write(`${C.red}✖${C.reset}  Validation failed with ${errors.length} error(s).\n`);
    process.exit(1);
  }
}

// ─── Init command ─────────────────────────────────────────────────────────────

async function runInit(args) {
  const opts = parseInitArgs(args);
  if (opts.help) { process.stdout.write(makeHelp("init")); return; }

  if (!opts.target) die("No destination directory specified.\nUsage: mdoc init [--template <name>] <dir>");

  const templates = ["simple", "report", "thesis", "manual"];
  if (!templates.includes(opts.template)) {
    die(`Unknown template "${opts.template}". Available: ${templates.join(", ")}`);
  }

  const templateDir = path.join(__dirname, "templates", opts.template);
  if (!fs.existsSync(templateDir)) {
    die(`Template "${opts.template}" not found. Expected: ${templateDir}`);
  }

  const targetDir = path.resolve(opts.target);
  if (fs.existsSync(targetDir)) {
    const files = fs.readdirSync(targetDir);
    if (files.length > 0) die(`Directory already exists and is not empty: ${targetDir}`);
  } else {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Copy template files recursively
  function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath  = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) copyDir(srcPath, destPath);
      else                    fs.copyFileSync(srcPath, destPath);
    }
  }

  copyDir(templateDir, targetDir);

  process.stdout.write(
    `${C.green}✔${C.reset}  Created project from template "${opts.template}":\n` +
    `   ${targetDir}\n\n` +
    `${C.bold}Next steps:${C.reset}\n` +
    `   cd ${opts.target}\n` +
    `   mdoc build .\n`
  );
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

function run(argv) {
  const args = argv.slice(2);

  const COMMANDS = ["build", "validate", "init", "help", "--help", "-h", "--version", "version"];

  let cmd = "build";
  let rest = args;

  if (args.length > 0 && COMMANDS.includes(args[0])) {
    cmd  = args[0];
    rest = args.slice(1);
  }

  if (cmd === "--version" || cmd === "version") {
    process.stdout.write(`mdoc v${getVersion()}\n`);
    return;
  }

  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(makeHelp("main"));
    return;
  }

  const handlers = { build: runBuild, validate: runValidate, init: runInit };
  const handler = handlers[cmd];
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
