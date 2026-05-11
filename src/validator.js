/**
 * src/validator.js
 * Pre-build validation — checks imports, variables, circular refs, broken paths.
 *
 * Usage (CLI):
 *   mdoc validate path/to/project.config.js [--dep-graph]
 *
 * Usage (programmatic):
 *   const { validate } = require('mdoc/src/validator');
 *   const { valid, errors, warnings } = await validate(configPath, opts);
 *
 * Emits:
 *   E001 — File not found (missing import path)
 *   E003 — Circular import detected
 *   W003 — Undefined variable used ({{name}} not in vars)
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { validateConfig } = require("./schema");
const { CODES }          = require("./logger");

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"]);
const SCRIPT_EXTS = new Set([".js", ".ts", ".py"]);
const VAR_RE     = /\{\{(\w[\w.]*)\}\}/g;

const commandExistsCache = new Map();

function commandExists(command) {
  if (commandExistsCache.has(command)) return commandExistsCache.get(command);
  const checker = process.platform === "win32" ? "where" : "which";
  let exists = false;
  try {
    const out = execFileSync(checker, [command], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    }).trim();
    exists = Boolean(out);
  } catch {
    exists = false;
  }
  commandExistsCache.set(command, exists);
  return exists;
}

// ─── Crawl all imports from an MD file ───────────────────────────────────────

function crawl(filePath, availableVars, results, visitStack, visited) {
  const normalized = path.resolve(filePath);

  if (visitStack.has(normalized)) {
    results.errors.push({ code: "E003", message: `Circular import: ${normalized}`, file: normalized });
    return;
  }
  if (visited.has(normalized)) return;
  visited.add(normalized);
  visitStack.add(normalized);

  if (!fs.existsSync(normalized)) {
    results.errors.push({ code: "E001", message: `File not found: ${normalized}`, file: normalized });
    visitStack.delete(normalized);
    return;
  }

  const text  = fs.readFileSync(normalized, "utf-8");
  const lines = text.split(/\r?\n/);
  const dir   = path.dirname(normalized);

  // Collect local vars defined in this file
  const localVars = new Set(Object.keys(availableVars));
  for (const line of lines) {
    const m = line.trim().match(/^<!--\s*@var:\s*(\w[\w.]*)\s*=\s*(.+?)\s*-->$/i);
    if (m) localVars.add(m[1]);
  }

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();

    // Check @import
    const importMatch = t.match(/^<!--\s*@import:\s*(.+?)\s*-->$/i);
    if (importMatch) {
      const parts   = importMatch[1].split("|");
      const relPath = parts[0].trim();
      if (relPath) {
        const absImport = path.resolve(dir, relPath);
        const ext       = path.extname(absImport).toLowerCase();

        const exists = fs.existsSync(absImport);
        if (!exists) {
          results.errors.push({
            code:    "E001",
            message: `Import not found: ${relPath}`,
            file:    normalized,
            line:    i + 1,
          });
        } else if (ext === ".md" || ext === ".txt") {
          crawl(absImport, Object.fromEntries([...localVars].map(k => [k, ""])), results, visitStack, visited);
        } else if (SCRIPT_EXTS.has(ext)) {
          const runtime = ext === ".py" ? "python" : ext === ".ts" ? "ts-node" : "node";
          if (!commandExists(runtime)) {
            results.warnings.push({
              code: "W001",
              message: `Runtime '${runtime}' not found for script import: ${relPath}`,
              file: normalized,
              line: i + 1,
            });
          }
        } else if (!IMAGE_EXTS.has(ext) && ext !== ".docx" && ext !== "") {
          results.warnings.push({
            code: "W001",
            message: `Unsupported import type '${ext}': ${relPath}`,
            file: normalized,
            line: i + 1,
          });
        }
        results.imports.push({ from: normalized, to: absImport, exists });
      }
      continue;
    }

    // Check {{variables}}
    let vm;
    VAR_RE.lastIndex = 0;
    while ((vm = VAR_RE.exec(t)) !== null) {
      const name = vm[1];
      if (!localVars.has(name)) {
        results.warnings.push({
          code:    "W003",
          message: `Undefined variable: {{${name}}}`,
          file:    normalized,
          line:    i + 1,
        });
      }
    }
  }

  visitStack.delete(normalized);
}

// ─── Main entry ───────────────────────────────────────────────────────────────

/**
 * Validate a project config file and all its imports.
 *
 * @param {string} configPath   Absolute path to project.config.js.
 * @param {object} [opts]
 * @param {boolean} [opts.depGraph]        Emit a dependency graph JSON file.
 * @param {string}  [opts.depGraphPath]    Path for the dep graph file. Defaults to <configDir>/dependency.json.
 * @param {object}  [opts.logger]          Logger instance (optional).
 * @returns {{ valid: boolean, errors: object[], warnings: object[], imports: object[] }}
 */
async function validate(configPath, opts = {}) {
  const absConfig = path.resolve(configPath);
  const configDir = path.dirname(absConfig);

  const results = { valid: true, errors: [], warnings: [], imports: [] };

  // ── Load config ───────────────────────────────────────────────────────────
  let rawConfig;
  try {
    rawConfig = require(absConfig);
    rawConfig._dir = configDir;
  } catch (err) {
    results.errors.push({ code: "E004", message: `Cannot load config: ${err.message}`, file: absConfig });
    results.valid = false;
    return results;
  }

  const { valid: cfgValid, errors: cfgErrors, warnings: cfgWarnings, config: cfg } = validateConfig(rawConfig);
  cfgErrors.forEach(msg => results.errors.push({ code: "E004", message: msg, file: absConfig }));
  cfgWarnings.forEach(msg => results.warnings.push({ code: "W001", message: msg, file: absConfig }));
  if (!cfgValid) { results.valid = false; return results; }

  // ── Validate cover ────────────────────────────────────────────────────────
  if (typeof cfg.cover === "string") {
    const coverAbs = path.resolve(configDir, cfg.cover);
    if (!fs.existsSync(coverAbs)) {
      results.warnings.push({ code: "W001", message: `Cover file not found: ${cfg.cover}`, file: coverAbs });
    } else {
      results.imports.push({ from: absConfig, to: coverAbs, exists: true });
      const coverVars = Object.fromEntries(Object.entries(cfg.vars || {}).map(([k, v]) => [k, String(v)]));
      crawl(coverAbs, coverVars, results, new Set(), new Set());
    }
  }

  // ── Crawl main input ──────────────────────────────────────────────────────
  const inputAbs = path.resolve(configDir, cfg.input);
  if (!fs.existsSync(inputAbs)) {
    results.errors.push({ code: "E001", message: `Input file not found: ${cfg.input}`, file: inputAbs });
    results.valid = false;
  } else {
    const globalVars = Object.fromEntries(Object.entries(cfg.vars || {}).map(([k, v]) => [k, String(v)]));
    crawl(inputAbs, globalVars, results, new Set(), new Set());
  }

  // ── Emit dependency graph ─────────────────────────────────────────────────
  if (opts.depGraph) {
    const graphPath = opts.depGraphPath || path.join(configDir, "dependency.json");
    const graph = {};
    for (const imp of results.imports) {
      const fromRel = path.relative(configDir, imp.from);
      if (!graph[fromRel]) graph[fromRel] = [];
      graph[fromRel].push({ to: path.relative(configDir, imp.to), exists: imp.exists });
    }
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");
  }

  results.valid = results.errors.length === 0;
  return results;
}

module.exports = { validate };
