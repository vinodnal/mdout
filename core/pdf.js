// core/pdf.js — backward-compat shim. Delegates to src/pdf.js.
module.exports = require("../src/pdf");
// ─── Original implementation below (not executed) ────────────────────────────
/** @deprecated Use require('mdoc/src/pdf') directly.
 * core/pdf.js
 * Converts a DOCX file to PDF using LibreOffice (soffice).
 *
 * Requires LibreOffice to be installed and `soffice` on PATH.
 * On Windows, LibreOffice is typically at:
 *   C:\Program Files\LibreOffice\program\soffice.exe
 */

"use strict";

const { execFileSync } = require("child_process");
const path             = require("fs").existsSync;
const fs               = require("fs");

const SOFFICE_CANDIDATES = [
  "soffice",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "/usr/bin/soffice",
  "/usr/lib/libreoffice/program/soffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
];

function findSoffice(override) {
  if (override) return override;
  for (const candidate of SOFFICE_CANDIDATES) {
    try {
      // For bare commands (no path separator) let the shell resolve it
      if (!candidate.includes("/") && !candidate.includes("\\")) {
        execFileSync(candidate, ["--version"], { stdio: "pipe", timeout: 5000 });
        return candidate;
      }
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* not found */ }
  }
  return null;
}

/**
 * Convert a DOCX file to PDF using LibreOffice.
 *
 * @param {string} docxPath     Absolute path to the source .docx file.
 * @param {object} [opts]
 * @param {string} [opts.outDir]      Output directory (default: same as docxPath).
 * @param {string} [opts.sofficePath] Override path to soffice executable.
 * @param {number} [opts.timeout]     Conversion timeout in ms (default: 90000).
 * @param {object} [opts.logger]      Logger with { info, warn, error, debug } methods.
 * @returns {string}  Absolute path to the generated .pdf file.
 */
function convertToPdf(docxPath, opts = {}) {
  const log    = opts.logger || { info: () => {}, warn: console.warn, error: console.error, debug: () => {} };
  const outDir = opts.outDir || fs.realpathSync(require("path").dirname(docxPath));
  const timeo  = opts.timeout || 90_000;

  const soffice = findSoffice(opts.sofficePath);
  if (!soffice) {
    throw new Error(
      "LibreOffice not found. Install it and ensure `soffice` is on PATH, " +
      "or pass opts.sofficePath with the full path to the soffice executable."
    );
  }

  log.debug(`  soffice: ${soffice}`);
  log.debug(`  outDir:  ${outDir}`);

  execFileSync(
    soffice,
    ["--headless", "--convert-to", "pdf", "--outdir", outDir, docxPath],
    { timeout: timeo, stdio: "pipe" }
  );

  const pdfPath = require("path").join(outDir, require("path").basename(docxPath, ".docx") + ".pdf");
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`LibreOffice ran but no PDF was created at: ${pdfPath}`);
  }
  return pdfPath;
}

module.exports = { convertToPdf, findSoffice };
