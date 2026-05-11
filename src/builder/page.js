/**
 * src/builder/page.js
 * Page size and margin utilities for DOCX section properties.
 *
 * Units: DXA (Device-independent pixels at 1440 per inch; 1 mm ≈ 56.69 DXA).
 * Page numbers: uses docx NumberFormat constants mapped from config strings.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { AlignmentType, NumberFormat } = require("docx");
const { retrySync } = require("../utils");

// ─── Constants ────────────────────────────────────────────────────────────────

/** Standard page sizes in DXA units. */
const PAGE_SIZES_DXA = {
  A4:     { width: 11906, height: 16838 },
  Letter: { width: 12240, height: 15840 },
  A3:     { width: 16838, height: 23811 },
};

/** Maps config page number format strings to docx NumberFormat enum values. */
const PAGE_FORMAT_MAP = {
  decimal:     NumberFormat.DECIMAL,
  upperRoman:  NumberFormat.UPPER_ROMAN,
  lowerRoman:  NumberFormat.LOWER_ROMAN,
  upperLetter: NumberFormat.UPPER_LETTER,
  lowerLetter: NumberFormat.LOWER_LETTER,
};

/** Maps config alignment strings to docx AlignmentType enum values. */
const ALIGN_MAP = {
  left:      AlignmentType.LEFT,
  center:    AlignmentType.CENTER,
  right:     AlignmentType.RIGHT,
  justify:   AlignmentType.JUSTIFIED,
  justified: AlignmentType.JUSTIFIED,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert millimetres to DXA units. */
function mmToDXA(mm) {
  return Math.round(mm * 56.69);
}

/**
 * Read a text file with retry-on-transient-error.
 * @param {string} filePath
 * @returns {string}
 */
function readTextFile(filePath) {
  return retrySync(() => fs.readFileSync(filePath, "utf-8"));
}

/**
 * Write a buffer to disk atomically (write to temp, rename).
 * Creates the parent directory if needed.
 * @param {string} filePath
 * @param {Buffer} buffer
 */
function writeFileAtomic(filePath, buffer) {
  const dir      = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, buffer);
  try {
    retrySync(() => {
      try { fs.rmSync(filePath, { force: true }); } catch (err) { if (err.code !== "ENOENT") throw err; }
      fs.renameSync(tempPath, filePath);
    });
  } catch (err) {
    try { if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true }); } catch { /* ignore */ }
    throw err;
  }
}

// ─── Page config ─────────────────────────────────────────────────────────────

/**
 * Compute page dimensions and margins in DXA from a config `page` object.
 * @param {object} page         config.page
 * @param {string} orientation  "portrait" | "landscape"
 * @returns {{ size, margin, contentWidth }}
 */
function computePageConfig(page, orientation = "portrait") {
  const rawSize = page.size;
  let size = typeof rawSize === "string"
    ? PAGE_SIZES_DXA[rawSize] || PAGE_SIZES_DXA.A4
    : { width: mmToDXA(rawSize.width), height: mmToDXA(rawSize.height) };

  if (orientation === "landscape" && size.width < size.height) {
    size = { width: size.height, height: size.width };
  }

  const rawMarg = page.margins;
  const margin  = typeof rawMarg === "number"
    ? { top: mmToDXA(rawMarg), right: mmToDXA(rawMarg), bottom: mmToDXA(rawMarg), left: mmToDXA(rawMarg) }
    : { top: mmToDXA(rawMarg.top), right: mmToDXA(rawMarg.right), bottom: mmToDXA(rawMarg.bottom), left: mmToDXA(rawMarg.left) };

  return { size, margin, contentWidth: size.width - margin.left - margin.right };
}

/**
 * Apply a section-level margin override on top of a base margin.
 * @param {object}        baseMargin  DXA margin object { top, right, bottom, left }
 * @param {number|object|null} override  mm number, object, or null
 * @returns {object}
 */
function applyMarginOverride(baseMargin, override) {
  if (!override) return baseMargin;
  if (typeof override === "number") {
    const m = mmToDXA(override);
    return { top: m, right: m, bottom: m, left: m };
  }
  if (typeof override === "object") {
    return {
      top:    override.top    !== undefined ? mmToDXA(override.top)    : baseMargin.top,
      right:  override.right  !== undefined ? mmToDXA(override.right)  : baseMargin.right,
      bottom: override.bottom !== undefined ? mmToDXA(override.bottom) : baseMargin.bottom,
      left:   override.left   !== undefined ? mmToDXA(override.left)   : baseMargin.left,
    };
  }
  return baseMargin;
}

module.exports = {
  PAGE_SIZES_DXA,
  PAGE_FORMAT_MAP,
  ALIGN_MAP,
  mmToDXA,
  readTextFile,
  writeFileAtomic,
  computePageConfig,
  applyMarginOverride,
};
