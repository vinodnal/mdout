/**
 * src/renderer/colors.js
 * Color palette builder and callout style definitions.
 */
"use strict";

/**
 * Build the internal color map from a user-supplied theme.colors object.
 * All keys are 6-digit hex strings without the '#' prefix.
 * @param {object} [colors]
 * @returns {object}
 */
function buildColors(colors = {}) {
  return {
    H1:      colors.primary     || "1F3864",
    H2:      colors.secondary   || "2E4C7E",
    H3:      colors.accent      || "2E75B6",
    H4:      colors.h4          || "4472C4",
    BODY:    colors.body        || "1A1A1A",
    NOTE:    colors.note        || "555555",
    CODE:    colors.code        || "2D2D2D",
    CODEBG:  colors.codeBg      || "F5F5F5",
    HDRFILL: colors.primary     || "1F3864",
    HDRTEXT: colors.headerText  || "FFFFFF",
    ROWALT:  colors.rowAlt      || "EBF2FA",
    ROWBASE: "FFFFFF",
    BORDER:  colors.tableBorder || "AAAAAA",
    ACCENT:  colors.accent      || "2E75B6",
    MATHBG:  colors.mathBg      || "EEF4FB",
    // Callout / admonition colors
    INFO:     colors.info       || "1565C0",
    INFOBG:   colors.infoBg     || "E3F2FD",
    WARNING:  colors.warning    || "E65100",
    WARNBG:   colors.warningBg  || "FFF3E0",
    TIP:      colors.tip        || "2E7D32",
    TIPBG:    colors.tipBg      || "E8F5E9",
    DANGER:   colors.danger     || "B71C1C",
    DANGERBG: colors.dangerBg   || "FFEBEE",
    NOTEBG:   colors.noteBg     || "F5F5F5",
  };
}

/**
 * Per-style definitions for callout/admonition blocks.
 * colorKey and bgKey reference keys from the color map built by buildColors().
 */
const CALLOUT_STYLES = {
  info:    { icon: "ℹ", colorKey: "INFO",    bgKey: "INFOBG"   },
  warning: { icon: "⚠", colorKey: "WARNING", bgKey: "WARNBG"   },
  tip:     { icon: "✔", colorKey: "TIP",     bgKey: "TIPBG"    },
  danger:  { icon: "✖", colorKey: "DANGER",  bgKey: "DANGERBG" },
  note:    { icon: "📝", colorKey: "NOTE",   bgKey: "NOTEBG"   },
  box:     { icon: "",   colorKey: "H1",      bgKey: "MATHBG"   },
  quote:   { icon: "❝", colorKey: "H2",      bgKey: "ROWALT"   },
};

module.exports = { buildColors, CALLOUT_STYLES };
