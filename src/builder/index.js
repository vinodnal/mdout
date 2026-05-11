/**
 * src/builder/index.js
 * Main build orchestrator.  Validates a project config, runs two passes over
 * the Markdown source (first-pass for ToC/element lists, full parse for body),
 * and assembles + writes the DOCX output.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, SectionType, NumberFormat,
} = require("docx");

const { validateConfig }    = require("../schema");
const { createRenderer }    = require("../renderer");
const { parseMD }           = require("../parser");
const { createImporter }    = require("../importer");
const { makeNullLogger }    = require("../logger");

const { ALIGN_MAP, PAGE_FORMAT_MAP, computePageConfig, applyMarginOverride, readTextFile, writeFileAtomic } = require("./page");
const { buildHeader, buildFooter } = require("./header-footer");
const { buildCoverParagraph }      = require("./cover");
const { collectTocEntries, collectElementEntries } = require("./first-pass");
const { splitAtSectionBreaks }     = require("./sections");

// ─── Main build function ──────────────────────────────────────────────────────

/**
 * Validate a project config and produce a DOCX file.
 *
 * @param {object} rawConfig  Raw project.config.js with `_dir` injected.
 * @param {object} [opts]
 * @param {object} [opts.logger]       Structured logger (makeNullLogger() if omitted).
 * @param {boolean} [opts.verbose]     Enable verbose logging.
 * @param {Function} [opts.trackArtifact]  Called with each output path written.
 * @returns {Promise<{ outputPath, byteLength, elementCount, coverCount, sectionCount, artifactPaths }>}
 */
async function buildFromConfig(rawConfig, opts = {}) {
  const log = opts.logger || makeNullLogger();
  const artifactPaths = new Set();
  const recordArtifact = (artifactPath) => {
    if (!artifactPath) return;
    const resolved = path.resolve(artifactPath);
    artifactPaths.add(resolved);
    if (typeof opts.trackArtifact === "function") opts.trackArtifact(resolved);
  };

  // ── Validate config ───────────────────────────────────────────────────────
  const { valid, errors, warnings, config: cfg } = validateConfig(rawConfig);

  if (warnings.length) warnings.forEach(w => log.warn(w, "E004"));
  if (!valid) {
    const err = new Error("Invalid project.config.js — fix the errors above and retry.");
    err.validationErrors = errors;
    throw err;
  }

  // ── Setup ─────────────────────────────────────────────────────────────────
  const projectDir     = rawConfig._dir;
  const globalPageConf = computePageConfig(cfg.page);
  const globalVars     = Object.assign({}, cfg.vars || {});

  const R = createRenderer(cfg.theme, { contentWidth: globalPageConf.contentWidth }, globalVars, log);

  let tocEntries     = [];
  let elementEntries = [];
  const numberingState = { chapterIndex: 0, figureIndex: 0, tableIndex: 0, annexIndex: 0 };

  // Wire parser ↔ importer (mutual recursion)
  function parseFn(text, dir, extraOpts = {}) {
    const mergedVars = Object.assign({}, globalVars, extraOpts.vars || {});
    const configuredDefaultAlignment = ALIGN_MAP[String(cfg.defaultAlignment || "").toLowerCase()] || undefined;
    return parseMD(text, dir, R, importFn, {
      numberingState,
      tocEntries,
      elementEntries,
      vars:   mergedVars,
      logger: log,
      defaultAlignment: extraOpts.defaultAlignment || configuredDefaultAlignment,
    });
  }
  const importFn = createImporter(R, parseFn, { trackArtifact: recordArtifact, logger: log, numberingState });

  // ── First pass: collect ToC and element lists ─────────────────────────────
  const inputPath = path.resolve(projectDir, cfg.input);
  tocEntries      = collectTocEntries(inputPath);
  elementEntries  = collectElementEntries(inputPath);

  // ── Parse body ────────────────────────────────────────────────────────────
  const mdText      = readTextFile(inputPath);
  const allElements = parseFn(mdText, path.dirname(inputPath));

  // ── Split into sections at SECTION_BREAK markers ──────────────────────────
  const segments = splitAtSectionBreaks(allElements);

  // ── Cover ─────────────────────────────────────────────────────────────────
  const coverPath = typeof cfg.cover === "string" ? path.resolve(projectDir, cfg.cover) : null;
  const coverText = coverPath && fs.existsSync(coverPath) ? readTextFile(coverPath) : null;
  if (coverPath && !coverText) log.warn(`Cover file not found: ${coverPath}`, "W001");

  const coverElements = coverText
    ? parseFn(coverText, path.dirname(coverPath))
    : (Array.isArray(cfg.cover)
        ? cfg.cover.map(e => buildCoverParagraph(e, R.FONT, cfg.theme.colors || {}, globalVars))
        : []);

  if (!coverElements.length) {
    coverElements.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children:  [new TextRun({ text: cfg.name, font: R.FONT, size: 48, bold: true, color: R.COLOR.H1 })],
    }));
  }

  // ── Build header & footer ─────────────────────────────────────────────────
  const themeColors = cfg.theme.colors || {};
  const themeFontSz = cfg.theme.fontSize || {};
  const globalHeader = buildHeader(cfg, themeColors, R.FONT, themeFontSz);
  const globalFooter = buildFooter(cfg, themeColors, R.FONT, themeFontSz);

  const pageNumFormat = PAGE_FORMAT_MAP[cfg.page.pageNumbers.format] || NumberFormat.DECIMAL;
  const pageNumStart  = cfg.page.pageNumbers.start;

  // ── Resolve section-level config overrides ────────────────────────────────
  const sectionOverrides = Array.isArray(cfg.sections) ? cfg.sections : [];

  function getSectionOverride(sectionBreak, index) {
    return (sectionBreak
      ? sectionOverrides.find(s => s.id && s.id === sectionBreak.id)
      : null)
      || sectionOverrides[index]
      || null;
  }

  // ── Assemble DOCX sections ────────────────────────────────────────────────
  const meta        = cfg.meta || {};
  const docSections = [];

  // Section 0: cover (no header/footer/page numbers)
  docSections.push({
    properties: {
      type: SectionType.NEXT_PAGE,
      page: { size: globalPageConf.size, margin: globalPageConf.margin },
    },
    children: coverElements,
  });

  // Body sections
  segments.forEach((segment, segIndex) => {
    const sectionBreak    = segment.sectionBreak;
    const override        = getSectionOverride(sectionBreak, segIndex);
    const orientation     = sectionBreak?.orientation || override?.orientation || "portrait";
    const marginOverride  = sectionBreak?.margin || override?.margin || null;
    const pageNumbersSpec = sectionBreak?.pageNumbers || override?.pageNumbers || null;
    const pageConf        = computePageConfig(cfg.page, orientation);
    const margin          = applyMarginOverride(pageConf.margin, marginOverride);

    let sectionPageNumbers;
    if (pageNumbersSpec && typeof pageNumbersSpec === "object") {
      const start = Number.isInteger(pageNumbersSpec.start)
        ? pageNumbersSpec.start
        : (Number.isInteger(pageNumStart) ? pageNumStart : undefined);
      const formatType = PAGE_FORMAT_MAP[pageNumbersSpec.format] || pageNumFormat;
      sectionPageNumbers = {
        ...(start !== undefined ? { start } : {}),
        ...(formatType ? { formatType } : {}),
      };
    } else if (segIndex === 0) {
      sectionPageNumbers = { start: pageNumStart, formatType: pageNumFormat };
    }

    // Section-level header/footer overrides
    let sectionHeader = globalHeader;
    let sectionFooter = globalFooter;
    if (sectionBreak?.header || override?.header) {
      const raw = sectionBreak?.header || override?.header;
      const hCfg = typeof raw === "string"
        ? { text: raw, align: "center", paragraphs: [] }
        : raw;
      sectionHeader = buildHeader({ header: hCfg }, themeColors, R.FONT, themeFontSz);
    }
    if (sectionBreak?.footer || override?.footer) {
      const raw = sectionBreak?.footer || override?.footer;
      const fCfg = typeof raw === "string"
        ? { text: raw, align: "center", showPageNumbers: true, paragraphs: [] }
        : raw;
      sectionFooter = buildFooter({ footer: fCfg }, themeColors, R.FONT, themeFontSz);
    }

    // Filter real docx-elements; warn about unsupported ALTCHUNK markers.
    const children = segment.elements.filter(el => {
      if (!el) return false;
      if (el._type === "ALTCHUNK") {
        log.warn(
          `DOCX embed (type: embed) is not yet supported — "${el.relPath}" was skipped. Use type: extract instead.`,
          "W001"
        );
        return false;
      }
      return !el._type;
    });

    docSections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pageConf.size, margin, pageNumbers: sectionPageNumbers },
      },
      headers: { default: sectionHeader },
      footers: { default: sectionFooter },
      children,
    });
  });

  // ── Build document ────────────────────────────────────────────────────────
  const doc = new Document({
    creator:     meta.author   || "",
    title:       cfg.name      || "",
    description: meta.subject  || "",
    keywords:    (meta.keywords || []).join(", "),
    features:    { updateFields: true },
    styles:      R.makeStyles(),
    numbering:   R.makeNumbering(),
    sections:    docSections,
  });

  // ── Write output ──────────────────────────────────────────────────────────
  const outputPath = path.resolve(projectDir, cfg.output);
  const buffer     = await Packer.toBuffer(doc);
  writeFileAtomic(outputPath, buffer);
  recordArtifact(outputPath);

  log.summary();

  return {
    outputPath,
    byteLength:    buffer.byteLength,
    elementCount:  allElements.filter(el => el && !el._type).length,
    coverCount:    coverElements.length,
    sectionCount:  docSections.length,
    artifactPaths: [...artifactPaths],
  };
}

module.exports = { buildFromConfig };
