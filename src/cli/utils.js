/**
 * src/cli/utils.js
 * Shared ANSI color codes, terminal helpers, and formatting utilities for the CLI.
 */
"use strict";

const isTTY = Boolean(process.stdout.isTTY);

/** ANSI escape sequences for colorized terminal output. */
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
 * Print an error message to stderr and exit.
 * @param {string} msg  Error message.
 * @param {number} [code=1]  Exit code.
 */
function die(msg, code = 1) {
  process.stderr.write(`${C.red}Error:${C.reset} ${msg}\n`);
  process.exit(code);
}

/**
 * Format a byte count as a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function fmt(bytes) {
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

/**
 * Read the package version string.
 * @returns {string}
 */
function getVersion() {
  try { return require("../../package.json").version; } catch { return "?"; }
}

module.exports = { C, die, fmt, getVersion };
