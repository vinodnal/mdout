/**
 * src/logger.js
 * Structured logger with warning/error codes for mdoc.
 *
 * Warning/Error codes:
 *   W001  Missing import file (resolved but not found — build continues)
 *   W002  Deprecated syntax (still processed, emits warning)
 *   W003  Undefined variable reference {{name}}
 *   W004  Math OMML rendering failed, fell back to Unicode
 *   W005  Image file is very large (>5 MB), may slow builds
 *   E001  File not found (build-blocking)
 *   E002  Script execution error
 *   E003  Circular import detected
 *   E004  Config validation failed
 */
"use strict";

const CODES = {
  W001: "Missing import file",
  W002: "Deprecated syntax",
  W003: "Undefined variable",
  W004: "Math fallback to Unicode",
  W005: "Image too large",
  E001: "File not found",
  E002: "Script execution error",
  E003: "Circular import detected",
  E004: "Config validation failed",
};

const isTTY = Boolean(process.stdout.isTTY);
const C = {
  reset:  isTTY ? "\x1b[0m"  : "",
  bold:   isTTY ? "\x1b[1m"  : "",
  dim:    isTTY ? "\x1b[2m"  : "",
  green:  isTTY ? "\x1b[32m" : "",
  yellow: isTTY ? "\x1b[33m" : "",
  red:    isTTY ? "\x1b[31m" : "",
  cyan:   isTTY ? "\x1b[36m" : "",
  blue:   isTTY ? "\x1b[34m" : "",
  grey:   isTTY ? "\x1b[90m" : "",
};

/**
 * Create a structured logger instance.
 *
 * @param {object} opts
 * @param {boolean} [opts.quiet]    Suppress everything except errors.
 * @param {boolean} [opts.verbose]  Show debug messages.
 * @param {string}  [opts.logFile]  Path to write JSON log entries (one per line).
 * @returns Logger object.
 */
function createLogger(opts = {}) {
  const { quiet = false, verbose = false, logFile = null } = opts;
  const warnings = [];
  const errors   = [];

  function record(level, code, phase, file, message) {
    const entry = {
      level,
      code:      code    || null,
      phase:     phase   || null,
      file:      file    || null,
      message,
      timestamp: new Date().toISOString(),
    };
    if (level === "warn")  warnings.push(entry);
    if (level === "error") errors.push(entry);
    if (logFile) {
      try {
        require("fs").appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8");
      } catch { /* ignore log write failures */ }
    }
    return entry;
  }

  const ts = () => `${C.grey}[${new Date().toTimeString().slice(0, 8)}]${C.reset}`;

  return {
    /**
     * General informational message (suppressed when quiet).
     */
    info: (...a) => { if (!quiet) console.log(...a); },

    /**
     * Non-fatal warning.
     * @param {string} msg       Human-readable message.
     * @param {string} [code]    Warning code (e.g. "W001").
     * @param {object} [ctx]     Optional { phase, file } context.
     */
    warn: (msg, code, ctx = {}) => {
      record("warn", code, ctx.phase, ctx.file, msg);
      if (!quiet) {
        const codeStr = code ? ` ${C.grey}[${code}]${C.reset}` : "";
        const fileStr = ctx.file ? ` ${C.dim}(${ctx.file})${C.reset}` : "";
        console.warn(`${C.yellow}⚠${C.reset}${codeStr}${fileStr} ${msg}`);
      }
    },

    /**
     * Fatal error message (always printed).
     * @param {string} msg       Human-readable message.
     * @param {string} [code]    Error code (e.g. "E001").
     * @param {object} [ctx]     Optional { phase, file } context.
     */
    error: (msg, code, ctx = {}) => {
      record("error", code, ctx.phase, ctx.file, msg);
      const codeStr = code ? ` ${C.grey}[${code}]${C.reset}` : "";
      const fileStr = ctx.file ? ` ${C.dim}(${ctx.file})${C.reset}` : "";
      console.error(`${C.red}✖${C.reset}${codeStr}${fileStr} ${msg}`);
    },

    /**
     * Debug message (only printed when verbose=true and quiet=false).
     */
    debug: (...a) => { if (verbose && !quiet) console.log(C.dim + ts() + C.reset, ...a); },

    /**
     * Build step completion with optional timing.
     * @param {string} label       Step description.
     * @param {number} [duration]  Elapsed ms.
     */
    step: (label, duration) => {
      if (quiet) return;
      const t = duration !== undefined ? ` ${C.dim}(${duration.toFixed(0)} ms)${C.reset}` : "";
      console.log(`  ${C.green}✔${C.reset} ${label}${t}`);
    },

    blank: () => { if (!quiet) console.log(); },

    /**
     * Print a summary of all warnings and errors at the end of a build.
     * Only printed when there are warnings or errors.
     */
    summary: () => {
      if (quiet) return;
      const w = warnings.length;
      const e = errors.length;
      if (w + e === 0) return;
      const parts = [];
      if (e > 0) parts.push(`${C.red}${C.bold}${e} error${e > 1 ? "s" : ""}${C.reset}`);
      if (w > 0) parts.push(`${C.yellow}${w} warning${w > 1 ? "s" : ""}${C.reset}`);
      console.log(`\n${C.dim}─── Build summary ───${C.reset} ${parts.join("  ")}`);
      if (verbose) {
        warnings.forEach(en => {
          const c = en.code ? ` ${C.grey}[${en.code}]${C.reset}` : "";
          const f = en.file ? ` ${C.dim}(${en.file})${C.reset}` : "";
          console.log(`  ${C.yellow}⚠${C.reset}${c}${f} ${en.message}`);
        });
        errors.forEach(en => {
          const c = en.code ? ` ${C.grey}[${en.code}]${C.reset}` : "";
          const f = en.file ? ` ${C.dim}(${en.file})${C.reset}` : "";
          console.log(`  ${C.red}✖${C.reset}${c}${f} ${en.message}`);
        });
      }
    },

    getWarnings: () => [...warnings],
    getErrors:   () => [...errors],
    hasErrors:   () => errors.length > 0,
    hasWarnings: () => warnings.length > 0,

    /** True ANSI color map (same object used in CLI) */
    C,
  };
}

/**
 * Minimal silent logger for internal use (no output, no tracking).
 */
function makeNullLogger() {
  return {
    info:  () => {},
    warn:  () => {},
    error: () => {},
    debug: () => {},
    step:  () => {},
    blank: () => {},
    summary:     () => {},
    getWarnings: () => [],
    getErrors:   () => [],
    hasErrors:   () => false,
    hasWarnings: () => false,
    C,
  };
}

module.exports = { createLogger, makeNullLogger, CODES, C };
