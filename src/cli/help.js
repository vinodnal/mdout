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

  if (cmd === "export") return `\
${C.bold}mdoc export${C.reset} — Export a project to images or flat Markdown

${C.bold}Usage:${C.reset}
  mdoc export [format] [options] <project-dir|path.pdf>

${C.bold}Formats:${C.reset}
  images        Convert PDF pages to PNG/JPEG images (default when both omitted)
  md            Flatten all Markdown into a single file
  (Both formats are exported when no format is specified)

${C.bold}Shared options:${C.reset}
  -h, --help                  Show this help
  -v, --verbose               Verbose output
  -q, --quiet                 Suppress all output except errors
  -f, --format <name>         Explicit format (images|md), repeatable
  -o, --out <path>            Output directory (images) or file path (md)
      --no-build              Skip DOCX build — use existing output DOCX/PDF
      --soffice <path>        Override LibreOffice soffice path
      --var <key=value>       Override project.config.js variable (repeatable)
      --json [path]           Write export result as JSON (omit path → stdout)

${C.bold}Images options:${C.reset}
      --pages <spec>          Pages to export: 1,3-5,7 | 2- | -4 | all (default: all)
      --image-format <fmt>    png | jpg (default: png)
      --dpi <n>               Resolution in DPI (default: 150)
      --prefix <name>         Output file name prefix
      --pdftoppm <path>       Override pdftoppm binary path
      --gs <path>             Override Ghostscript binary path

${C.bold}Markdown options:${C.reset}
      --no-cover              Omit cover.md from the flat output

${C.bold}Examples:${C.reset}
  mdoc export projects/my-thesis
  mdoc export images --pages 1,3-5 --dpi 200 projects/my-thesis
  mdoc export images --pages 7 projects/these-hmh2/these_hmh2.pdf
  mdoc export md --out ./thesis_flat.md projects/my-thesis
  mdoc export images md --no-build --out ./out projects/my-thesis
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
  mdoc export [format] [options] <project-dir>
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
  mdoc export projects/my-thesis
  mdoc export images --pages 1-5 --dpi 200 projects/my-thesis
  mdoc export md --out ./flat.md projects/my-thesis
  mdoc init --template thesis ./projects/new-thesis
`;
}

module.exports = { makeHelp };
