/**
 * src/index.js
 * Public programmatic API for mdoc.
 *
 * Usage:
 *   const mdoc = require('mdoc');
 *   await mdoc.build('./my-project/project.config.js', { verbose: true });
 *
 *   // Or with a raw config object:
 *   const cfg = require('./project.config.js');
 *   cfg._dir = __dirname;
 *   await mdoc.buildFromConfig(cfg);
 *
 *   // Validate only:
 *   const { valid, errors } = await mdoc.validate('./project.config.js');
 *
 *   // Use the renderer directly:
 *   const R = mdoc.createRenderer(theme, pageConfig, vars, logger);
 */
"use strict";

const path = require("path");

const { buildFromConfig }  = require("./builder/index");
const { validate }         = require("./validator");
const { createRenderer }   = require("./renderer");
const { parseMD }          = require("./parser/index");
const { createImporter }   = require("./importer");
const { createLogger, makeNullLogger, CODES } = require("./logger");
const { validateConfig }   = require("./schema");
const { exportPdfToImages } = require("./exporter/images");
const { flattenToMarkdown } = require("./exporter/markdown");
const { parsePageSpec, findExecutable } = require("./exporter/pages");

/**
 * Build a project from a config file path.
 *
 * @param {string} configPath  Absolute or relative path to project.config.js.
 * @param {object} [opts]
 * @param {boolean} [opts.verbose]    Print build steps to stdout.
 * @param {string}  [opts.logLevel]   "info" | "warn" | "error" | "silent". Default "info".
 * @param {boolean} [opts.pdf]        Also convert to PDF via LibreOffice after build.
 * @param {string}  [opts.sofficePath] Override soffice binary path for PDF conversion.
 * @param {("auto"|"word"|"libreoffice")} [opts.pdfEngine] Force PDF engine selection.
 * @returns {Promise<object>} Build result: { outputPath, byteLength, sectionCount, ... }
 */
async function build(configPath, opts = {}) {
  const absConfig = path.resolve(configPath);
  const configDir = path.dirname(absConfig);

  const log = createLogger({ verbose: opts.verbose, level: opts.logLevel || "info" });

  let rawConfig;
  try {
    rawConfig = require(absConfig);
  } catch (err) {
    throw new Error(`Cannot load config at "${absConfig}": ${err.message}`);
  }
  rawConfig._dir = configDir;

  const result = await buildFromConfig(rawConfig, { logger: log, ...opts });

  if (opts.pdf) {
    const { convertToPdf } = require("./pdf");
    log.step("Converting to PDF...");
    await convertToPdf(result.outputPath, {
      outDir:      path.dirname(result.outputPath),
      sofficePath: opts.sofficePath,
      pdfEngine:   opts.pdfEngine,
      logger:      log,
    });
  }

  return result;
}

module.exports = {
  // High-level
  build,
  buildFromConfig,
  validate,
  // Low-level / composable
  createRenderer,
  parseMD,
  createImporter,
  exportPdfToImages,
  flattenToMarkdown,
  parsePageSpec,
  findExecutable,
  // Config
  validateConfig,
  // Logging
  createLogger,
  makeNullLogger,
  CODES,
};
