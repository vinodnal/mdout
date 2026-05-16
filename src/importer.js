/**
 * src/importer.js
 * Handles <!-- @import: path | key: value --> directives in Markdown.
 *
 * Supported import types:
 *   .md / .txt   — recursively parsed as Markdown
 *   .png/.jpg/…  — embedded as image (with optional caption)
 *   .js / .ts    — executed; stdout treated as image path or Markdown text
 *   .py          — executed with python; same stdout rules as JS
 *   .docx        — embedded via AltChunk (type: embed) or text-extracted (type: extract)
 *
 * Usage:
 *   const { createImporter } = require('mdout/src/importer');
 *   const handleImport = createImporter(R, parseFn, opts);
 *   // opts.trackArtifact  — called with absolute paths of generated files
 *   // opts.logger         — structured logger
 */
"use strict";

const fs           = require("fs");
const path         = require("path");
const { execFileSync } = require("child_process");

const { retrySync } = require("./utils");
const { IMAGE_EXTS, SCRIPT_EXTS, runtimeForScriptExt } = require("./import-types");

function extractDocxTextSync(absPath) {
  const script = [
    "const mammoth=require('mammoth');",
    "const p=process.env.MDOUT_DOCX_PATH;",
    "mammoth.extractRawText({ path: p })",
    "  .then(r=>process.stdout.write((r && r.value) || ''))",
    "  .catch(e=>{ console.error(e && e.message ? e.message : String(e)); process.exit(1); });",
  ].join("");

  // Pass script via --eval (no shell interpretation, no escaping needed).
  return execFileSync("node", ["--eval", script], {
    encoding: "utf-8",
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, MDOUT_DOCX_PATH: absPath },
  });
}

/**
 * Create an import handler function.
 *
 * @param {object}   R           Renderer from createRenderer().
 * @param {Function} parseFn     (text, dir, extraOpts?) → elements[]
 * @param {object}   [opts]
 * @param {Function} [opts.trackArtifact]    Called with absolute path of generated artifacts.
 * @param {object}   [opts.logger]           Structured logger.
 * @param {object}   [opts.numberingState]   Shared counters (passed via context).
 * @returns {Function} handleImport(directive, baseDir, context) → elements[]
 */
function createImporter(R, parseFn, opts = {}) {
  const trackArtifact = typeof opts.trackArtifact === "function" ? opts.trackArtifact : null;
  const logger = opts.logger || null;

  return function handleImport(directive, dir, context = {}) {
    // Parse "path | key: value | key: value" format
    const parts = String(directive || "").split("|").map(s => s.trim());
    const relPath = parts[0];
    const importOpts = {};
    for (let i = 1; i < parts.length; i++) {
      const sep = parts[i].indexOf(":");
      if (sep > 0) importOpts[parts[i].slice(0, sep).trim()] = parts[i].slice(sep + 1).trim();
    }

    if (!relPath) {
      if (logger) logger.warn("@import directive has no path", "W001");
      return [];
    }

    const absPath        = path.resolve(dir, relPath);
    const ext            = path.extname(absPath).toLowerCase();
    const caption        = importOpts.caption || "";
    const pendingElement = context.pendingElement || null;
    const state          = context.state || opts.numberingState || {};
    const vars           = context.vars || {};

    // ── Image file ───────────────────────────────────────────────────────────

    if (IMAGE_EXTS.has(ext)) {
      if (!fs.existsSync(absPath)) {
        if (logger) {
          logger.warn(`Image not found: ${absPath}`, "W001", { file: relPath });
          logger.debug(`  Import resolved from: ${dir}`);
        }
        else console.warn(`[importer] Image not found: ${absPath}`);
        return [];
      }
      const data = retrySync(() => fs.readFileSync(absPath));
      const imageOpts = pendingElement
        ? { ...importOpts, caption: pendingElement.title, kind: pendingElement.kind, state }
        : { ...importOpts, caption, kind: caption ? "figure" : undefined, state };
      return R.makeImage(data, ext, imageOpts);
    }

    // ── Markdown / text file ─────────────────────────────────────────────────

    if (ext === ".md" || ext === ".txt") {
      if (!fs.existsSync(absPath)) {
        if (logger) {
          logger.warn(`Markdown file not found: ${absPath}`, "W001", { file: relPath });
          logger.debug(`  File source: ${dir}`);
        }
        else console.warn(`[importer] File not found: ${absPath}`);
        return [];
      }
      const text = retrySync(() => fs.readFileSync(absPath, "utf-8"));
      return parseFn(text, path.dirname(absPath), { vars });
    }

    // ── Script (JS / TypeScript / Python) ───────────────────────────────────

    if (SCRIPT_EXTS.has(ext)) {
      try {
        // Use execFileSync (no shell) to prevent shell-injection via crafted paths.
        const [interpreter, scriptArgs] = [runtimeForScriptExt(ext), [absPath]];
        const stdout = execFileSync(interpreter, scriptArgs, {
          encoding: "utf-8",
          timeout:  30000,
        }).trim();

        if (!stdout) return [];

        const resolvedStdout = path.resolve(dir, stdout);

        // stdout = path to an image file
        if (IMAGE_EXTS.has(path.extname(resolvedStdout).toLowerCase()) && fs.existsSync(resolvedStdout)) {
          if (trackArtifact) trackArtifact(resolvedStdout);
          const data = retrySync(() => fs.readFileSync(resolvedStdout));
          const imgExt = path.extname(resolvedStdout).toLowerCase();
          const imageOpts = pendingElement
            ? { ...importOpts, caption: pendingElement.title, kind: pendingElement.kind, state }
            : { ...importOpts, caption, kind: caption ? "figure" : undefined, state };
          return R.makeImage(data, imgExt, imageOpts);
        }

        // stdout = markdown text
        return parseFn(stdout, dir, { vars });
      } catch (err) {
        if (logger) logger.warn(`Script error (${relPath}): ${err.message}`, "E002", { file: relPath });
        else console.error(`[importer] Script error (${absPath}): ${err.message}`);
        return [];
      }
    }

    // ── Word document (.docx) ────────────────────────────────────────────────

    if (ext === ".docx") {
      const importType = (importOpts.type || "embed").toLowerCase();

      if (!fs.existsSync(absPath)) {
        if (logger) logger.warn(`DOCX file not found: ${absPath}`, "W001", { file: relPath });
        return [];
      }

      if (importType === "embed") {
        // AltChunk embed — preserves full fidelity of the imported Word document.
        // Note: AltChunk requires Word to reconcile styles on open.
        try {
          const { AlternativeContent } = require("docx");
          const data = retrySync(() => fs.readFileSync(absPath));
          // Emit a raw marker — builder handles embedding AltChunk at document level
          return [{ _type: "ALTCHUNK", data, relPath }];
        } catch (err) {
          if (logger) logger.warn(`DOCX embed failed (${relPath}): ${err.message}`, "W001");
        }
      }

      // type: extract — extract text via mammoth or similar (optional dep)
      try {
        const extracted = extractDocxTextSync(absPath);
        return parseFn(extracted || "", dir, { vars });
      } catch {
        if (logger) logger.warn(
          `Could not extract text from "${relPath}". Install mammoth: npm i mammoth`,
          "W001", { file: relPath }
        );
        return [];
      }
    }

    // ── Unknown type ─────────────────────────────────────────────────────────

    if (logger) logger.warn(`Unsupported import type: ${ext} (${relPath})`, "W001", { file: relPath });
    else console.warn(`[importer] Unsupported import type: ${ext} (${absPath})`);
    return [];
  };
}

module.exports = { createImporter };
