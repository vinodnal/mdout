/**
 * src/cli/build.js
 * Implementation of the "markfi build" command.
 *
 * New over original:
 *   --var key=value   Inject/override project.config.js vars at build time.
 *   --json [path]     Write the build result object as JSON after a successful build.
 */
"use strict";

const path = require("path");
const fs   = require("fs");
const { performance } = require("perf_hooks");

const { createLogger }    = require("../logger");
const { buildFromConfig } = require("../builder");
const { parseBuildArgs }  = require("./args");
const { makeHelp }        = require("./help");
const { C, die, fmt }     = require("./utils");

// ─── Build command ────────────────────────────────────────────────────────────

/**
 * Run the build command.
 * @param {string[]} args  Argument list after the "build" command word.
 */
async function runBuild(args) {
  const opts = parseBuildArgs(args);
  if (opts.help) { process.stdout.write(makeHelp("build")); return; }

  if (!opts.projectDir) die("No project directory specified.\nRun with --help for usage.");

  const projectDir = path.resolve(opts.projectDir);
  const configPath = path.join(projectDir, "project.config.js");

  if (!fs.existsSync(projectDir)) die(`Project directory not found: ${projectDir}`);
  if (!fs.existsSync(configPath)) die(
    `No project.config.js found in: ${projectDir}\n` +
    `  Run "markfi init ${opts.projectDir}" to create one.`
  );
  if (opts.pdfOnly && opts.watch) die("--pdf-only cannot be used with --watch.");

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

    // CLI overrides
    if (opts.out) rawConfig.output = opts.out;
    if (Object.keys(opts.vars).length) {
      rawConfig.vars = Object.assign({}, rawConfig.vars || {}, opts.vars);
    }

    // ── pdf-only ────────────────────────────────────────────────────────────
    if (opts.pdfOnly) {
      if (!rawConfig.output) die("project.config.js must define output when using --pdf-only.");
      const existingDocx = path.resolve(projectDir, rawConfig.output);
      if (!fs.existsSync(existingDocx)) die(`DOCX not found for --pdf-only: ${existingDocx}`);

      const { convertToPdf } = require("../pdf");
      log.info(`\n${C.bold}${C.blue}▶ ${rawConfig.name || path.basename(projectDir)}${C.reset}`);
      log.blank();
      log.step("Converting existing DOCX to PDF...");
      const tp = performance.now();
      const pdfResult = await convertToPdf(existingDocx, {
        sofficePath: opts.soffice,
        logger: log,
        pdfEngine: opts.pdfEngine,
        disableWordCom: opts.watch && opts.pdfEngine !== "word",
      });
      log.step(`PDF  → ${pdfResult}`, performance.now() - tp);
      return;
    }

    // ── full build ───────────────────────────────────────────────────────────
    log.info(`\n${C.bold}${C.blue}▶ ${rawConfig.name || path.basename(projectDir)}${C.reset}`);
    log.blank();

    const t0     = performance.now();
    const result = await buildFromConfig(rawConfig, { logger: log });
    const elapsed = performance.now() - t0;

    log.blank();
    log.info(
      `${C.bold}${C.green}✔ Done${C.reset}  ` +
      `${result.outputPath}  ` +
      `${C.dim}(${fmt(result.byteLength)}, ${elapsed.toFixed(0)} ms)${C.reset}`
    );

    // ── JSON output ──────────────────────────────────────────────────────────
    if (opts.jsonOutput) {
      const jsonStr = JSON.stringify(
        { ...result, elapsedMs: Math.round(elapsed), artifactPaths: [...result.artifactPaths] },
        null, 2
      );
      if (opts.jsonOutput === "-") {
        process.stdout.write(jsonStr + "\n");
      } else {
        fs.writeFileSync(path.resolve(opts.jsonOutput), jsonStr, "utf-8");
        log.step(`JSON → ${path.resolve(opts.jsonOutput)}`);
      }
    }

    // ── PDF conversion ───────────────────────────────────────────────────────
    if (opts.pdf) {
      const { convertToPdf } = require("../pdf");
      log.blank();
      log.step("Converting to PDF...");
      const tp = performance.now();
      const pdfResult = await convertToPdf(result.outputPath, {
        sofficePath: opts.soffice,
        logger: log,
        pdfEngine: opts.pdfEngine,
        disableWordCom: opts.watch && opts.pdfEngine !== "word",
      });
      log.step(`PDF  → ${pdfResult}`, performance.now() - tp);
    }
  }

  // ── Watch mode ───────────────────────────────────────────────────────────
  if (opts.watch) {
    let chokidar;
    try { chokidar = require("chokidar"); }
    catch { die("chokidar not installed. Run: npm install chokidar"); }

    let debounce;
    const rebuild = (event, changedPath) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (changedPath) log.info(`${C.dim}  Changed: ${path.relative(projectDir, changedPath)}${C.reset}`);
        doBuild().catch(err => log.error(err.message));
      }, opts.watchDebounce);
    };

    await doBuild().catch(err => log.error(err.message));
    log.blank();
    log.info(`${C.dim}Watching for changes… (Ctrl+C to stop)${C.reset}`);
    chokidar
      .watch(projectDir, { ignoreInitial: true, ignored: /(node_modules|\.git)/ })
      .on("all", rebuild);
  } else {
    try {
      await doBuild();
    } catch (err) {
      die(err.message);
    } finally {
      log.summary();
    }
  }
}

module.exports = { runBuild };
