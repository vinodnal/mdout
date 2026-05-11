// core/importer.js — backward-compat shim. Delegates to src/importer.js.
module.exports = require("../src/importer");
// ─── Original implementation below (not executed) ────────────────────────────
/** @deprecated Use require('mdoc/src/importer') directly.
 * core/importer.js
 * Handles <!-- @import: path | key: value --> directives in Markdown.
 *
 * Usage:
 *   const { createImporter } = require('./core/importer');
 *   const handleImport = createImporter(R, parseFn);
 *   // handleImport(directive, baseDir) → docx elements[]
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"]);

function sleepSync(ms) {
  if (ms <= 0) return;
  const shared = new SharedArrayBuffer(4);
  const view = new Int32Array(shared);
  Atomics.wait(view, 0, 0, ms);
}

function isTransientFsError(err) {
  return err && ["EPERM", "EBUSY", "EACCES", "ETXTBSY", "EMFILE", "ENFILE"].includes(err.code);
}

function retrySync(fn, opts = {}) {
  const retries = opts.retries ?? 5;
  const baseDelay = opts.delay ?? 50;
  let delay = baseDelay;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientFsError(err) || attempt === retries) throw err;
      sleepSync(delay);
      delay = Math.min(delay * 2, 500);
    }
  }
  throw lastErr;
}

function createImporter(R, parseFn, opts = {}) {
  const trackArtifact = typeof opts.trackArtifact === "function" ? opts.trackArtifact : null;
  /**
   * @param {string} directive  — raw text inside @import: (e.g. "./figures/pareto.js | width: 580")
   * @param {string} dir        — absolute directory of the importing MD file
   * @returns docx elements[]
   */
  return function handleImport(directive, dir, context = {}) {
    // Parse path and key:value options
    const parts = directive.split("|").map(s => s.trim());
    const relPath = parts[0];
    const opts = {};
    for (let i = 1; i < parts.length; i++) {
      const sep = parts[i].indexOf(":");
      if (sep > 0) opts[parts[i].slice(0, sep).trim()] = parts[i].slice(sep + 1).trim();
    }

    const absPath = path.resolve(dir, relPath);
    const ext = path.extname(absPath).toLowerCase();
    const caption = opts.caption || "";
    const pendingElement = context.pendingElement || null;
    const state = context.state || opts.numberingState || {};

    // ── Image file ────────────────────────────────────────────────────────────
    if (IMAGE_EXTS.has(ext)) {
      if (!fs.existsSync(absPath)) { console.warn(`[importer] Image not found: ${absPath}`); return []; }
      const data = retrySync(() => fs.readFileSync(absPath));
      const imageOpts = pendingElement
        ? { ...opts, caption: pendingElement.title, kind: pendingElement.kind, state }
        : { ...opts, caption, kind: caption ? "figure" : undefined, state };
      return R.makeImage(data, ext, imageOpts);
    }

    // ── Markdown / text file ──────────────────────────────────────────────────
    if (ext === ".md" || ext === ".txt") {
      if (!fs.existsSync(absPath)) { console.warn(`[importer] File not found: ${absPath}`); return []; }
      const text = retrySync(() => fs.readFileSync(absPath, "utf-8"));
      return parseFn(text, path.dirname(absPath));
    }

    // ── Script (JS / Python / etc.) ───────────────────────────────────────────
    if (ext === ".js" || ext === ".py" || ext === ".ts") {
      try {
        const cmd = ext === ".py" ? `python "${absPath}"` : `node "${absPath}"`;
        const stdout = execSync(cmd, { encoding: "utf-8", timeout: 30000 }).trim();
        const resolvedStdout = path.resolve(dir, stdout);

        // If stdout looks like a file path to an image → embed it
        if (stdout && IMAGE_EXTS.has(path.extname(resolvedStdout).toLowerCase()) && fs.existsSync(resolvedStdout)) {
          if (trackArtifact) trackArtifact(resolvedStdout);
          const data = retrySync(() => fs.readFileSync(resolvedStdout));
          const imgExt = path.extname(resolvedStdout).toLowerCase();
          const imageOpts = pendingElement
            ? { ...opts, caption: pendingElement.title, kind: pendingElement.kind, state }
            : { ...opts, caption, kind: caption ? "figure" : undefined, state };
          return R.makeImage(data, imgExt, imageOpts);
        }

        // Otherwise treat stdout as markdown
        if (stdout) return parseFn(stdout, dir);
        return [];
      } catch (err) {
        console.error(`[importer] Script error (${absPath}): ${err.message}`);
        return [];
      }
    }

    console.warn(`[importer] Unsupported import type: ${ext} (${absPath})`);
    return [];
  };
}

module.exports = { createImporter };
