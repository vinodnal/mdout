/**
 * src/renderer.js
 * Theme-aware factory for docx element constructors.
 *
 * Delegates to sub-modules in src/renderer/:
 *   colors.js   — color palette builder and callout style definitions
 *   inline.js   — inline run parsing (bold, italic, links, math, vars, …)
 *   table.js    — pipe-table parsing and rendering
 *   elements.js — block element factories (paragraphs, headings, callouts, images, …)
 *   styles.js   — Word paragraph styles and numbering definitions
 *
 * Usage:
 *   const { createRenderer } = require('./renderer');
 *   const R = createRenderer(config.theme, { contentWidth }, vars, logger);
 */
"use strict";

const { buildColors, CALLOUT_STYLES } = require("./renderer/colors");
const { createInlineRenderer }        = require("./renderer/inline");
const { createTableRenderer }         = require("./renderer/table");
const { createElementsRenderer }      = require("./renderer/elements");
const { createStylesRenderer }        = require("./renderer/styles");

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a fully-configured renderer for a document build.
 *
 * @param {object} [theme]       config.theme from project.config.js
 * @param {object} [pageConfig]  { contentWidth } in DXA
 * @param {object} [vars]        Template variables for {{name}} substitution
 * @param {object} [logger]      Logger instance (may be null)
 * @returns {object}             Renderer — collection of element factory methods
 */
function createRenderer(theme = {}, pageConfig = {}, vars = {}, logger = null) {
  const colors     = theme.colors    || {};
  const fonts      = theme.fonts     || {};
  const fsMap      = theme.fontSize  || {};
  const spacingCfg = theme.spacing   || {};
  const headingSp  = spacingCfg.headings || {};

  // ── Resolved palette & sizes ───────────────────────────────────────────────
  const C         = buildColors(colors);
  const FONT      = fonts.body || "Calibri";
  const CODE_FONT = fonts.code || "Courier New";
  const MATH_FONT = fonts.math || "Cambria Math";

  const FS      = (fsMap.body    || 11) * 2;
  const H1_FS   = (fsMap.h1      || 18) * 2;
  const H2_FS   = (fsMap.h2      || 14) * 2;
  const H3_FS   = (fsMap.h3      || 12) * 2;
  const H4_FS   = (fsMap.h4      || 11) * 2;
  const CAP_FS  = (fsMap.caption ||  9) * 2;
  const CODE_FS = (fsMap.code    ||  9) * 2;

  const SP = {
    paragraphLine:   spacingCfg.paragraphLine   ?? 320,
    paragraphAfter:  spacingCfg.paragraphAfter  ?? 120,
    bulletAfter:     spacingCfg.bulletAfter     ?? 80,
    codeLineSpacing: spacingCfg.codeLineSpacing ?? 220,
    headings: {
      h1: headingSp.h1 || { before: 480, after: 240 },
      h2: headingSp.h2 || { before: 360, after: 180 },
      h3: headingSp.h3 || { before: 280, after: 140 },
      h4: headingSp.h4 || { before: 200, after: 100 },
    },
  };

  const CONTENT_W = pageConfig.contentWidth || 9070;

  // ── Variable substitution ──────────────────────────────────────────────────

  function applyVars(text) {
    if (!text || typeof text !== "string") return text;
    return text.replace(/\{\{(\w[\w.]*)\}\}/g, (_, name) => {
      if (Object.prototype.hasOwnProperty.call(vars, name)) return String(vars[name]);
      if (logger) logger.warn(`Undefined variable: {{${name}}}`, "W003");
      return `{{${name}}}`;
    });
  }

  // ── Assemble shared context ────────────────────────────────────────────────
  const ctx = {
    C, FONT, CODE_FONT, MATH_FONT,
    FS, H1_FS, H2_FS, H3_FS, H4_FS, CAP_FS, CODE_FS,
    SP, CONTENT_W, fsMap, applyVars, logger,
  };

  // ── Wire sub-renderers ─────────────────────────────────────────────────────
  const inline   = createInlineRenderer(ctx);
  const table    = createTableRenderer({ ...ctx, parseInlineRuns: inline.parseInlineRuns });
  const elements = createElementsRenderer({ ...ctx, parseInlineRuns: inline.parseInlineRuns, CALLOUT_STYLES });
  const styles   = createStylesRenderer(ctx);

  // ── Public interface ───────────────────────────────────────────────────────
  return {
    // Inline
    parseInlineRuns: inline.parseInlineRuns,
    // Table
    parseTable:      table.parseTable,
    // Block elements
    ...elements,
    // Word styles / numbering
    makeStyles:      styles.makeStyles,
    makeNumbering:   styles.makeNumbering,
    // Shared utilities
    applyVars,
    // Exposed for builder
    FONT,
    COLOR: C,
  };
}

module.exports = { createRenderer };
