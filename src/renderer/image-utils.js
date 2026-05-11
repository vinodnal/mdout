/**
 * src/renderer/image-utils.js
 * Utility for reading image dimensions from a raw Buffer.
 *
 * Supports:
 *   PNG  — reads IHDR chunk at offset 16/20 (big-endian uint32)
 *   JPEG — scans for SOF markers (FFC0–FFCF, except FFC4/FFC8)
 *
 * Returns a safe fallback { width: 480, height: 320 } for unsupported formats.
 */
"use strict";

/**
 * Read pixel dimensions from image data.
 * @param {Buffer} data  Raw image buffer.
 * @returns {{ width: number, height: number }}
 */
function readImageDimensions(data) {
  if (!Buffer.isBuffer(data) || data.length < 8) {
    return { width: 480, height: 320 };
  }

  // ── PNG ──────────────────────────────────────────────────────────────────────
  // Magic: 89 50 4E 47 0D 0A 1A 0A
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47 &&
      data.length >= 24) {
    return {
      width:  data.readUInt32BE(16),
      height: data.readUInt32BE(20),
    };
  }

  // ── JPEG ─────────────────────────────────────────────────────────────────────
  // Magic: FF D8
  if (data[0] === 0xFF && data[1] === 0xD8) {
    let offset = 2;
    while (offset < data.length - 8) {
      if (data[offset] !== 0xFF) break;
      const marker = data[offset + 1];
      const segLen = data.readUInt16BE(offset + 2);

      // SOF0–SOF15, excluding DHT (C4) and DAC (CC)
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xCC) {
        if (offset + 8 < data.length) {
          return {
            height: data.readUInt16BE(offset + 5),
            width:  data.readUInt16BE(offset + 7),
          };
        }
      }

      offset += 2 + segLen;
    }
  }

  return { width: 480, height: 320 };
}

module.exports = { readImageDimensions };
