/**
 * src/exporter/markdown.js
 * Flatten a multi-file mdoc project into a single, self-contained Markdown file.
 *
 * How it works:
 *   1. Load the project config (project.config.js).
 *   2. Start from the entry file (cfg.input) and optionally the cover (cfg.cover).
 *   3. Recursively resolve every <!-- @import: ... --> directive.
 *      - .md / .txt files → inline their content.
 *      - .js / .py / .ts  → execute and inline stdout as text.
 *      - Images            → emit a Markdown image reference (path made relative to outFile).
 *      - .docx             → emit a placeholder comment.
 *   4. Write the merged text to the destination file.
 *
 * The output is designed to be useful as input to AI language models — one big,
 * readable document without any tool-specific syntax.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { IMAGE_EXTS, SCRIPT_EXTS, runtimeForScriptExt } = require("../import-types");

// ─── Directive resolver ───────────────────────────────────────────────────────

/**
 * Parse a pipe-separated directive options string (same format as @import).
 */
function parseImportDirective(raw) {
  const parts  = String(raw || "").split("|").map(s => s.trim());
  const relPath = parts[0];
  const opts    = {};
  for (let i = 1; i < parts.length; i++) {
    const sep = parts[i].indexOf(":");
    if (sep > 0) opts[parts[i].slice(0, sep).trim()] = parts[i].slice(sep + 1).trim();
  }
  return { relPath, opts };
}

/**
 * Recursively flatten a markdown file, resolving @import directives.
 *
 * @param {string}  filePath     Absolute path to the source .md file.
 * @param {object}  vars         Template variables for {{var}} substitution.
 * @param {Set}     visited      Cycle-detection set of absolute paths.
 * @param {string}  outDir       Directory of the output file (for relative image paths).
 * @param {object}  [logger]
 * @returns {string}
 */
function flattenFile(filePath, vars, visited, outDir, logger) {
  const absPath = path.resolve(filePath);

  if (visited.has(absPath)) {
    if (logger) logger.warn(`Skipping circular import: ${absPath}`, "W001");
    return `<!-- skipped circular import: ${path.basename(absPath)} -->\n`;
  }
  visited.add(absPath);

  try {
    if (!fs.existsSync(absPath)) {
      if (logger) logger.warn(`File not found: ${absPath}`, "W001");
      return `<!-- file not found: ${path.basename(absPath)} -->\n`;
    }

    const dir   = path.dirname(absPath);
    const text  = fs.readFileSync(absPath, "utf-8");
    const lines = text.split(/\r?\n/);
    const out   = [];

    // First pass: collect @var definitions
    const localVars = Object.assign({}, vars);
    for (const line of lines) {
      const m = line.trim().match(/^<!--\s*@var:\s*(\w[\w.]*)\s*=\s*(.+?)\s*-->$/i);
      if (m) localVars[m[1]] = m[2];
    }

    for (let i = 0; i < lines.length; i++) {
      const line    = lines[i];
      const trimmed = line.trim();

      // @import directive
      const importMatch = trimmed.match(/^<!--\s*@import:\s*(.*?)\s*-->$/i);
      if (importMatch) {
        const { relPath, opts } = parseImportDirective(importMatch[1]);
        if (!relPath) { out.push(line); continue; }

        const absImport = path.resolve(dir, relPath);
        const ext       = path.extname(absImport).toLowerCase();

        // Image -> Markdown image reference with path relative to output file
        if (IMAGE_EXTS.has(ext)) {
          const rel    = path.relative(outDir, absImport).replace(/\\/g, "/");
          const caption = opts.caption || opts.title || path.basename(absImport, ext);
          out.push(`\n![${caption}](${rel})\n`);
          continue;
        }

        // Script -> execute and embed stdout
        if (SCRIPT_EXTS.has(ext)) {
          try {
            const [interp, sArgs] = [runtimeForScriptExt(ext), [absImport]];
            const stdout = execFileSync(interp, sArgs, {
              encoding: "utf-8",
              timeout: 30000,
              maxBuffer: 8 * 1024 * 1024,
              cwd: dir,
            });
            // Scripts may output image paths (one line = image path) or markdown
            const firstLine = stdout.trim().split(/\r?\n/)[0];
            const scriptExt = path.extname(firstLine).toLowerCase();
            if (IMAGE_EXTS.has(scriptExt) && fs.existsSync(path.resolve(dir, firstLine.trim()))) {
              const absImg = path.resolve(dir, firstLine.trim());
              const rel    = path.relative(outDir, absImg).replace(/\\/g, "/");
              out.push(`\n![](${rel})\n`);
            } else {
              out.push("\n" + stdout.trim() + "\n");
            }
          } catch (err) {
            if (logger) logger.warn(`Script execution failed: ${absImport} — ${err.message}`, "W003");
            out.push(`<!-- script error: ${path.basename(absImport)} -->\n`);
          }
          continue;
        }

        // .docx -> placeholder
        if (ext === ".docx") {
          out.push(`<!-- embedded docx: ${path.relative(dir, absImport)} -->\n`);
          continue;
        }

        // .md / .txt -> recurse
        if (ext === ".md" || ext === ".txt" || ext === "") {
          const nested = flattenFile(absImport, localVars, visited, outDir, logger);
          out.push("\n" + nested.trim() + "\n");
          continue;
        }

        // Unknown -> comment
        out.push(`<!-- unsupported import: ${path.basename(absImport)} -->\n`);
        continue;
      }

      // @toc / @list / @element / @page-break - keep as-is (informative in flat MD)
      // @var - already collected above; keep the line as a comment
      const varMatch = trimmed.match(/^<!--\s*@var:/i);
      if (varMatch) {
        out.push(`<!-- (var defined) ${trimmed.slice(4).trim()} -->`);
        continue;
      }

      // Apply {{variable}} substitution
      const resolved = line.replace(/\{\{([\w.]+)\}\}/g, (_, name) =>
        Object.prototype.hasOwnProperty.call(localVars, name) ? localVars[name] : `{{${name}}}`
      );

      out.push(resolved);
    }

    return out.join("\n");
  } finally {
    // allow the same file in separate branches and keep cycle tracking consistent on errors
    visited.delete(absPath);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Flatten a project into a single Markdown file.
 *
 * @param {string}  configPath   Absolute path to project.config.js.
 * @param {object}  opts
 * @param {string}  [opts.out]          Output file path (default: <projectDir>/<name>.md).
 * @param {boolean} [opts.includeCover] Prepend the cover.md content (default: true).
 * @param {object}  [opts.logger]
 * @returns {Promise<{ outputPath: string, byteLength: number }>}
 */
async function flattenToMarkdown(configPath, opts = {}) {
  const absConfig  = path.resolve(configPath);
  const projectDir = path.dirname(absConfig);
  const logger     = opts.logger || null;

  // Load config
  delete require.cache[require.resolve(absConfig)];
  const rawConfig = require(absConfig);

  const name     = rawConfig.name || path.basename(projectDir);
  const inputRel = rawConfig.input || "index.md";
  const inputAbs = path.resolve(projectDir, inputRel);

  const outPath  = path.resolve(opts.out || path.join(projectDir, `${name.replace(/[^\w.-]/g, "_")}_flat.md`));
  const outDir   = path.dirname(outPath);
  fs.mkdirSync(outDir, { recursive: true });

  const vars     = Object.assign({}, rawConfig.vars || {}, opts.vars || {});
  const visited  = new Set();
  const parts    = [];

  // ── Front-matter banner ───────────────────────────────────────────────────
  parts.push([
    `<!-- Generated by mdoc — flat Markdown export -->`,
    `<!-- Source: ${path.relative(outDir, absConfig).replace(/\\/g, "/")} -->`,
    `<!-- Date: ${new Date().toISOString()} -->`,
    ``,
  ].join("\n"));

  // ── Cover ─────────────────────────────────────────────────────────────────
  if (opts.includeCover !== false && typeof rawConfig.cover === "string" && rawConfig.cover) {
    const coverPath = path.resolve(projectDir, rawConfig.cover);
    if (fs.existsSync(coverPath)) {
      const ext = path.extname(coverPath).toLowerCase();
      if (ext === ".md" || ext === ".txt") {
        if (logger) logger.step("Flattening cover…");
        const coverText = flattenFile(coverPath, vars, visited, outDir, logger);
        parts.push(coverText.trim() + "\n\n---\n");
      }
    }
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  if (logger) logger.step("Flattening body…");
  parts.push(flattenFile(inputAbs, vars, visited, outDir, logger));

  // ── Write output ──────────────────────────────────────────────────────────
  const merged = parts.join("\n");
  fs.writeFileSync(outPath, merged, "utf-8");

  const byteLength = Buffer.byteLength(merged, "utf-8");
  if (logger) logger.info(`Flat MD → ${outPath}  (${(byteLength / 1024).toFixed(1)} KB)`);

  return { outputPath: outPath, byteLength };
}

module.exports = { flattenToMarkdown };
