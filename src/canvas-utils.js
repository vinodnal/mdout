/**
 * src/canvas-utils.js
 * Shared canvas drawing utilities for figure scripts.
 *
 * Usage in a figure script:
 *   const u = require('mdoc/src/canvas-utils');
 *   // — or, from a project's figures folder —
 *   const u = require('../../../src/canvas-utils');
 *   const { createCanvas } = u;
 *   const canvas = createCanvas(900, 500);
 *   u.background(ctx, W, H);
 *   u.title(ctx, 'My Chart', W / 2, 28);
 *   u.saveAndPrint(canvas, path.join(__dirname, '_output.png'));
 */
"use strict";

const fs = require("fs");
const { createCanvas } = require("canvas");

// ─── Background ───────────────────────────────────────────────────────────────

function background(ctx, w, h, color = "#FFFFFF") {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

// ─── Title ────────────────────────────────────────────────────────────────────

function title(ctx, text, x, y, { font = "bold 15px sans-serif", color = "#1F3864", align = "center" } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
}

// ─── Subtitle ─────────────────────────────────────────────────────────────────

function subtitle(ctx, text, x, y, { font = "12px sans-serif", color = "#555555", align = "center" } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
}

// ─── Chart area helper ────────────────────────────────────────────────────────

function chartArea(W, H, margin = { top: 50, right: 40, bottom: 70, left: 60 }) {
  const cW = W - margin.left - margin.right;
  const cH = H - margin.top - margin.bottom;
  return { cW, cH, ox: margin.left, oy: margin.top };
}

// ─── Grid lines ───────────────────────────────────────────────────────────────

function hGrid(ctx, ox, oy, cW, cH, ticks = [0, 20, 40, 60, 80, 100], {
  color = "#EEEEEE", labelColor = "#555555", labelFont = "11px sans-serif",
  labelFn = v => v + "%", maxVal = 100,
} = {}) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.font = labelFont;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ticks.forEach(v => {
    const y = oy + cH - (v / maxVal) * cH;
    ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + cW, y); ctx.stroke();
    ctx.fillStyle = labelColor;
    ctx.fillText(labelFn(v), ox - 8, y);
  });
}

function vGrid(ctx, ox, oy, cW, cH, ticks = [], {
  color = "#EEEEEE", labelColor = "#555555", labelFont = "11px sans-serif",
  labelFn = v => v,
} = {}) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.font = labelFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ticks.forEach((v, i) => {
    const x = ox + (i / (ticks.length - 1 || 1)) * cW;
    ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + cH); ctx.stroke();
    ctx.fillStyle = labelColor;
    ctx.fillText(labelFn(v), x, oy + cH + 5);
  });
}

// ─── Axes ─────────────────────────────────────────────────────────────────────

function axes(ctx, ox, oy, cW, cH, { color = "#333", lineWidth = 1.5, arrow = true } = {}) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox, oy + cH);
  ctx.lineTo(ox + cW + (arrow ? 10 : 0), oy + cH);
  ctx.stroke();
  if (arrow) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ox + cW + 10, oy + cH - 6);
    ctx.lineTo(ox + cW + 22, oy + cH);
    ctx.lineTo(ox + cW + 10, oy + cH + 6);
    ctx.fill();
  }
}

// ─── Rounded rect path ────────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r = 6) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Box ──────────────────────────────────────────────────────────────────────

function drawBox(ctx, x, y, w, h, lines, fill, textColor = "#FFFFFF", {
  shadow = true, radius = 8, lineHeight = 16, fontSize = 11.5, bold = true,
} = {}) {
  if (shadow) {
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    roundRect(ctx, x + 3, y + 3, w, h, radius);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const totalH = lines.length * lineHeight;
  const startY = y + h / 2 - totalH / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.font = (bold && i === 0 ? `bold ${fontSize}px` : `${fontSize - 0.5}px`) + " sans-serif";
    ctx.fillText(line, x + w / 2, startY + i * lineHeight);
  });
}

// ─── Arrow ────────────────────────────────────────────────────────────────────

function drawArrow(ctx, x1, y1, x2, y2, {
  color = "#2E75B6", lineWidth = 2, headSize = 9, label = "", labelColor = "#444",
} = {}) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headSize * Math.cos(angle - 0.38), y2 - headSize * Math.sin(angle - 0.38));
  ctx.lineTo(x2 - headSize * Math.cos(angle + 0.38), y2 - headSize * Math.sin(angle + 0.38));
  ctx.closePath();
  ctx.fill();

  if (label) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.fillStyle = labelColor;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx, my - 8);
  }
}

// ─── Dot ─────────────────────────────────────────────────────────────────────

function drawDot(ctx, x, y, r = 5, fill = "#2E75B6", stroke = "#FFFFFF") {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ─── Rotated label ────────────────────────────────────────────────────────────

function rotatedLabel(ctx, text, x, y, angleDeg, { color = "#333", font = "12px sans-serif" } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function drawLegend(ctx, items, x, y, {
  boxSize = 12, gap = 6, rowGap = 20, font = "11px sans-serif", textColor = "#333",
} = {}) {
  ctx.font = font;
  ctx.textBaseline = "middle";
  items.forEach((item, i) => {
    const iy = y + i * rowGap;
    ctx.fillStyle = item.color;
    ctx.fillRect(x, iy - boxSize / 2, boxSize, boxSize);
    ctx.fillStyle = textColor;
    ctx.textAlign = "left";
    ctx.fillText(item.label, x + boxSize + gap, iy);
  });
}

// ─── Save & Print ─────────────────────────────────────────────────────────────

/**
 * Save a canvas to a PNG file and print the absolute path to stdout.
 * The build system reads stdout to embed the image.
 */
function saveAndPrint(canvas, outputPath) {
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  out.on("finish", () => {
    process.stdout.write(outputPath);
  });
  out.on("error", (err) => {
    process.stderr.write(`saveAndPrint error: ${err.message}\n`);
    process.exit(1);
  });
  stream.on("error", (err) => {
    process.stderr.write(`PNG stream error: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  createCanvas,
  background,
  title,
  subtitle,
  chartArea,
  hGrid,
  vGrid,
  axes,
  roundRect,
  drawBox,
  drawArrow,
  drawDot,
  rotatedLabel,
  drawLegend,
  saveAndPrint,
};
