/**
 * src/exporter/images.js
 * Convert a PDF file into per-page images (PNG or JPEG).
 *
 * Strategy (tried in order):
 *   1. pdftoppm  (poppler-utils) — best quality, page-range support, widely available
 *   2. gs        (Ghostscript)   — universal fallback, slightly slower
 *
 * Both tools must be installed by the user; this module locates them automatically.
 *
 * Returns an array of { page, path } objects for every exported page.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { parsePageSpec, findExecutable } = require("./pages");

// ─── pdftoppm ─────────────────────────────────────────────────────────────────

/**
 * Get the total page count of a PDF using pdftoppm / pdfinfo.
 * Falls back to a large sentinel so callers can still use "all".
 *
 * @param {string} pdfPath
 * @param {string} pdfinfoExe  Absolute path to pdfinfo (or null).
 * @returns {number}
 */
function getPdfPageCount(pdfPath, pdfinfoExe) {
  if (!pdfinfoExe) return 9999;
  try {
    const out = execFileSync(pdfinfoExe, [pdfPath], { encoding: "utf-8", timeout: 15000 });
    const m = out.match(/^Pages:\s*(\d+)/m);
    return m ? parseInt(m[1], 10) : 9999;
  } catch { return 9999; }
}

/**
 * Export PDF pages to images using pdftoppm.
 *
 * @param {object} opts
 * @param {string}   opts.pdfPath     Absolute path to the source PDF.
 * @param {string}   opts.outDir      Output directory (created if needed).
 * @param {string}   opts.prefix      File prefix for output images.
 * @param {string}   opts.format      "png" | "jpg"  (default: "png")
 * @param {number}   opts.dpi         Resolution in DPI (default: 150)
 * @param {number[]} opts.pages       Sorted 1-based page numbers to export.
 * @param {string}   opts.exe         Absolute path to pdftoppm.
 * @param {object}   [opts.logger]
 * @returns {{ page: number, path: string }[]}
 */
function exportWithPdftoppm({ pdfPath, outDir, prefix, format, dpi, pages, exe, logger }) {
  fs.mkdirSync(outDir, { recursive: true });

  const results = [];

  // pdftoppm supports exporting contiguous ranges efficiently.
  // For non-contiguous selections, we make one call per segment.
  const segments = toSegments(pages);

  for (const [first, last] of segments) {
    const args = [
      `-r`, String(dpi),
      `-f`, String(first),
      `-l`, String(last),
      format === "jpg" ? `-jpeg` : `-png`,
      pdfPath,
      path.join(outDir, prefix),
    ];

    if (logger) logger.step(`  pdftoppm pages ${first}–${last}…`);
    execFileSync(exe, args, { timeout: 120000 });
  }

  // Collect generated files
  const ext = format === "jpg" ? ".jpg" : ".png";
  for (const p of pages) {
    // pdftoppm zero-pads based on total pages count — find the actual file
    const candidates = fs.readdirSync(outDir)
      .filter(f => f.startsWith(prefix + "-") && f.endsWith(ext))
      .map(f => ({ file: f, num: parseInt(f.replace(/^.*-(\d+)\..*$/, "$1"), 10) }))
      .filter(({ num }) => num === p)
      .map(({ file }) => path.join(outDir, file));

    if (candidates.length > 0) results.push({ page: p, path: candidates[0] });
  }

  return results;
}

// ─── Ghostscript ─────────────────────────────────────────────────────────────

/**
 * Export PDF pages to images using Ghostscript.
 *
 * @param {object} opts
 * @param {string}   opts.pdfPath
 * @param {string}   opts.outDir
 * @param {string}   opts.prefix
 * @param {string}   opts.format      "png" | "jpg"
 * @param {number}   opts.dpi
 * @param {number[]} opts.pages
 * @param {string}   opts.exe         Absolute path to gs/gswin64c/gswin32c.
 * @param {object}   [opts.logger]
 * @returns {{ page: number, path: string }[]}
 */
function exportWithGhostscript({ pdfPath, outDir, prefix, format, dpi, pages, exe, logger }) {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  const device  = format === "jpg" ? "jpeg" : "png16m";
  const ext     = format === "jpg" ? ".jpg" : ".png";

  for (const page of pages) {
    const outFile = path.join(outDir, `${prefix}-${String(page).padStart(4, "0")}${ext}`);
    const args = [
      `-dNOPAUSE`, `-dBATCH`, `-dSAFER`,
      `-sDEVICE=${device}`,
      `-r${dpi}`,
      `-dFirstPage=${page}`,
      `-dLastPage=${page}`,
      `-sOutputFile=${outFile}`,
      pdfPath,
    ];
    if (logger) logger.step(`  gs page ${page}…`);
    execFileSync(exe, args, { timeout: 60000 });
    if (fs.existsSync(outFile)) results.push({ page, path: outFile });
  }

  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Export PDF pages to images.
 *
 * @param {string}  pdfPath     Absolute path to the source PDF.
 * @param {object}  opts
 * @param {string}  [opts.outDir]     Output directory (default: same dir as PDF).
 * @param {string}  [opts.prefix]     File name prefix (default: PDF basename without ext).
 * @param {string}  [opts.format]     "png" | "jpg" (default: "png").
 * @param {number}  [opts.dpi]        DPI (default: 150).
 * @param {string}  [opts.pageSpec]   Page selection spec (default: "all").
 * @param {string}  [opts.pdftoppm]   Override pdftoppm path.
 * @param {string}  [opts.gs]         Override ghostscript path.
 * @param {object}  [opts.logger]
 * @returns {Promise<{ page: number, path: string }[]>}
 */
async function exportPdfToImages(pdfPath, opts = {}) {
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);

  const outDir  = path.resolve(opts.outDir  || path.dirname(pdfPath));
  const prefix  = opts.prefix  || path.basename(pdfPath, ".pdf");
  const format  = (opts.format || "png").toLowerCase();
  const dpi     = opts.dpi    || 150;
  const logger  = opts.logger || null;

  if (!["png", "jpg"].includes(format)) throw new Error(`Unsupported image format: ${format}. Use png or jpg.`);

  // Locate tools
  const pdftoppmExe = opts.pdftoppm || findExecutable(["pdftoppm"]);
  const pdfinfoExe  = findExecutable(["pdfinfo"]);
  const gsExe       = opts.gs       || findExecutable([
    "gswin64c", "gswin32c", "gs",
    "C:\\Program Files\\gs\\gs10.03.1\\bin\\gswin64c.exe",
    "C:\\Program Files\\gs\\gs10.02.1\\bin\\gswin64c.exe",
  ]);

  if (!pdftoppmExe && !gsExe) {
    throw new Error(
      "No PDF-to-image tool found.\n" +
      "  Install poppler-utils (pdftoppm) or Ghostscript (gs/gswin64c).\n" +
      "  Windows: https://github.com/oschwartz10612/poppler-windows/releases\n" +
      "           https://www.ghostscript.com/releases/gsdnld.html"
    );
  }

  // Determine total pages and resolve page spec
  const totalPages  = getPdfPageCount(pdfPath, pdfinfoExe);
  const pages       = parsePageSpec(opts.pageSpec || null, totalPages);

  if (pages.length === 0) throw new Error("No pages selected. Check your --pages argument.");

  if (logger) logger.info(`Exporting ${pages.length} page(s) as ${format.toUpperCase()} @ ${dpi} DPI → ${outDir}`);

  // Use pdftoppm when available (faster for bulk exports)
  if (pdftoppmExe) {
    return exportWithPdftoppm({ pdfPath, outDir, prefix, format, dpi, pages, exe: pdftoppmExe, logger });
  }

  return exportWithGhostscript({ pdfPath, outDir, prefix, format, dpi, pages, exe: gsExe, logger });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert sorted page numbers to contiguous segments [[first,last], …]. */
function toSegments(pages) {
  if (!pages.length) return [];
  const segments = [];
  let start = pages[0];
  let prev  = pages[0];
  for (let i = 1; i < pages.length; i++) {
    if (pages[i] === prev + 1) { prev = pages[i]; }
    else { segments.push([start, prev]); start = prev = pages[i]; }
  }
  segments.push([start, prev]);
  return segments;
}

module.exports = { exportPdfToImages };
