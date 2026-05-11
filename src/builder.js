/**
 * src/builder.js
 * Validates a project config and assembles the DOCX output.
 *
 * New features vs original:
 *   - Multi-section support: <!-- @section: ... --> directives in Markdown
 *     split the document into separate DOCX sections with independent
 *     orientation, margins, headers, and footers.
 *   - Variable interpolation: config.vars merged with document @var directives.
 *   - Structured logger integration.
 *   - Shared vars passed to parser/renderer.
 *
 * Usage (programmatic):
 *   const { buildFromConfig } = require('mdoc/src/builder');
 *   const raw = require('./project.config.js');
 *   raw._dir = path.resolve('./my-project');
 *   const result = await buildFromConfig(raw, { logger, verbose: true });
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun,
  Header, Footer, AlignmentType, BorderStyle,
  PageNumber, NumberFormat, SectionType,
} = require("docx");

const { validateConfig }    = require("./schema");
const { createRenderer }    = require("./renderer");
const { parseMD }           = require("./parser");
const { createImporter }    = require("./importer");
const { makeNullLogger }    = require("./logger");
const { retrySync }         = require("./utils");

// ─── Page sizes (DXA: 1 inch = 1440 DXA) ────────────────────────────────────

const PAGE_SIZES_DXA = {
  A4:     { width: 11906, height: 16838 },
  Letter: { width: 12240, height: 15840 },
  A3:     { width: 16838, height: 23811 },
};

const PAGE_FORMAT_MAP = {
  decimal:     NumberFormat.DECIMAL,
  upperRoman:  NumberFormat.UPPER_ROMAN,
  lowerRoman:  NumberFormat.LOWER_ROMAN,
  upperLetter: NumberFormat.UPPER_LETTER,
  lowerLetter: NumberFormat.LOWER_LETTER,
};

const ALIGN_MAP = {
  left:      AlignmentType.LEFT,
  center:    AlignmentType.CENTER,
  right:     AlignmentType.RIGHT,
  justify:   AlignmentType.JUSTIFIED,
  justified: AlignmentType.JUSTIFIED,
};

function mmToDXA(mm) { return Math.round(mm * 56.69); }

function readTextFile(filePath) { return retrySync(() => fs.readFileSync(filePath, "utf-8")); }

function hasNoNumberModifier(text) {
  const value = String(text || "");
  return /\{[^{}]*\.(?:no-num|no-number|nonumber)\b[^{}]*\}/i.test(value);
}

function stripTrailingModifiers(text) {
  let value = String(text || "");
  while (true) {
    const m = value.match(/\s*(\{[^{}]*\})\s*$/);
    if (!m) break;
    const group = m[1];
    const body = group.slice(1, -1).trim();
    const modMatches = [...body.matchAll(/\.([a-z][\w-]*)/gi)];
    const onlyMods = modMatches.length > 0
      && body.replace(/\.([a-z][\w-]*)/gi, "").trim() === "";
    if (!onlyMods) break;
    value = value.slice(0, m.index).trimEnd();
  }
  return value.trim();
}

function writeFileAtomic(filePath, buffer) {
  const dir = path.dirname(filePath);
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

// ─── Page config computation ──────────────────────────────────────────────────

function computePageConfig(page, orientation = "portrait") {
  const rawSize = page.size;
  let size = typeof rawSize === "string"
    ? PAGE_SIZES_DXA[rawSize] || PAGE_SIZES_DXA.A4
    : { width: mmToDXA(rawSize.width), height: mmToDXA(rawSize.height) };

  // Swap for landscape
  if (orientation === "landscape" && size.width < size.height) {
    size = { width: size.height, height: size.width };
  }

  const rawMarg = page.margins;
  const margin = typeof rawMarg === "number"
    ? { top: mmToDXA(rawMarg), right: mmToDXA(rawMarg), bottom: mmToDXA(rawMarg), left: mmToDXA(rawMarg) }
    : { top: mmToDXA(rawMarg.top), right: mmToDXA(rawMarg.right), bottom: mmToDXA(rawMarg.bottom), left: mmToDXA(rawMarg.left) };

  return { size, margin, contentWidth: size.width - margin.left - margin.right };
}

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

// ─── Header & Footer builders ─────────────────────────────────────────────────

function makeRuns(runs, defaults) {
  const out = [];
  for (const run of (runs || [])) {
    const children = run.field === "PAGE_CURRENT" ? [PageNumber.CURRENT]
                   : run.field === "PAGE_TOTAL"   ? [PageNumber.TOTAL_PAGES]
                   : run.field === "PAGE_SECTION_TOTAL" ? [PageNumber.TOTAL_PAGES_IN_SECTION]
                   : undefined;
    out.push(new TextRun({
      text:    run.text,
      children,
      font:    run.font    ?? defaults.font,
      size:    run.size    ?  run.size * 2 : defaults.size,
      color:   run.color   ?? defaults.color,
      bold:    run.bold    ?? defaults.bold,
      italics: run.italics ?? defaults.italics,
      allCaps: run.allCaps ?? defaults.allCaps,
      break:   run.break,
    }));
  }
  return out;
}

function buildHeader(cfg, colors, FONT, fsMap) {
  const h     = cfg.header || {};
  const hdrFS = (fsMap.header || 9) * 2;
  const H2    = colors.secondary || "2E4C7E";
  const richParagraphs = Array.isArray(h.paragraphs) ? h.paragraphs : [];

  if (richParagraphs.length) {
    return new Header({ children: richParagraphs.map((p, idx) => new Paragraph({
      alignment: ALIGN_MAP[p.align || h.align] || AlignmentType.CENTER,
      border:    idx === 0 ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: H2, space: 8 } } : undefined,
      spacing:   { before: p.spacingBefore ?? (idx === 0 ? 0 : 40), after: p.spacingAfter ?? 80 },
      children:  makeRuns(p.runs, { font: FONT, size: hdrFS, color: H2, bold: true, italics: false, allCaps: false }),
    })) });
  }

  return new Header({ children: [new Paragraph({
    alignment: ALIGN_MAP[h.align] || AlignmentType.CENTER,
    border:    { bottom: { style: BorderStyle.SINGLE, size: 4, color: H2, space: 8 } },
    spacing:   { before: 0, after: 120 },
    children:  [new TextRun({ text: h.text || "", font: FONT, size: hdrFS, color: H2, bold: true })],
  })] });
}

function buildFooter(cfg, colors, FONT, fsMap) {
  const f     = cfg.footer || {};
  const ftrFS = (fsMap.footer || 9) * 2;
  const H2    = colors.secondary || "2E4C7E";
  const NOTE  = colors.note      || "555555";
  const ACCENT= colors.accent    || "2E75B6";
  const richParagraphs = Array.isArray(f.paragraphs) ? f.paragraphs : [];

  if (richParagraphs.length) {
    return new Footer({ children: richParagraphs.map((p, idx) => new Paragraph({
      alignment: ALIGN_MAP[p.align || f.align] || AlignmentType.CENTER,
      border:    idx === 0 ? { top: { style: BorderStyle.SINGLE, size: 4, color: H2, space: 8 } } : undefined,
      spacing:   { before: p.spacingBefore ?? (idx === 0 ? 80 : 40), after: p.spacingAfter ?? 0 },
      children:  makeRuns(p.runs, { font: FONT, size: ftrFS, color: NOTE, bold: false, italics: false, allCaps: false }),
    })) });
  }

  const children = [];
  if (f.text) {
    children.push(new TextRun({ text: f.showPageNumbers !== false ? f.text + "  —  " : f.text, font: FONT, size: ftrFS, color: NOTE }));
  }
  if (f.showPageNumbers !== false) {
    children.push(new TextRun({ children: [PageNumber.CURRENT],    font: FONT, size: ftrFS, color: ACCENT, bold: true }));
    children.push(new TextRun({ text: " / ",                       font: FONT, size: ftrFS, color: NOTE }));
    children.push(new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: ftrFS, color: NOTE }));
  }

  return new Footer({ children: [new Paragraph({
    alignment: ALIGN_MAP[f.align] || AlignmentType.CENTER,
    border:    { top: { style: BorderStyle.SINGLE, size: 4, color: H2, space: 8 } },
    spacing:   { before: 80, after: 0 },
    children,
  })] });
}

// ─── First-pass: collect ToC entries ─────────────────────────────────────────

function collectTocEntries(entryPath) {
  const entries = [];
  const counters = [0, 0, 0, 0];

  function toRoman(value) {
    const map = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],
                 [40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
    let n = Math.max(1, value), out = "";
    for (const [amount, symbol] of map) while (n >= amount) { out += symbol; n -= amount; }
    return out;
  }

  function computeNum(level) {
    if (level === 1) return `${toRoman(counters[0])}.`;
    if (level === 2) return `${counters[1]}.`;
    if (level === 3) return `${counters[1]}.${counters[2]}.`;
    return `${counters[1]}.${counters[2]}.${counters[3]}.`;
  }

  function visit(filePath, stack) {
    const normalized = path.resolve(filePath);
    if (stack.has(normalized)) return;
    stack.add(normalized);
    const text  = readTextFile(normalized);
    const lines = text.split(/\r?\n/);
    const dir   = path.dirname(normalized);

    for (const line of lines) {
      const t = line.trim();
      const importMatch = t.match(/^<!--\s*@import:\s*(.+?)\s*-->$/);
      if (importMatch) {
        const relPath = importMatch[1].split("|")[0].trim();
        if (relPath) {
          const abs = path.resolve(dir, relPath);
          const ext = path.extname(abs).toLowerCase();
          if ((ext === ".md" || ext === ".txt") && fs.existsSync(abs)) visit(abs, stack);
        }
        continue;
      }
      const hMatch = t.match(/^(#{1,4})\s+(.+)$/);
      if (!hMatch) continue;
      const level    = hMatch[1].length;
      const rawTitle = hMatch[2].trim();
      const noNum    = hasNoNumberModifier(rawTitle);
      if (noNum) continue;
      counters[level - 1] += 1;
      for (let idx = level; idx < 4; idx++) counters[idx] = 0;
      const title = stripTrailingModifiers(rawTitle)
        .replace(/\*\*/g, "").replace(/\*/g, "")
        .replace(/\{\{[\w.]+\}\}/g, "").trim();
      if (!title) continue;
      entries.push({ title: `${computeNum(level)} ${title}`, level });
    }
    stack.delete(normalized);
  }

  visit(entryPath, new Set());
  return entries;
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"]);

// ─── First-pass: collect element (figure/table/annex) entries ────────────────

function collectElementEntries(entryPath) {
  const entries = [];
  const state   = { figureIndex: 0, tableIndex: 0, annexIndex: 0 };
  const LABELS  = { figure: "Figure", table: "Tableau", annex: "Annexe" };

  function parseDirectiveParts(raw) {
    return String(raw || "").split("|").map(s => s.trim()).filter(Boolean);
  }

  function parseDirectiveOpts(raw) {
    const parts = parseDirectiveParts(raw);
    const opts = { _path: parts[0] || "" };
    for (let i = 1; i < parts.length; i++) {
      const idx = parts[i].indexOf(":");
      if (idx <= 0) continue;
      const key = parts[i].slice(0, idx).trim().toLowerCase();
      const val = parts[i].slice(idx + 1).trim();
      if (key) opts[key] = val;
    }
    return opts;
  }

  function inferKindFromCaption(caption) {
    const value = String(caption || "").trim();
    if (/^annexe\b/i.test(value)) return "annex";
    if (/^(tableau|table)\b/i.test(value)) return "table";
    if (/^figure\b/i.test(value)) return "figure";
    return "figure";
  }

  function captionToTitle(caption) {
    return String(caption || "")
      .trim()
      .replace(/[–—]/g, "-")
      .replace(/^(Figure|Tableau|Table|Annexe)\s*(?:[A-Za-z0-9.]+)?\s*[:-]+\s*/i, "")
      .trim();
  }

  function getLabel(kind, text) {
    const lower = (kind || "").toLowerCase();
    if (LABELS[lower]) return LABELS[lower];
    const m = (text || "").trim().match(/^(Figure|Tableau|Table|Annexe)\b/i);
    if (m) return /^table$/i.test(m[1]) ? "Tableau" : m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    return null;
  }

  function consumeNum(kind) {
    const k = (kind || "").toLowerCase();
    if (k === "annex") { const i = state.annexIndex++; return String.fromCharCode(65 + (i % 26)); }
    if (k === "figure") return String(++state.figureIndex);
    if (k === "table")  return String(++state.tableIndex);
    return null;
  }

  function makeCaptionText(kind, title) {
    const label = getLabel(kind, title);
    const num   = consumeNum(kind);
    if (label && num) return `${label} ${num}${title ? ` - ${title}` : ""}`;
    return title || "";
  }

  function visit(filePath, stack) {
    const normalized = path.resolve(filePath);
    if (stack.has(normalized)) return;
    stack.add(normalized);
    const text  = readTextFile(normalized);
    const lines = text.split(/\r?\n/);
    const dir   = path.dirname(normalized);
    let pending = null;

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();

      const hMatch = t.match(/^#{1}\s+(.+)$/);
      if (hMatch && !hasNoNumberModifier(hMatch[1])) state.chapterIndex = (state.chapterIndex || 0) + 1;

      // @element directive
      const elemMatch = t.match(/^<!--\s*@element:\s*(.+?)\s*-->$/i);
      if (elemMatch) {
        const parts = elemMatch[1].split("|").map(s => s.trim());
        let kind, title;
        // New syntax: "type: figure | title: …"
        const typeOpt = parts.find(p => /^type:/i.test(p));
        const titleOpt = parts.find(p => /^title:/i.test(p));
        if (typeOpt || titleOpt) {
          kind  = typeOpt  ? typeOpt.replace(/^type:\s*/i, "").toLowerCase()  : parts[0].toLowerCase();
          title = titleOpt ? titleOpt.replace(/^title:\s*/i, "")              : "";
        } else {
          // Old syntax: "figure | title: …"
          kind  = parts[0].split(" ")[0].toLowerCase();
          const titlePart = parts.find(p => /^title:/i.test(p));
          title = titlePart ? titlePart.replace(/^title:\s*/i, "") : "";
        }
        if (kind === "annex") {
          entries.push({ kind: "annex", text: makeCaptionText("annex", title) });
          pending = null;
        } else {
          pending = { kind, title };
        }
        continue;
      }

      // @import directive
      const importMatch = t.match(/^<!--\s*@import:\s*(.+?)\s*-->$/);
      if (importMatch) {
        const importOpts = parseDirectiveOpts(importMatch[1]);
        const relPath = importOpts._path || "";
        const abs = relPath ? path.resolve(dir, relPath) : "";
        const ext = abs ? path.extname(abs).toLowerCase() : "";

        const isMedia = IMAGE_EXTS.has(ext) || ext === ".js" || ext === ".py" || ext === ".ts";
        if (pending && isMedia) {
          entries.push({ kind: pending.kind, text: makeCaptionText(pending.kind, pending.title) });
          pending = null;
        } else if (isMedia && importOpts.caption) {
          const kind = inferKindFromCaption(importOpts.caption);
          const title = captionToTitle(importOpts.caption);
          entries.push({ kind, text: makeCaptionText(kind, title) });
        }
        if ((ext === ".md" || ext === ".txt") && abs && fs.existsSync(abs)) visit(abs, stack);
        if (pending) pending = null;
        continue;
      }

      // Inline image
      const imgMatch = t.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch && pending) {
        entries.push({ kind: pending.kind, text: makeCaptionText(pending.kind, pending.title) });
        pending = null;
        continue;
      }

      // Table
      if (t.startsWith("|")) {
        while (i < lines.length && lines[i].trim().startsWith("|")) i++;
        i--;
        if (pending && (pending.kind === "table" || pending.kind === "figure")) {
          entries.push({ kind: pending.kind, text: makeCaptionText(pending.kind, pending.title) });
          pending = null;
        }
        continue;
      }

      // Blank line resets pending
      if (!t && pending && pending.kind !== "annex") pending = null;
    }
    stack.delete(normalized);
  }

  visit(entryPath, new Set());
  return entries;
}

// ─── Cover page builders ──────────────────────────────────────────────────────

function buildCoverParagraph(entry, FONT, colors, vars) {
  function subVars(text) {
    if (!text || typeof text !== "string") return text;
    return text.replace(/\{\{([\w.]+)\}\}/g, (_, k) => (vars && k in vars ? String(vars[k]) : `{{${k}}}`));
  }
  const STYLE_DEFS = {
    overline:     { size: 20, color: colors.note      || "555555" },
    institution:  { size: 22, color: colors.primary   || "1F3864", bold: true },
    banner:       { size: 32, color: colors.primary   || "1F3864", bold: true, allCaps: true },
    title:        { size: 28, color: colors.primary   || "1F3864", bold: true },
    subtitle:     { size: 22, color: colors.secondary || "2E4C7E" },
    chapterTitle: { size: 24, color: colors.accent    || "2E75B6", bold: true },
    year:         { size: 20, color: colors.note      || "555555", italics: true },
  };

  if ("spacer" in entry) {
    return new Paragraph({ children: [new TextRun("")], spacing: { before: entry.spacer, after: 0 } });
  }

  const def = STYLE_DEFS[entry.style] || {};
  const sz  = entry.size  ? entry.size * 2  : (def.size  || 22);
  const clr = entry.color || def.color  || "1A1A1A";
  const run = {
    font:    entry.font    || FONT,
    size:    sz, color: clr,
    bold:    entry.bold    ?? def.bold    ?? false,
    italics: entry.italics ?? def.italics ?? false,
    allCaps: entry.allCaps ?? def.allCaps ?? false,
  };

  const children = [];
  (subVars(entry.text) || "").split("\n").forEach((line, i) => {
    if (i > 0) children.push(new TextRun({ break: 1 }));
    children.push(new TextRun({ ...run, text: line }));
  });

  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: entry.after ?? 120 }, children });
}

// ─── Multi-section split ──────────────────────────────────────────────────────

/**
 * Split a flat element array at SECTION_BREAK markers.
 * Returns [{ elements, sectionBreak }] where sectionBreak is the marker object (or null for first).
 */
function splitAtSectionBreaks(elements) {
  const segments = [];
  let current = [];
  let currentBreak = null;

  for (const el of elements) {
    if (el && el._type === "SECTION_BREAK") {
      segments.push({ elements: current, sectionBreak: currentBreak });
      current = [];
      currentBreak = el;
    } else {
      current.push(el);
    }
  }
  segments.push({ elements: current, sectionBreak: currentBreak });
  return segments;
}

// ─── Main build function ──────────────────────────────────────────────────────

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

  if (warnings.length) {
    warnings.forEach(w => log.warn(w, "E004"));
  }
  if (!valid) {
    const err = new Error("Invalid project.config.js — fix the errors above and retry.");
    err.validationErrors = errors;
    throw err;
  }

  // ── Setup ─────────────────────────────────────────────────────────────────
  const projectDir     = rawConfig._dir;
  const globalPageConf = computePageConfig(cfg.page);

  // Merge global vars (config) with nothing yet — document vars added at parse time
  const globalVars = Object.assign({}, cfg.vars || {});

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
  const mdText     = readTextFile(inputPath);
  const allElements = parseFn(mdText, path.dirname(inputPath));

  // ── Split into sections at SECTION_BREAK markers ──────────────────────────
  const segments = splitAtSectionBreaks(allElements);

  // ── Cover ─────────────────────────────────────────────────────────────────
  const coverPath = typeof cfg.cover === "string" ? path.resolve(projectDir, cfg.cover) : null;
  const coverText = coverPath && fs.existsSync(coverPath) ? readTextFile(coverPath) : null;
  if (coverPath && !coverText) log.warn(`Cover file not found: ${coverPath}`, "W001");

  const coverElements = coverText
    ? parseFn(coverText, path.dirname(coverPath))
    : (Array.isArray(cfg.cover) ? cfg.cover.map(e => buildCoverParagraph(e, R.FONT, cfg.theme.colors || {}, globalVars)) : []);

  if (!coverElements.length) {
    coverElements.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children:  [new TextRun({ text: cfg.name, font: R.FONT, size: 48, bold: true, color: R.COLOR.H1 })],
    }));
  }

  // ── Build header & footer ─────────────────────────────────────────────────
  const globalHeader = buildHeader(cfg, cfg.theme.colors || {}, R.FONT, cfg.theme.fontSize || {});
  const globalFooter = buildFooter(cfg, cfg.theme.colors || {}, R.FONT, cfg.theme.fontSize || {});

  const pageNumFormat = PAGE_FORMAT_MAP[cfg.page.pageNumbers.format] || NumberFormat.DECIMAL;
  const pageNumStart  = cfg.page.pageNumbers.start;

  // ── Resolve section-level config overrides ────────────────────────────────
  const sectionOverrides = Array.isArray(cfg.sections) ? cfg.sections : [];

  function getSectionOverride(sectionBreak, index) {
    // Match by id first (when section marker has an id), then by index.
    // Index-based matching also supports the first body segment, which has no
    // preceding SECTION_BREAK marker.
    return (sectionBreak
      ? sectionOverrides.find(s => s.id && s.id === sectionBreak.id)
      : null)
      || sectionOverrides[index]
      || null;
  }

  // ── Assemble DOCX sections ────────────────────────────────────────────────
  const meta = cfg.meta || {};
  const docSections = [];

  // Section 0: cover (no header/footer/page numbers)
  docSections.push({
    properties: {
      type: SectionType.NEXT_PAGE,
      page: { size: globalPageConf.size, margin: globalPageConf.margin },
    },
    children: coverElements,
  });

  // Body sections (index 0 = first body segment, etc.)
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
      // Backward-compatible behavior: first body segment starts numbering unless
      // overridden by section-level pagination config.
      sectionPageNumbers = { start: pageNumStart, formatType: pageNumFormat };
    }

    // Override header/footer if specified on the section
    let sectionHeader = globalHeader;
    let sectionFooter = globalFooter;
    if (sectionBreak?.header || override?.header) {
      const hCfg = typeof (sectionBreak?.header || override?.header) === "string"
        ? { text: sectionBreak?.header || override?.header, align: "center", paragraphs: [] }
        : (sectionBreak?.header || override?.header);
      sectionHeader = buildHeader({ header: hCfg }, cfg.theme.colors || {}, R.FONT, cfg.theme.fontSize || {});
    }
    if (sectionBreak?.footer || override?.footer) {
      const fCfg = typeof (sectionBreak?.footer || override?.footer) === "string"
        ? { text: sectionBreak?.footer || override?.footer, align: "center", showPageNumbers: true, paragraphs: [] }
        : (sectionBreak?.footer || override?.footer);
      sectionFooter = buildFooter({ footer: fCfg }, cfg.theme.colors || {}, R.FONT, cfg.theme.fontSize || {});
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
        page: {
          size:    pageConf.size,
          margin,
          pageNumbers: sectionPageNumbers,
        },
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

module.exports = { buildFromConfig, collectTocEntries, collectElementEntries };
