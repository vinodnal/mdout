/**
 * src/renderer/table.js
 * Pipe-table parsing and rendering to docx Table objects.
 */
"use strict";

const {
  Table, TableRow, TableCell, Paragraph, TextRun,
  BorderStyle, WidthType, ShadingType, VerticalAlign,
} = require("docx");

/**
 * Create the table renderer.
 *
 * @param {object} ctx
 * @param {object}   ctx.C              Color map from buildColors()
 * @param {string}   ctx.FONT           Body font name
 * @param {number}   ctx.FS             Body font size in half-points
 * @param {number}   ctx.CONTENT_W      Available content width in DXA
 * @param {Function} ctx.applyVars      Variable substitution function
 * @param {Function} ctx.parseInlineRuns  Inline run parser
 * @returns {{ parseTable }}
 */
function createTableRenderer({ C, FONT, FS, CONTENT_W, applyVars, parseInlineRuns }) {

  function cellBorders(color = C.BORDER) {
    const b = { style: BorderStyle.SINGLE, size: 4, color };
    return { top: b, bottom: b, left: b, right: b };
  }

  /**
   * Split a Markdown table row string into cell content strings.
   * Handles escaped pipes (\|) and pipes inside inline math ($...$) and code (`...`).
   */
  function splitTableRow(line) {
    const raw = String(line || "").trim();
    if (!raw.startsWith("|")) return [];

    const cells = [];
    let current  = "";
    let escaped  = false;
    let inCode   = false;
    let inMath   = false;
    let mathFence = "";

    for (let i = 1; i < raw.length; i++) {
      const ch   = raw[i];
      const next = i + 1 < raw.length ? raw[i + 1] : "";

      if (escaped) { current += ch; escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }

      if (!inMath && ch === "`") {
        inCode = !inCode;
        current += ch;
        continue;
      }

      if (!inCode && ch === "$") {
        const isDouble = next === "$";
        if (!inMath) {
          inMath = true;
          mathFence = isDouble ? "$$" : "$";
          current += mathFence;
          if (isDouble) i++;
          continue;
        }
        if (isDouble && mathFence === "$$") {
          inMath = false; current += "$$"; i++; continue;
        }
        if (!isDouble && mathFence === "$") {
          inMath = false; current += "$"; continue;
        }
      }

      if (ch === "|" && !inCode && !inMath) {
        cells.push(current.trim()); current = ""; continue;
      }
      current += ch;
    }

    if (current.length || !raw.endsWith("|")) cells.push(current.trim());
    return cells;
  }

  /**
   * Parse an array of Markdown table lines into a docx Table.
   * Returns null if no valid rows are found.
   * @param {string[]} lines
   * @returns {Table|null}
   */
  function parseTable(lines) {
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("|")) continue;
      if (/^\|[\s:|-]+\|/.test(line)) continue; // separator row
      const cells = splitTableRow(line);
      rows.push({ cells, isHeader: i === 0 });
    }
    if (!rows.length) return null;

    const colCount  = Math.max(...rows.map(r => r.cells.length));
    const maxLens   = Array(colCount).fill(0);
    rows.forEach(row => row.cells.forEach((c, ci) => {
      if (ci < colCount) maxLens[ci] = Math.max(maxLens[ci], c.length);
    }));
    const totalLen  = maxLens.reduce((a, b) => a + b, 0) || 1;
    const colWidths = maxLens.map(len => Math.max(Math.round((len / totalLen) * CONTENT_W), 900));
    const scale     = CONTENT_W / colWidths.reduce((a, b) => a + b, 0);
    for (let k = 0; k < colWidths.length; k++) colWidths[k] = Math.round(colWidths[k] * scale);
    const colWidth  = Math.floor(CONTENT_W / colCount);

    const tableRows = rows.map((row, ri) => {
      const isHdr = ri === 0;
      const fill  = isHdr ? C.HDRFILL : (ri % 2 === 0 ? C.ROWBASE : C.ROWALT);
      const cells = row.cells.map((cell, ci) => {
        const runs = isHdr
          ? [new TextRun({ text: cell.replace(/\*\*/g, ""), bold: true, color: C.HDRTEXT, font: FONT, size: FS - 2 })]
          : parseInlineRuns(applyVars(cell));
        return new TableCell({
          borders:       cellBorders(isHdr ? C.HDRFILL : C.BORDER),
          width:         { size: colWidths[ci] || colWidth, type: WidthType.DXA },
          shading:       { type: ShadingType.CLEAR, fill },
          margins:       { top: 80, bottom: 80, left: 120, right: 120 },
          verticalAlign: VerticalAlign.CENTER,
          children:      [new Paragraph({ children: runs, spacing: { line: 280, after: 0 } })],
        });
      });
      // Pad missing cells
      while (cells.length < colCount) {
        cells.push(new TableCell({
          width:   { size: colWidth, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun("")] })],
        }));
      }
      return new TableRow({ children: cells, tableHeader: isHdr });
    });

    return new Table({
      width:        { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: colWidths,
      rows:         tableRows,
    });
  }

  return { parseTable };
}

module.exports = { createTableRenderer };
