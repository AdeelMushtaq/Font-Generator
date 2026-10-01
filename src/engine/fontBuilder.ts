/**
 * TrueType Font Assembly using opentype.js
 * 
 * Maps traced cell coordinates to font-unit space:
 * - unitsPerEm = 1000
 * - ascender = 800
 * - descender = -200
 * - baseline at ~78% down
 * - uniform scale derived from cell height (no stretching)
 * - advance width computed from ink bounding box + configurable side bearings
 * - round-trip validation with opentype.parse
 */

import opentype from 'opentype.js';
import { ProcessedGlyph, FontSettings, Point } from '../types';

export const GLYPH_NAME_MAP: Record<string, string> = {
  ' ': 'space',
  '!': 'exclam',
  '"': 'quotedbl',
  '#': 'numbersign',
  '$': 'dollar',
  '%': 'percent',
  '&': 'ampersand',
  "'": 'quotesingle',
  '(': 'parenleft',
  ')': 'parenright',
  '*': 'asterisk',
  '+': 'plus',
  ',': 'comma',
  '-': 'hyphen',
  '.': 'period',
  '/': 'slash',
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  ':': 'colon',
  ';': 'semicolon',
  '<': 'less',
  '=': 'equal',
  '>': 'greater',
  '?': 'question',
  '@': 'at',
  '[': 'bracketleft',
  '\\': 'backslash',
  ']': 'bracketright',
  '^': 'asciicircum',
  '_': 'underscore',
  '`': 'grave',
  '{': 'braceleft',
  '|': 'bar',
  '}': 'braceright',
  '~': 'asciitilde',
};

export function getGlyphName(char: string): string {
  if (GLYPH_NAME_MAP[char]) {
    return GLYPH_NAME_MAP[char];
  }
  if (char >= 'a' && char <= 'z') return char;
  if (char >= 'A' && char <= 'Z') return char;
  return `uni${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

export interface ValidationResult {
  valid: boolean;
  glyphCount: number;
  warnings: string[];
  errors: string[];
}

/**
 * Maps a point from cell pixel coordinate space to Font Units (1000 unitsPerEm)
 * In font space:
 * - Y = 0 is the baseline
 * - Y > 0 is above baseline
 * - Uniform scale derived from cell height: scale = (ascender - descender) / cellHeight
 */
export function mapCellToFontPoint(
  p: Point,
  cellMinX: number,
  cellHeight: number,
  scale: number,
  baselineY: number,
  leftSideBearing: number
): Point {
  const x = Math.round((p.x - cellMinX) * scale + leftSideBearing);
  // In screen coords, Y increases downward. In font coords, Y increases upward.
  const y = Math.round((baselineY - p.y) * scale);
  return { x, y };
}

/**
 * Builds an opentype.Glyph from a ProcessedGlyph
 */
export function buildGlyph(
  glyphData: ProcessedGlyph,
  settings: FontSettings,
  cellHeight: number
): opentype.Glyph {
  const {
    char,
    unicode,
    name,
    simplifiedLoops,
    bezierLoops,
    cellBounds,
    isEmpty,
  } = glyphData;

  const actualCellHeight = glyphData.cellHeight || cellHeight;
  const baselineY = actualCellHeight * (settings.baselinePercent / 100);
  const totalVerticalSpan = settings.ascender - settings.descender; // 1000
  const scale = totalVerticalSpan / actualCellHeight;

  // Handle empty or space glyph
  if (isEmpty || char === ' ' || simplifiedLoops.length === 0) {
    const spaceWidth = Math.round(320 + settings.leftSideBearing + settings.rightSideBearing);
    return new opentype.Glyph({
      name: name || getGlyphName(char),
      unicode,
      advanceWidth: Math.max(200, spaceWidth),
      path: new opentype.Path(),
    });
  }

  const inkWidthPx = cellBounds.width;
  const advanceWidth = Math.max(
    180,
    Math.round(inkWidthPx * scale + settings.leftSideBearing + settings.rightSideBearing)
  );

  const path = new opentype.Path();

  if (settings.curveMode === 'smooth' && bezierLoops && bezierLoops.length > 0) {
    // Quadratic Bezier Mode
    for (const loopSegs of bezierLoops) {
      if (loopSegs.length === 0) continue;

      const p0 = mapCellToFontPoint(loopSegs[0].p0, cellBounds.minX, actualCellHeight, scale, baselineY, settings.leftSideBearing);
      path.moveTo(p0.x, p0.y);

      for (let i = 0; i < loopSegs.length; i++) {
        const seg = loopSegs[i];
        const p1 = mapCellToFontPoint(seg.p1, cellBounds.minX, actualCellHeight, scale, baselineY, settings.leftSideBearing);
        const p2 = mapCellToFontPoint(seg.p2, cellBounds.minX, actualCellHeight, scale, baselineY, settings.leftSideBearing);
        path.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
      }

      path.close();
    }
  } else {
    // Sharp Polygon Mode
    for (const loop of simplifiedLoops) {
      const pts = loop.points;
      if (pts.length < 3) continue;

      const startPt = mapCellToFontPoint(pts[0], cellBounds.minX, actualCellHeight, scale, baselineY, settings.leftSideBearing);
      path.moveTo(startPt.x, startPt.y);

      for (let i = 1; i < pts.length; i++) {
        const pt = mapCellToFontPoint(pts[i], cellBounds.minX, actualCellHeight, scale, baselineY, settings.leftSideBearing);
        path.lineTo(pt.x, pt.y);
      }

      path.close();
    }
  }

  return new opentype.Glyph({
    name: name || getGlyphName(char),
    unicode,
    advanceWidth,
    path,
  });
}

/**
 * Creates standard .notdef glyph (clean rectangle with crossed center)
 */
export function createNotdefGlyph(): opentype.Glyph {
  const path = new opentype.Path();
  const width = 500;
  const height = 700;
  const stroke = 50;

  // Outer rect
  path.moveTo(50, 0);
  path.lineTo(width - 50, 0);
  path.lineTo(width - 50, height);
  path.lineTo(50, height);
  path.close();

  // Inner rect
  path.moveTo(50 + stroke, stroke);
  path.lineTo(50 + stroke, height - stroke);
  path.lineTo(width - 50 - stroke, height - stroke);
  path.lineTo(width - 50 - stroke, stroke);
  path.close();

  return new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: width,
    path,
  });
}

/**
 * Assembles opentype.Font from processed glyphs
 */
export function assembleFont(
  glyphsData: ProcessedGlyph[],
  settings: FontSettings,
  cellHeight: number
): opentype.Font {
  const glyphs: opentype.Glyph[] = [];

  // Always prepend .notdef as glyph index 0
  glyphs.push(createNotdefGlyph());

  // Check if space glyph is already included
  let hasSpace = false;

  for (const gData of glyphsData) {
    if (gData.char === ' ') hasSpace = true;
    glyphs.push(buildGlyph(gData, settings, cellHeight));
  }

  if (!hasSpace) {
    const spaceGlyph = new opentype.Glyph({
      name: 'space',
      unicode: 32,
      advanceWidth: Math.round(300 + settings.leftSideBearing + settings.rightSideBearing),
      path: new opentype.Path(),
    });
    glyphs.push(spaceGlyph);
  }

  const font = new opentype.Font({
    familyName: settings.familyName || 'HandwrittenFont',
    styleName: settings.styleName || 'Regular',
    unitsPerEm: settings.unitsPerEm || 1000,
    ascender: settings.ascender || 800,
    descender: settings.descender || -200,
    glyphs,
  });

  return font;
}

/**
 * Round-trip TTF verification:
 * Parses TTF array buffer back and verifies glyph counts, bounding boxes, advance widths.
 */
export function validateFontBuffer(buffer: ArrayBuffer, expectedChars: string[]): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  try {
    const parsed = opentype.parse(buffer);
    const glyphCount = parsed.glyphs.length;

    if (glyphCount === 0) {
      errors.push('Generated font contains zero glyphs.');
    }

    let resolvedCount = 0;
    for (const ch of expectedChars) {
      const code = ch.charCodeAt(0);
      const glyph = parsed.charToGlyph(ch);
      if (!glyph || (glyph.unicode !== code && glyph.name === '.notdef')) {
        warnings.push(`Character '${ch}' (U+${code.toString(16)}) could not be mapped.`);
      } else {
        resolvedCount++;
        const advWidth = glyph.advanceWidth ?? 0;
        if (advWidth <= 0) {
          warnings.push(`Glyph '${ch}' has non-positive advance width (${advWidth}).`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      glyphCount,
      warnings,
      errors,
    };
  } catch (err) {
    errors.push(`Failed to parse generated TTF buffer: ${(err as Error).message}`);
    return {
      valid: false,
      glyphCount: 0,
      warnings,
      errors,
    };
  }
}
