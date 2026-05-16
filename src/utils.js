/**
 * src/utils.js
 * Shared low-level utilities for mdout.
 *
 * Centralises retry-with-backoff logic and transient FS error detection
 * so that builder.js, importer.js, and other modules don't duplicate them.
 */
"use strict";

// ─── Transient FS error codes ────────────────────────────────────────────────

const TRANSIENT_FS_CODES = new Set([
  "EPERM", "EBUSY", "EACCES", "ETXTBSY", "EMFILE", "ENFILE",
]);

/**
 * Returns true for transient filesystem errors that are safe to retry.
 * @param {Error} err
 * @returns {boolean}
 */
function isTransientFsError(err) {
  return Boolean(err && TRANSIENT_FS_CODES.has(err.code));
}

// ─── Synchronous sleep via Atomics ───────────────────────────────────────────

/**
 * Block the current thread for `ms` milliseconds using Atomics.wait.
 * Requires Node.js worker threads support (Node 12+).
 * @param {number} ms
 */
function sleepSync(ms) {
  if (ms <= 0) return;
  const shared = new SharedArrayBuffer(4);
  const view   = new Int32Array(shared);
  Atomics.wait(view, 0, 0, ms);
}

// ─── Retry with exponential backoff ─────────────────────────────────────────

/**
 * Execute `fn` synchronously, retrying on transient FS errors with
 * exponential backoff.
 *
 * @param {Function} fn          Zero-argument function to execute.
 * @param {object}   [opts]
 * @param {number}   [opts.retries=5]   Maximum number of retries after the first failure.
 * @param {number}   [opts.delay=50]    Initial delay in ms (doubles each retry, capped at 500 ms).
 * @returns {*}  Return value of `fn`.
 * @throws     The last error if all retries are exhausted or the error is non-transient.
 */
function retrySync(fn, opts = {}) {
  const retries   = opts.retries  ?? 5;
  const baseDelay = opts.delay    ?? 50;
  let delay       = baseDelay;
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientFsError(err) || attempt === retries) throw err;
      sleepSync(delay);
      delay = Math.min(delay * 2, 500);
    }
  }
  throw lastErr;
}

module.exports = { isTransientFsError, sleepSync, retrySync };
