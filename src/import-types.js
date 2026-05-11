/**
 * src/import-types.js
 * Shared import-type constants and helpers used across parser/import/export/validation.
 */
"use strict";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"]);
const SCRIPT_EXTS = new Set([".js", ".ts", ".py"]);

function runtimeForScriptExt(ext) {
  const normalized = String(ext || "").toLowerCase();
  if (normalized === ".py") return "python";
  if (normalized === ".ts") return "ts-node";
  return "node";
}

module.exports = {
  IMAGE_EXTS,
  SCRIPT_EXTS,
  runtimeForScriptExt,
};
