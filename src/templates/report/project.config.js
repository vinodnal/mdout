/**
 * project.config.js — Report template
 *
 * For technical reports with cover page, numbered sections, and figure lists.
 */
"use strict";

module.exports = {
  name: "Technical Report",

  meta: {
    author:   "Author Name",
    subject:  "Technical report",
    keywords: ["report", "technical"],
  },

  cover: "cover.md",
  input: "index.md",
  output: "output/report.docx",

  page: {
    size:    "A4",
    margins: { top: 25, right: 20, bottom: 25, left: 30 },
    pageNumbers: { start: 1, format: "decimal" },
  },

  header: {
    paragraphs: [
      {
        align: "center",
        runs: [{ text: "Technical Report — {{year}}", bold: true }],
      },
    ],
  },

  footer: {
    align: "center",
    text:  "Technical Report",
    showPageNumbers: true,
  },

  vars: {
    author:       "Author Name",
    institution:  "Institution Name",
    year:         new Date().getFullYear(),
    reportNumber: "TR-001",
  },

  theme: {
    fonts: { body: "Calibri", code: "Courier New", math: "Cambria Math" },
    fontSize: { body: 11, h1: 18, h2: 14, h3: 12, h4: 11, caption: 9, code: 9 },
    colors: {
      primary:   "1A3557",
      secondary: "2B5797",
      accent:    "3A7EBF",
    },
    spacing: {
      paragraphLine:  320,
      paragraphAfter: 120,
    },
  },
};
