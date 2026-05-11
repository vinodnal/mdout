/**
 * project.config.js — Simple document project
 *
 * Edit this file to configure your document.
 * Run "mdoc build ." from this directory to compile.
 */
"use strict";

module.exports = {
  // ── Document metadata ──────────────────────────────────────────────────────
  name: "My Document",

  meta: {
    author:   "Your Name",
    subject:  "A simple document",
    keywords: ["document", "mdoc"],
  },

  // ── Input & output ─────────────────────────────────────────────────────────
  input:  "index.md",
  output: "output/document.docx",

  // ── Page layout ────────────────────────────────────────────────────────────
  page: {
    size:    "A4",
    margins: { top: 25, right: 20, bottom: 25, left: 25 },
    pageNumbers: { start: 1, format: "decimal" },
  },

  // ── Header & footer ────────────────────────────────────────────────────────
  header: {
    text:  "My Document",
    align: "center",
  },

  footer: {
    text:            "My Document",
    align:           "center",
    showPageNumbers: true,
  },

  // ── Template variables (use {{name}} in .md files) ─────────────────────────
  vars: {
    author: "Your Name",
    year:   new Date().getFullYear(),
  },

  // ── Visual theme ───────────────────────────────────────────────────────────
  theme: {
    fonts: {
      body: "Calibri",
      code: "Courier New",
      math: "Cambria Math",
    },
    fontSize: {
      body:    11,
      h1:      18,
      h2:      14,
      h3:      12,
      h4:      11,
      caption:  9,
      code:     9,
    },
    colors: {
      primary:   "1F3864",
      secondary: "2E4C7E",
      accent:    "2E75B6",
    },
    spacing: {
      paragraphLine:  320,
      paragraphAfter: 120,
    },
  },
};
