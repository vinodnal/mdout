/**
 * src/cli/export.js
 * Implementation of the "mdoc export" command.
 *
 * Sub-commands / formats:
 *   mdoc export images  [--pages 1,3-5] [--format png|jpg] [--dpi N] <project-dir|pdf>
 *   mdoc export md      [--no-cover]    [--out path.md]              <project-dir>
 *
 * When no sub-command is given the first positional argument is the format.
 */
"use strict";

const path = require("path");
const fs   = require("fs");
const { performance } = require("perf_hooks");

const { parseExportArgs }       = require("./args");
const { makeHelp }              = require("./help");
const { C, die, fmt }           = require("./utils");
const { createLogger }          = require("../logger");
const { buildFromConfig }       = require("../builder");
const { convertToPdf }          = require("../pdf");
const { exportPdfToImages }     = require("../exporter/images");
const { flattenToMarkdown }     = require("../exporter/markdown");

// ─── Export command ───────────────────────────────────────────────────────────

/**
 * @param {string[]} args  Argument list after the "export" command word.
 */
async function runExport(args) {
  const startedAt = performance.now();
  const opts = parseExportArgs(args);
  if (opts.help) { process.stdout.write(makeHelp("export")); return; }

  if (!opts.projectDir) die("No project directory specified.\nRun 'mdoc export --help' for usage.");

  const log = createLogger({ verbose: opts.verbose, quiet: opts.quiet });

  // ── Resolve project config ────────────────────────────────────────────────
  const target     = path.resolve(opts.projectDir);
  const configPath = fs.existsSync(path.join(target, "project.config.js"))
    ? path.join(target, "project.config.js")
    : target.endsWith(".js") && fs.existsSync(target) ? target : null;

  // Direct PDF path for images-only mode
  const isPdfInput = target.endsWith(".pdf") && fs.existsSync(target);

  if (!isPdfInput && !configPath) {
    die(`No project.config.js found in: ${target}`);
  }

  if (opts.out && opts.formats.length > 1) {
    die("--out is ambiguous when exporting multiple formats. Export one format at a time with --out.");
  }

  const summary = {
    formats: [],
    images: null,
    markdown: null,
    elapsedMs: 0,
  };

  // ── Dispatch by format ────────────────────────────────────────────────────

  for (const fmt of opts.formats) {
    switch (fmt) {
      case "images": {
        const images = await exportImages({ opts, log, configPath, target, isPdfInput, imageFormat: opts.imageFormat || "png" });
        summary.formats.push("images");
        summary.images = images;
        break;
      }
      case "md":
      case "markdown": {
        const markdown = await exportMarkdown({ opts, log, configPath });
        summary.formats.push("md");
        summary.markdown = markdown;
        break;
      }
      default:
        die(`Unknown export format: "${fmt}". Supported: images, md`);
    }
  }

  summary.elapsedMs = Math.round(performance.now() - startedAt);

  if (opts.jsonOutput) {
    const jsonStr = JSON.stringify(summary, null, 2);
    if (opts.jsonOutput === "-") process.stdout.write(jsonStr + "\n");
    else fs.writeFileSync(path.resolve(opts.jsonOutput), jsonStr, "utf-8");
  }
}

// ─── Images export ────────────────────────────────────────────────────────────

async function exportImages({ opts, log, configPath, target, isPdfInput, imageFormat }) {
  let pdfPath;

  if (isPdfInput) {
    // User passed a PDF directly — skip build
    pdfPath = target;
  } else {
    // Load config and build DOCX, then convert to PDF
    let rawConfig;
    try {
      delete require.cache[require.resolve(configPath)];
      rawConfig = require(configPath);
    } catch (err) { die(`Failed to load project.config.js: ${err.message}`); }

    rawConfig._dir = path.dirname(configPath);
    if (opts.vars && Object.keys(opts.vars).length) {
      rawConfig.vars = Object.assign({}, rawConfig.vars || {}, opts.vars);
    }

    if (opts.skipBuild) {
      // Use existing DOCX/PDF
      const existingDocx = rawConfig.output
        ? path.resolve(rawConfig._dir, rawConfig.output)
        : null;
      if (!existingDocx || !fs.existsSync(existingDocx)) {
        die("--no-build requires an existing DOCX output. Run without --no-build first.");
      }
      log.info(`\n${C.bold}${C.blue}▶ Converting existing DOCX to PDF…${C.reset}`);
      pdfPath = await convertToPdf(existingDocx, { sofficePath: opts.soffice, logger: log });
    } else {
      log.info(`\n${C.bold}${C.blue}▶ Building ${rawConfig.name || path.basename(rawConfig._dir)}…${C.reset}`);
      const t0     = performance.now();
      const result = await buildFromConfig(rawConfig, { logger: log });
      log.step(`DOCX built in ${(performance.now() - t0).toFixed(0)} ms`);

      log.step("Converting to PDF…");
      pdfPath = await convertToPdf(result.outputPath, { sofficePath: opts.soffice, logger: log });
    }
  }

  // ── Convert PDF pages → images ─────────────────────────────────────────
  const outDir = opts.out
    ? path.resolve(opts.out)
    : path.join(path.dirname(pdfPath), "export", "images");

  const prefix = opts.prefix || path.basename(pdfPath, ".pdf");

  log.blank();
  log.info(`${C.bold}${C.blue}▶ Exporting pages as ${imageFormat.toUpperCase()}…${C.reset}`);

  const t1 = performance.now();
  const pages = await exportPdfToImages(pdfPath, {
    outDir,
    prefix,
    format:    imageFormat,
    dpi:       opts.dpi || 150,
    pageSpec:  opts.pages || null,
    pdftoppm:  opts.pdftoppm,
    gs:        opts.gs,
    logger:    log,
  });

  log.blank();
  log.info(
    `${C.bold}${C.green}✔ Exported ${pages.length} page(s)${C.reset}  ` +
    `→ ${outDir}  ${C.dim}(${(performance.now() - t1).toFixed(0)} ms)${C.reset}`
  );

  return { format: imageFormat, pages, outDir };
}

// ─── Markdown export ─────────────────────────────────────────────────────────

async function exportMarkdown({ opts, log, configPath }) {
  log.info(`\n${C.bold}${C.blue}▶ Flattening project to Markdown…${C.reset}`);

  const t0     = performance.now();
  const result = await flattenToMarkdown(configPath, {
    out:          opts.out  ? path.resolve(opts.out) : undefined,
    includeCover: !opts.noCover,
    vars:         opts.vars,
    logger:       log,
  });

  log.blank();
  log.info(
    `${C.bold}${C.green}✔ Done${C.reset}  ${result.outputPath}  ` +
    `${C.dim}(${(result.byteLength / 1024).toFixed(1)} KB, ${(performance.now() - t0).toFixed(0)} ms)${C.reset}`
  );

  return result;
}

module.exports = { runExport };
