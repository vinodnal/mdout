/**
 * project.config.js — Manual/documentation template
 */
"use strict";

module.exports = {
  name: "User Manual",

  meta: {
    author:   "Author Name",
    subject:  "User documentation",
    keywords: ["manual", "documentation", "guide"],
  },

  input:  "index.md",
  output: "output/manual.docx",

  page: {
    size:    "A4",
    margins: { top: 20, right: 20, bottom: 20, left: 25 },
    pageNumbers: { start: 1, format: "decimal" },
  },

  header: {
    text:  "{{name}} — v{{version}}",
    align: "center",
  },

  footer: {
    text:            "{{name}}",
    align:           "center",
    showPageNumbers: true,
  },

  vars: {
    product: "My Product",
    version: "1.0.0",
    author:  "Author Name",
    year:    new Date().getFullYear(),
  },

  theme: {
    fonts: { body: "Segoe UI", code: "Consolas", math: "Cambria Math" },
    fontSize: { body: 11, h1: 18, h2: 14, h3: 12, h4: 11, caption: 9, code: 9 },
    colors: {
      primary:   "005A9C",
      secondary: "0078D4",
      accent:    "00BCF2",
    },
    spacing: {
      paragraphLine:  320,
      paragraphAfter: 120,
    },
  },
};
