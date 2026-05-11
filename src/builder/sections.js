/**
 * src/builder/sections.js
 * Splits a flat array of DOCX elements at SECTION_BREAK markers produced by
 * the parser when it encounters <!-- @section: ... --> directives.
 *
 * Each returned segment carries the accumulated elements and the section-break
 * marker that precedes them (null for the very first segment).
 */
"use strict";

/**
 * Split a flat element array at SECTION_BREAK markers.
 *
 * @param {object[]} elements  Flat array of docx elements and marker objects.
 * @returns {{ elements: object[], sectionBreak: object|null }[]}
 *   One entry per segment; `sectionBreak` is the preceding marker or null.
 */
function splitAtSectionBreaks(elements) {
  const segments = [];
  let current      = [];
  let currentBreak = null;

  for (const el of elements) {
    if (el && el._type === "SECTION_BREAK") {
      segments.push({ elements: current, sectionBreak: currentBreak });
      current      = [];
      currentBreak = el;
    } else {
      current.push(el);
    }
  }

  segments.push({ elements: current, sectionBreak: currentBreak });
  return segments;
}

module.exports = { splitAtSectionBreaks };
