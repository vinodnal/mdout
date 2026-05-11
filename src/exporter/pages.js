/**
 * src/exporter/pages.js
 * Shared page-range utilities for the export sub-system.
 *
 * Parses human-readable page selection strings like "1,3-5,7,10-" into
 * a flat sorted array of 1-based page numbers, given the total page count.
 *
 * Supported syntax:
 *   "all"      → every page
 *   "1"        → page 1 only
 *   "2-5"      → pages 2, 3, 4, 5
 *   "3-"       → page 3 to the last page (open end)
 *   "-4"       → pages 1 to 4 (open start)
 *   "1,3-5,8"  → pages 1, 3, 4, 5, 8
 */
"use strict";

/**
 * Parse a page selection string and return a sorted, deduplicated array of
 * 1-based page numbers within [1, totalPages].
 *
 * @param {string|null|undefined} spec       Page selection string, or null/"all" for all pages.
 * @param {number}                totalPages Total number of pages in the document.
 * @returns {number[]}
 */
function parsePageSpec(spec, totalPages) {
  if (!spec || spec.trim().toLowerCase() === "all") {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set();

  for (const token of spec.split(",")) {
    const part = token.trim();
    if (!part) continue;

    // Range: "3-5", "3-", "-5"
    const rangeMatch = part.match(/^(\d*)-(\d*)$/);
    if (rangeMatch) {
      const from = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 1;
      const to   = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : totalPages;
      for (let p = Math.max(1, from); p <= Math.min(totalPages, to); p++) pages.add(p);
      continue;
    }

    // Single page: "7"
    const single = parseInt(part, 10);
    if (!Number.isNaN(single) && single >= 1 && single <= totalPages) {
      pages.add(single);
    }
  }

  return [...pages].sort((a, b) => a - b);
}

/**
 * Locate an executable in PATH or common install locations.
 * Returns the first found path, or null.
 *
 * @param {string[]} candidates  Executable names / absolute paths to try.
 * @returns {string|null}
 */
function findExecutable(candidates) {
  const { execFileSync } = require("child_process");
  const path = require("path");
  const fs   = require("fs");

  // Common prefix dirs to try
  const prefixDirs = [
    "C:\\Program Files\\poppler\\bin",
    "C:\\Program Files (x86)\\poppler\\bin",
    "C:\\poppler\\bin",
    "/usr/bin", "/usr/local/bin",
  ];

  for (const cand of candidates) {
    // Absolute path given — check directly
    if (path.isAbsolute(cand)) {
      if (fs.existsSync(cand)) return cand;
      continue;
    }

    // Try 'which' / 'where' first
    try {
      const whichCmd = process.platform === "win32" ? "where" : "which";
      const found = execFileSync(whichCmd, [cand], { encoding: "utf-8", stdio: ["ignore","pipe","ignore"] }).trim().split(/\r?\n/)[0];
      if (found && fs.existsSync(found.trim())) return found.trim();
    } catch { /* not in PATH */ }

    // Fallback: check prefix dirs
    for (const dir of prefixDirs) {
      const full = path.join(dir, cand + (process.platform === "win32" ? ".exe" : ""));
      if (fs.existsSync(full)) return full;
      // also without .exe
      const bare = path.join(dir, cand);
      if (fs.existsSync(bare)) return bare;
    }
  }

  return null;
}

module.exports = { parsePageSpec, findExecutable };
