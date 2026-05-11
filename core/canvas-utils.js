// core/canvas-utils.js — backward-compat shim. Delegates to src/canvas-utils.js.
module.exports = require("../src/canvas-utils");
// ─── Original implementation below (not executed) ────────────────────────────
/** @deprecated Use require('../../../src/canvas-utils') or the mdoc package directly.
 * core/canvas-utils.js
 * Shared canvas drawing utilities for figure scripts.
 * Each figure script requires this instead of duplicating primitives.
 *
 * Usage:
 *   const u = require('../../../core/canvas-utils');
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

/**
 * Draw a labeled rounded box.
 * @param {string[]} lines  — text lines (first line is bold by default)
 * @param {object}   opts   — { shadow, radius, lineHeight, fontSize }
 */
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
    ctx.fillStyle = labelColor;
    ctx.font = "9.5px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, (x1 + x2) / 2, Math.min(y1, y2) - 3);
  }
}

// ─── Dot ──────────────────────────────────────────────────────────────────────

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

// ─── Output ───────────────────────────────────────────────────────────────────

function saveAndPrint(canvas, outPath) {
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  process.stdout.write(outPath);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  createCanvas,
  background,
  title,
  chartArea,
  hGrid,
  axes,
  roundRect,
  drawBox,
  drawArrow,
  drawDot,
  rotatedLabel,
  saveAndPrint,
};
