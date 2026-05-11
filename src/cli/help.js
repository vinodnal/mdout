/**
 * src/cli/help.js
 * Help text generators for each CLI command.
 */
"use strict";

const { C, getVersion } = require("./utils");

function makeHelp(cmd) {
  if (cmd === "validate") return `\
${C.bold}mdoc validate${C.reset} — Validate a project without building

${C.bold}Usage:${C.reset}
  mdoc validate [options] <project-dir|project.config.js>

${C.bold}Options:${C.reset}
  -h, --help        Show this help
      --dep-graph   Write a dependency graph to dependency.json

${C.bold}Exit codes:${C.reset}
  0 — No errors
  1 — Validation errors found
`;

  if (cmd === "init") return `\
${C.bold}mdoc init${C.reset} — Scaffold a new project

${C.bold}Usage:${C.reset}
  mdoc init [options] <new-dir>

${C.bold}Options:${C.reset}
  -h, --help                  Show this help
  -t, --template <name>       Template to use (default: simple)
      Templates: simple | report | thesis | manual

${C.bold}Example:${C.reset}
  mdoc init --template report ./my-report
`;

  return `\
${C.bold}mdoc${C.reset} — Markdown → DOCX/PDF document builder  v${getVersion()}

${C.bold}Usage:${C.reset}
  mdoc [build] [options] <project-dir>
  mdoc validate [--dep-graph] <project-dir>
  mdoc init [--template <name>] <new-dir>

${C.bold}Build options:${C.reset}
  -h, --help                   Show this help and exit
  -v, --verbose                Show per-step timings
  -q, --quiet                  Suppress all output except errors
  -p, --pdf                    Convert DOCX to PDF after building (requires LibreOffice)
      --pdf-only               Convert existing DOCX to PDF without rebuilding
      --no-pdf                 Skip PDF conversion
  -o, --out <path>             Override output path from project.config.js
      --soffice <path>         Path to soffice binary (auto-detected by default)
      --var <key=value>        Override a project.config.js variable (repeatable)
      --json [path]            Write build result as JSON (omit path → stdout)
      --watch                  Watch project files and rebuild on changes
      --watch-debounce <ms>    Debounce delay for watch mode (default: 300 ms)

${C.bold}Examples:${C.reset}
  mdoc projects/my-thesis
  mdoc -v --pdf projects/my-thesis
  mdoc --var author="Jane Doe" --var year=2026 projects/my-thesis
  mdoc --json result.json projects/my-thesis
  mdoc validate projects/my-thesis
  mdoc init --template thesis ./projects/new-thesis
`;
}

module.exports = { makeHelp };
