/**
 * project.config.js — Thesis template
 *
 * For academic theses with dedication, abstract, bibliography, and annexes.
 */
"use strict";

module.exports = {
  name: "Master's Thesis",

  meta: {
    author:   "Candidate Name",
    subject:  "Academic thesis",
    keywords: ["thesis", "academic", "research"],
  },

  cover: "cover.md",
  input: "index.md",
  output: "output/thesis.docx",

  page: {
    size:    "A4",
    margins: { top: 25, right: 20, bottom: 25, left: 30 },
    pageNumbers: { start: 1, format: "decimal" },
  },

  header: {
    paragraphs: [{
      align: "center",
      runs: [{ text: "{{university}} — {{year}}", bold: true }],
    }],
  },

  footer: {
    text:            "{{name}}",
    align:           "center",
    showPageNumbers: true,
  },

  vars: {
    candidate:  "Candidate Name",
    supervisor: "Supervisor Name",
    university: "University Name",
    department: "Department of Engineering",
    year:       new Date().getFullYear(),
    field:      "Field of Study",
  },

  theme: {
    fonts: { body: "Times New Roman", code: "Courier New", math: "Cambria Math" },
    fontSize: { body: 12, h1: 18, h2: 14, h3: 12, h4: 12, caption: 10, code: 10 },
    colors: {
      primary:   "1F3864",
      secondary: "2E4C7E",
      accent:    "2E75B6",
    },
    spacing: {
      paragraphLine:  480,
      paragraphAfter: 120,
    },
  },
};
