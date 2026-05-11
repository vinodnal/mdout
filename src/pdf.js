/**
 * src/pdf.js
 * Converts a DOCX file to PDF using LibreOffice (soffice).
 * On Windows, it first tries headless Microsoft Word COM automation to
 * improve dynamic field resolution (e.g. section page totals), then falls
 * back to LibreOffice when Word is unavailable.
 *
 * Requires LibreOffice to be installed and `soffice` accessible.
 */
"use strict";

const { execFileSync } = require("child_process");
const fs               = require("fs");
const path             = require("path");

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
      if (!candidate.includes("/") && !candidate.includes("\\")) {
        execFileSync(candidate, ["--version"], { stdio: "pipe", timeout: 5000 });
        return candidate;
      }
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* not found */ }
  }
  return null;
}

function buildWordPdfScript(docxPath, pdfPath) {
  const esc = (v) => String(v).replace(/'/g, "''");
  const docx = esc(docxPath);
  const pdf  = esc(pdfPath);
  return [
    "$ErrorActionPreference = 'Stop'",
    "$word = $null",
    "$doc  = $null",
    "try {",
    "  $word = New-Object -ComObject Word.Application",
    "  $word.Visible = $false",
    "  $word.DisplayAlerts = 0",
    `  $doc = $word.Documents.Open('${docx}', $false, $true)`,
    "  foreach ($story in $doc.StoryRanges) {",
    "    try { $story.Fields.Update() | Out-Null } catch {}",
    "  }",
    "  try { $doc.Fields.Update() | Out-Null } catch {}",
    `  $doc.SaveAs([ref]'${pdf}', [ref]17)`,
    "} finally {",
    "  if ($doc  -ne $null) { try { $doc.Close([ref]$false) } catch {} }",
    "  if ($word -ne $null) { try { $word.Quit() } catch {} }",
    "}",
  ].join("; ");
}

function convertToPdfWithWord(docxPath, opts = {}) {
  const log    = opts.logger || { info: () => {}, warn: console.warn, error: console.error, debug: () => {} };
  const outDir = opts.outDir || path.dirname(fs.realpathSync(docxPath));
  const timeo  = opts.timeout || 90_000;
  const pdfPath = path.join(outDir, `${path.basename(docxPath, path.extname(docxPath))}.pdf`);
  const script = buildWordPdfScript(docxPath, pdfPath);

  execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { timeout: timeo, stdio: "pipe" }
  );

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Word conversion completed but PDF not found at: ${pdfPath}`);
  }
  log.debug("PDF conversion engine: Microsoft Word COM");
  return pdfPath;
}

/**
 * Convert a DOCX file to PDF using LibreOffice.
 *
 * @param {string} docxPath          Absolute path to the source .docx file.
 * @param {object} [opts]
 * @param {string} [opts.outDir]     Output directory (default: same dir as docxPath).
 * @param {string} [opts.sofficePath] Override path to soffice.
 * @param {number} [opts.timeout]    Timeout in ms (default: 90000).
 * @param {object} [opts.logger]     Logger with { info, warn, error, debug } methods.
 * @returns {string}  Absolute path to the generated .pdf file.
 */
function convertToPdf(docxPath, opts = {}) {
  const log    = opts.logger || { info: () => {}, warn: console.warn, error: console.error, debug: () => {} };
  const outDir = opts.outDir || path.dirname(fs.realpathSync(docxPath));
  const timeo  = opts.timeout || 90_000;

  // On Windows, try headless Word conversion first for better field resolution
  // (e.g., SECTIONPAGES), then fall back to LibreOffice.
  if (process.platform === "win32") {
    try {
      return convertToPdfWithWord(docxPath, { outDir, timeout: timeo, logger: log });
    } catch (err) {
      log.debug(`Word conversion unavailable, falling back to LibreOffice: ${err.message}`);
    }
  }

  const soffice = findSoffice(opts.sofficePath);
  if (!soffice) {
    throw new Error(
      "LibreOffice not found.\n" +
      "  Install it and ensure `soffice` is on PATH, or pass --soffice <path>.\n" +
      "  Download: https://www.libreoffice.org/download/"
    );
  }

  log.debug(`  soffice: ${soffice}`);
  log.debug(`  outDir:  ${outDir}`);

  execFileSync(
    soffice,
    ["--headless", "--convert-to", "pdf", "--outdir", outDir, docxPath],
    { timeout: timeo, stdio: "pipe" }
  );

  const pdfPath = path.join(outDir, `${path.basename(docxPath, path.extname(docxPath))}.pdf`);
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`LibreOffice ran successfully but PDF not found at: ${pdfPath}`);
  }
  return pdfPath;
}

module.exports = { convertToPdf, findSoffice };
