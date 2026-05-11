// core/builder.js — backward-compat shim. Delegates to src/builder.js.
module.exports = require("../src/builder");
// Original implementation preserved below for reference only (not executed).
// ─────────────────────────────────────────────────────────────────────────────
/** @deprecated Use require('mdoc/src/builder') directly.
 * core/builder.js
 * Validates a project config and assembles the DOCX output.
 *
 * Usage:
 *   const { buildFromConfig } = require('./core/builder');
 *   const raw = require('./projects/my-project/project.config.js');
 *   raw._dir = path.resolve('./projects/my-project');
 *   await buildFromConfig(raw);
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun,
  Header, Footer, AlignmentType, BorderStyle,
  PageNumber, NumberFormat, SectionType,
} = require("docx");

const { validateConfig }  = require("./schema");
const { createRenderer }  = require("./docx-renderer");
const { parseMD }         = require("./md-parser");
const { createImporter }  = require("./importer");

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
  left:   AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right:  AlignmentType.RIGHT,
};

function mmToDXA(mm) { return Math.round(mm * 56.69); }

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

function readTextFileWithRetry(filePath) {
  return retrySync(() => fs.readFileSync(filePath, "utf-8"));
}

function readBinaryFileWithRetry(filePath) {
  return retrySync(() => fs.readFileSync(filePath));
}

function writeFileAtomicWithRetry(filePath, buffer) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, buffer);

  try {
    retrySync(() => {
      try {
        fs.rmSync(filePath, { force: true });
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
      fs.renameSync(tempPath, filePath);
    });
  } catch (err) {
    try { if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true }); } catch { /* ignore */ }
    throw err;
  }
}

function mapDynamicField(field) {
  if (field === "PAGE_CURRENT") return [PageNumber.CURRENT];
  if (field === "PAGE_TOTAL") return [PageNumber.TOTAL_PAGES];
  return null;
}

function makeRuns(runs, defaults) {
  const out = [];
  for (const run of runs || []) {
    const children = run.field ? mapDynamicField(run.field) : undefined;
    out.push(new TextRun({
      text: run.text,
      children,
      font: run.font ?? defaults.font,
      size: run.size ? run.size * 2 : defaults.size,
      color: run.color ?? defaults.color,
      bold: run.bold ?? defaults.bold,
      italics: run.italics ?? defaults.italics,
      allCaps: run.allCaps ?? defaults.allCaps,
      break: run.break,
    }));
  }
  return out;
}

function computePageConfig(page) {
  const rawSize = page.size;
  const size = typeof rawSize === "string"
    ? PAGE_SIZES_DXA[rawSize] || PAGE_SIZES_DXA.A4
    : { width: mmToDXA(rawSize.width), height: mmToDXA(rawSize.height) };

  const rawMarg = page.margins;
  const margin  = typeof rawMarg === "number"
    ? { top: mmToDXA(rawMarg), right: mmToDXA(rawMarg), bottom: mmToDXA(rawMarg), left: mmToDXA(rawMarg) }
    : { top: mmToDXA(rawMarg.top), right: mmToDXA(rawMarg.right), bottom: mmToDXA(rawMarg.bottom), left: mmToDXA(rawMarg.left) };

  return { size, margin, contentWidth: size.width - margin.left - margin.right };
}

function collectTocEntriesFromMarkdown(entryPath) {
  const entries = [];
  const counters = [0, 0, 0, 0];

  function toRoman(value) {
    const map = [
      [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
      [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
      [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
    ];
    let n = Math.max(1, value);
    let out = "";
    for (const [amount, symbol] of map) {
      while (n >= amount) {
        out += symbol;
        n -= amount;
      }
    }
    return out;
  }

  function computeHeadingNumber(level) {
    if (level === 1) return `${toRoman(counters[0])}.`;
    if (level === 2) return `${counters[1]}.`;
    if (level === 3) return `${counters[1]}.${counters[2]}.`;
    return `${counters[1]}.${counters[2]}.${counters[3]}.`;
  }

  function visit(filePath, stack) {
    const normalized = path.resolve(filePath);
    if (stack.has(normalized)) return;

    stack.add(normalized);
    const text = readTextFileWithRetry(normalized);
    const lines = text.split(/\r?\n/);
    const dir = path.dirname(normalized);

    for (const line of lines) {
      const trimmed = line.trim();

      const importMatch = trimmed.match(/^<!--\s*@import:\s*(.+?)\s*-->$/);
      if (importMatch) {
        const directive = importMatch[1];
        const relPath = directive.split("|")[0].trim();
        if (relPath) {
          const absImport = path.resolve(dir, relPath);
          const ext = path.extname(absImport).toLowerCase();
          if ((ext === ".md" || ext === ".txt") && fs.existsSync(absImport)) {
            visit(absImport, stack);
          }
        }
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (!headingMatch) continue;

      const level = headingMatch[1].length;
      const rawTitle = headingMatch[2].trim();
      const noNum = /\{\s*\.no-num(?:ber)?\s*\}/.test(rawTitle);
      if (noNum) continue;

      counters[level - 1] += 1;
      for (let idx = level; idx < counters.length; idx += 1) counters[idx] = 0;

      const title = rawTitle
        .replace(/\s*\{\s*\.no-num(?:ber)?\s*\}/g, "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .trim();

      if (!title) continue;
      entries.push({ title: `${computeHeadingNumber(level)} ${title}`, level });
    }

    stack.delete(normalized);
  }

  visit(entryPath, new Set());
  return entries;
}

function collectElementEntriesFromMarkdown(entryPath) {
  const entries = [];
  const state = {
    chapterIndex: 0,
    figureIndex: 0,
    tableIndex: 0,
    annexIndex: 0,
  };

  const CAPTION_LABELS = {
    figure: "Figure",
    table: "Tableau",
    annex: "Annexe",
  };

  function getCaptionLabel(kind, text) {
    const lower = String(kind || "").toLowerCase();
    if (CAPTION_LABELS[lower]) return CAPTION_LABELS[lower];
    const match = String(text || "").trim().match(/^(Figure|Tableau|Table|Annexe)\b/i);
    if (match) {
      if (/^table$/i.test(match[1])) return "Tableau";
      return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
    }
    return null;
  }

  function consumeElementNumber(kind) {
    const lower = String(kind || "").toLowerCase();
    if (lower === "annex") {
      const index = Math.max(0, Number(state.annexIndex || 0));
      state.annexIndex = index + 1;
      return String.fromCharCode(65 + (index % 26));
    }

    if (lower === "figure") {
      const index = Math.max(0, Number(state.figureIndex || 0));
      state.figureIndex = index + 1;
      return String(index + 1);
    }
    if (lower === "table") {
      const index = Math.max(0, Number(state.tableIndex || 0));
      state.tableIndex = index + 1;
      return String(index + 1);
    }
    return null;
  }

  function parseCaptionSpec(text, opts = {}) {
    const raw = String(text || "").trim().replace(/\s+/g, " ");
    const normalizedRaw = raw.replace(/[–—]/g, "-");
    const explicitKind = opts.kind ? String(opts.kind).toLowerCase() : null;
    const label = getCaptionLabel(explicitKind, raw);
    const prefixRe = /^(Figure|Tableau|Table|Annexe)\s*(?:[A-Za-z0-9.]+)?\s*[:-]+\s*/i;
    let title = raw;

    if (!explicitKind) {
      const match = normalizedRaw.match(prefixRe);
      if (match) title = raw.slice(match[0].length).trim();
    }

    return {
      kind: explicitKind || (label ? label.toLowerCase() : null),
      label,
      title,
    };
  }

  function makeCaptionText(text, opts = {}) {
    const spec = parseCaptionSpec(text, opts);
    const label = spec.label || getCaptionLabel(opts.kind, spec.title);
    const number = consumeElementNumber(spec.kind || opts.kind);

    if (label && number) return `${label} ${number}${spec.title ? ` - ${spec.title}` : ""}`;
    if (label) return spec.title ? `${label} - ${spec.title}` : label;
    return spec.title || String(text || "");
  }

  function addEntry(kind, title) {
    const normalizedKind = String(kind || "").toLowerCase();
    if (!CAPTION_LABELS[normalizedKind]) return;
    entries.push({
      kind: normalizedKind,
      text: makeCaptionText(title, { kind: normalizedKind }),
    });
  }

  function parseImportDirective(directive) {
    const parts = String(directive || "").split("|").map(s => s.trim());
    const relPath = parts[0] || "";
    const importOpts = {};
    for (let i = 1; i < parts.length; i += 1) {
      const sep = parts[i].indexOf(":");
      if (sep > 0) importOpts[parts[i].slice(0, sep).trim()] = parts[i].slice(sep + 1).trim();
    }
    return { relPath, importOpts };
  }

  function visit(filePath, stack) {
    const normalized = path.resolve(filePath);
    if (stack.has(normalized)) return;

    stack.add(normalized);
    const text = readTextFileWithRetry(normalized);
    const lines = text.split(/\r?\n/);
    const dir = path.dirname(normalized);
    let pendingElement = null;

    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i];
      const trimmed = raw.trim();

      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const rawTitle = headingMatch[2];
        const noNum = /\{\s*\.no-num(?:ber)?\s*\}/.test(rawTitle);
        if (!noNum && level === 1) {
          state.chapterIndex += 1;
        }
      }

      const elementMatch = trimmed.match(/^<!--\s*@element:\s*(figure|table|annex)\s*\|\s*title:\s*(.+?)\s*-->$/i);
      if (elementMatch) {
        const kind = elementMatch[1].toLowerCase();
        const title = elementMatch[2].trim();
        if (kind === "annex") {
          addEntry("annex", title);
          pendingElement = null;
        } else {
          pendingElement = { kind, title };
        }
        continue;
      }

      const importMatch = trimmed.match(/^<!--\s*@import:\s*(.+?)\s*-->$/);
      if (importMatch) {
        const { relPath, importOpts } = parseImportDirective(importMatch[1]);
        const absImport = relPath ? path.resolve(dir, relPath) : "";
        const ext = path.extname(absImport).toLowerCase();

        if (pendingElement && (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif" || ext === ".bmp" || ext === ".webp" || ext === ".js" || ext === ".py" || ext === ".ts")) {
          addEntry(pendingElement.kind, pendingElement.title);
        } else if (!pendingElement && importOpts.caption && (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif" || ext === ".bmp" || ext === ".webp" || ext === ".js" || ext === ".py" || ext === ".ts")) {
          const label = getCaptionLabel(null, importOpts.caption);
          addEntry(label ? label.toLowerCase() : "figure", importOpts.caption);
        }

        if ((ext === ".md" || ext === ".txt") && absImport && fs.existsSync(absImport)) {
          visit(absImport, stack);
        }

        if (pendingElement && pendingElement.kind !== "annex") pendingElement = null;
        continue;
      }

      const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch && pendingElement) {
        addEntry(pendingElement.kind, pendingElement.title);
        pendingElement = null;
        continue;
      }

      if (trimmed.startsWith("|")) {
        while (i < lines.length && lines[i].trim().startsWith("|")) i += 1;
        i -= 1;
        if (pendingElement && (pendingElement.kind === "table" || pendingElement.kind === "figure")) {
          addEntry(pendingElement.kind, pendingElement.title);
          pendingElement = null;
        }
        continue;
      }

      if (trimmed.startsWith("*Figure") || trimmed.startsWith("*Tableau") || trimmed.startsWith("*Graphique") || trimmed.startsWith("*Annexe")) {
        const clean = trimmed.replace(/^\*/, "").replace(/\*$/, "").trim();
        const label = getCaptionLabel(null, clean);
        if (label) addEntry(label.toLowerCase(), clean);
        continue;
      }

      if (!trimmed && pendingElement && pendingElement.kind !== "annex") {
        pendingElement = null;
      }
    }

    stack.delete(normalized);
  }

  visit(entryPath, new Set());
  return entries;
}

// ─── Cover page ───────────────────────────────────────────────────────────────

function buildCoverParagraph(entry, font, colors) {
  // Predefined styles — colors reference the validated theme
  const STYLE_DEFS = {
    overline:     { size: 20, color: colors.note     || "555555" },
    institution:  { size: 22, color: colors.primary  || "1F3864", bold: true },
    banner:       { size: 32, color: colors.primary  || "1F3864", bold: true, allCaps: true },
    title:        { size: 28, color: colors.primary  || "1F3864", bold: true },
    subtitle:     { size: 22, color: colors.secondary|| "2E4C7E" },
    chapterTitle: { size: 24, color: colors.accent   || "2E75B6", bold: true },
    year:         { size: 20, color: colors.note     || "555555", italics: true },
  };

  if ("spacer" in entry) {
    return new Paragraph({ children: [new TextRun("")], spacing: { before: entry.spacer, after: 0 } });
  }

  const def  = STYLE_DEFS[entry.style] || {};
  const sz   = entry.size  ? entry.size * 2  : (def.size  || 22);   // half-points
  const clr  = entry.color || def.color  || "1A1A1A";
  const run  = {
    font:    entry.font    || font,
    size:    sz,
    color:   clr,
    bold:    entry.bold    ?? def.bold    ?? false,
    italics: entry.italics ?? def.italics ?? false,
    allCaps: entry.allCaps ?? def.allCaps ?? false,
  };

  const children = [];
  (entry.text || "").split("\n").forEach((line, i) => {
    if (i > 0) children.push(new TextRun({ break: 1 }));
    children.push(new TextRun({ ...run, text: line }));
  });

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { after: entry.after ?? 120 },
    children,
  });
}

// ─── Header & Footer ──────────────────────────────────────────────────────────

function buildHeader(cfg, C, FONT, fsMap) {
  const h       = cfg.header; // always an object after validation
  const hdrFS   = (fsMap.header || 9) * 2;
  const richParagraphs = Array.isArray(h.paragraphs) ? h.paragraphs : [];

  if (richParagraphs.length) {
    const children = richParagraphs.map((p, idx) => new Paragraph({
      alignment: ALIGN_MAP[p.align || h.align] || AlignmentType.CENTER,
      border: idx === 0 ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.H2, space: 8 } } : undefined,
      spacing: {
        before: p.spacingBefore ?? (idx === 0 ? 0 : 40),
        after: p.spacingAfter ?? 80,
      },
      children: makeRuns(p.runs, { font: FONT, size: hdrFS, color: C.H2, bold: true, italics: false, allCaps: false }),
    }));

    return new Header({ children });
  }

  return new Header({
    children: [new Paragraph({
      alignment: ALIGN_MAP[h.align] || AlignmentType.CENTER,
      border:    { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.H2, space: 8 } },
      spacing:   { before: 0, after: 120 },
      children:  [new TextRun({ text: h.text, font: FONT, size: hdrFS, color: C.H2, bold: true })],
    })],
  });
}

function buildFooter(cfg, C, FONT, fsMap) {
  const f     = cfg.footer; // always an object after validation
  const ftrFS = (fsMap.footer || 9) * 2;
  const richParagraphs = Array.isArray(f.paragraphs) ? f.paragraphs : [];

  if (richParagraphs.length) {
    const children = richParagraphs.map((p, idx) => new Paragraph({
      alignment: ALIGN_MAP[p.align || f.align] || AlignmentType.CENTER,
      border: idx === 0 ? { top: { style: BorderStyle.SINGLE, size: 4, color: C.H2, space: 8 } } : undefined,
      spacing: {
        before: p.spacingBefore ?? (idx === 0 ? 80 : 40),
        after: p.spacingAfter ?? 0,
      },
      children: makeRuns(p.runs, { font: FONT, size: ftrFS, color: C.NOTE, bold: false, italics: false, allCaps: false }),
    }));

    return new Footer({ children });
  }

  const children = [];
  if (f.text) {
    children.push(new TextRun({
      text:  f.showPageNumbers ? f.text + "  —  " : f.text,
      font: FONT, size: ftrFS, color: C.NOTE,
    }));
  }
  if (f.showPageNumbers) {
    children.push(new TextRun({ children: [PageNumber.CURRENT],   font: FONT, size: ftrFS, color: C.ACCENT, bold: true }));
    children.push(new TextRun({ text: " / ",                      font: FONT, size: ftrFS, color: C.NOTE }));
    children.push(new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: ftrFS, color: C.NOTE }));
  }

  return new Footer({
    children: [new Paragraph({
      alignment: ALIGN_MAP[f.align] || AlignmentType.CENTER,
      border:    { top: { style: BorderStyle.SINGLE, size: 4, color: C.H2, space: 8 } },
      spacing:   { before: 80, after: 0 },
      children,
    })],
  });
}

// ─── Main build function ──────────────────────────────────────────────────────

async function buildFromConfig(rawConfig, opts = {}) {
  const log = opts.logger || {
    info:  (...a) => console.log(...a),
    warn:  (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
    debug: () => {},
    step:  (...a) => console.log(...a),
  };
  const artifactPaths = new Set();
  const recordArtifact = typeof opts.trackArtifact === "function"
    ? (artifactPath) => {
        if (!artifactPath) return;
        const resolved = path.resolve(artifactPath);
        artifactPaths.add(resolved);
        opts.trackArtifact(resolved);
      }
    : (artifactPath) => {
        if (!artifactPath) return;
        artifactPaths.add(path.resolve(artifactPath));
      };

  // ── Validate ───────────────────────────────────────────────────────────────
  const { valid, errors, warnings, config: cfg } = validateConfig(rawConfig);

  if (warnings.length) {
    log.warn("Warnings:");
    warnings.forEach(w => log.warn(`  ${w}`));
  }
  if (!valid) {
    const err = new Error("Invalid project.config.js — fix the errors above and retry.");
    err.validationErrors = errors;
    throw err;
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  const projectDir = rawConfig._dir;
  const pageConf   = computePageConfig(cfg.page);
  const R          = createRenderer(cfg.theme, { contentWidth: pageConf.contentWidth });
  let tocEntries   = [];
  let elementEntries = [];
  const numberingState = {
    chapterIndex: 0,
    figureIndex: 0,
    tableIndex: 0,
    annexIndex: 0,
  };

  // Wire parser ↔ importer (mutual recursion via late binding)
  function parseFn(text, dir) { return parseMD(text, dir, R, importFn, { numberingState, tocEntries, elementEntries }); }
  const importFn = createImporter(R, parseFn, { trackArtifact: recordArtifact, numberingState });

  // ── Parse markdown ─────────────────────────────────────────────────────────
  const inputPath    = path.resolve(projectDir, cfg.input);
  tocEntries         = collectTocEntriesFromMarkdown(inputPath);
  elementEntries     = collectElementEntriesFromMarkdown(inputPath);
  const mdText       = readTextFileWithRetry(inputPath);
  const bodyElements = parseMD(mdText, path.dirname(inputPath), R, importFn, { numberingState, tocEntries, elementEntries });

  // ── Cover ──────────────────────────────────────────────────────────────────
  const coverPath = typeof cfg.cover === "string" ? path.resolve(projectDir, cfg.cover) : null;
  const coverText = coverPath && fs.existsSync(coverPath)
    ? readTextFileWithRetry(coverPath)
    : null;
  if (coverPath && !coverText) {
    log.warn(`Cover file not found or empty: ${coverPath}. Falling back to title-only cover.`);
  }
  const coverElements = coverText
    ? parseMD(coverText, path.dirname(coverPath), R, importFn)
    : cfg.cover.map(entry => buildCoverParagraph(entry, R.FONT, cfg.theme.colors || {}));
  if (!coverElements.length) {
    coverElements.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children:  [new TextRun({ text: cfg.name, font: R.FONT, size: 48, bold: true, color: R.COLOR.H1 })],
    }));
  }

  // ── Header / footer ────────────────────────────────────────────────────────
  const header = buildHeader(cfg, R.COLOR, R.FONT, cfg.theme.fontSize || {});
  const footer = buildFooter(cfg, R.COLOR, R.FONT, cfg.theme.fontSize || {});

  // ── Page numbers ───────────────────────────────────────────────────────────
  const pageNumFormat = PAGE_FORMAT_MAP[cfg.page.pageNumbers.format] || NumberFormat.DECIMAL;
  const pageNumStart  = cfg.page.pageNumbers.start;

  // ── Document ───────────────────────────────────────────────────────────────
  const meta = cfg.meta || {};
  const doc  = new Document({
    creator:     meta.author   || "",
    title:       cfg.name      || "",
    description: meta.subject  || "",
    keywords:    (meta.keywords || []).join(", "),
    features: {
      updateFields: true,
    },
    styles:    R.makeStyles(),
    numbering: R.makeNumbering(),
    sections: [
      // Section 1: Cover page (no header/footer, page numbers not counted)
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: { size: pageConf.size, margin: pageConf.margin },
        },
        children: coverElements,
      },
      // Section 2: Body (header + footer + page numbering)
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size:    pageConf.size,
            margin:  pageConf.margin,
            pageNumbers: { start: pageNumStart, formatType: pageNumFormat },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: bodyElements,
      },
    ],
  });

  // ── Write output ───────────────────────────────────────────────────────────
  const outputPath = path.resolve(projectDir, cfg.output);
  const buffer     = await Packer.toBuffer(doc);
  writeFileAtomicWithRetry(outputPath, buffer);
  recordArtifact(outputPath);

  return {
    outputPath,
    byteLength:   buffer.byteLength,
    elementCount: bodyElements.length,
    coverCount:   coverElements.length,
    artifactPaths: [...artifactPaths],
  };
}

module.exports = { buildFromConfig };
