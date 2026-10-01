/**
 * Auto-detection of Background Polarity and Smart Character Segmentation
 */

import { getLuminance } from './threshold';

export interface LetterBox {
  char: string;
  x: number;
  y: number;
  width: number;
  height: number;
  row: number;
  col: number;
}

/**
 * Detects if the image has a dark background (light text on dark background)
 * by sampling the outer perimeter border pixels.
 */
export function detectDarkBackground(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): boolean {
  let sampleCount = 0;
  let totalLuminance = 0;

  // Sample top and bottom rows
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 60))) {
    const topIdx = (0 * width + x) * 4;
    totalLuminance += getLuminance(rgba[topIdx], rgba[topIdx + 1], rgba[topIdx + 2]);
    sampleCount++;

    const botIdx = ((height - 1) * width + x) * 4;
    totalLuminance += getLuminance(rgba[botIdx], rgba[botIdx + 1], rgba[botIdx + 2]);
    sampleCount++;
  }

  // Sample left and right columns
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 60))) {
    const leftIdx = (y * width + 0) * 4;
    totalLuminance += getLuminance(rgba[leftIdx], rgba[leftIdx + 1], rgba[leftIdx + 2]);
    sampleCount++;

    const rightIdx = (y * width + (width - 1)) * 4;
    totalLuminance += getLuminance(rgba[rightIdx], rgba[rightIdx + 1], rgba[rightIdx + 2]);
    sampleCount++;
  }

  const avgBorderLuminance = totalLuminance / (sampleCount || 1);
  return avgBorderLuminance < 110;
}

export interface SheetLayout {
  id: string;
  name: string;
  description: string;
  lineCounts: number[];
  charactersPerLine: string[][];
}

export const CLASSIC_7_LINE_SPECIMEN: SheetLayout = {
  id: 'classic_7_line',
  name: 'Standard 7-Line Alphabet Sheet (62 chars)',
  description: 'Line 1: A-I (9), Line 2: J-R (9), Line 3: S-Z (8), Line 4: a-i (9), Line 5: j-r (9), Line 6: s-z (8), Line 7: 0-9 (10)',
  lineCounts: [9, 9, 8, 9, 9, 8, 10],
  charactersPerLine: [
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'],
    ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    ['j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r'],
    ['s', 't', 'u', 'v', 'w', 'x', 'y', 'z'],
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  ],
};

/**
 * Computes letter bounding boxes with margin controls
 */
export function computeLayoutBoxes(
  imageWidth: number,
  imageHeight: number,
  layout: SheetLayout,
  marginXPercent: number = 4,
  marginYPercent: number = 3
): LetterBox[] {
  const marginX = Math.round(imageWidth * (marginXPercent / 100));
  const marginY = Math.round(imageHeight * (marginYPercent / 100));

  const contentW = imageWidth - 2 * marginX;
  const contentH = imageHeight - 2 * marginY;

  const rowCount = layout.charactersPerLine.length;
  const rowHeight = contentH / rowCount;

  const boxes: LetterBox[] = [];

  for (let r = 0; r < rowCount; r++) {
    const chars = layout.charactersPerLine[r];
    const colCount = chars.length;
    const colWidth = contentW / colCount;
    const y = Math.round(marginY + r * rowHeight);

    for (let c = 0; c < colCount; c++) {
      const char = chars[c];
      const x = Math.round(marginX + c * colWidth);

      boxes.push({
        char,
        x,
        y,
        width: Math.round(colWidth),
        height: Math.round(rowHeight),
        row: r,
        col: c,
      });
    }
  }

  return boxes;
}

/**
 * Smart Ink Auto-Fitting:
 * Uses projection profiles on the actual binary mask to find the tight vertical line bands
 * and horizontal column bands where ink actually exists.
 */
export function autoFitBoxesToInk(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  invert: boolean,
  threshold: number,
  layout: SheetLayout
): LetterBox[] {
  // 1. Build fast binary mask
  const isInk = (idx: number) => {
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (!invert) {
      return lum < threshold;
    } else {
      return lum >= threshold || Math.max(r, g, b) >= (threshold + 10);
    }
  };

  // Horizontal projection
  const rowProj = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    const offset = y * width * 4;
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (isInk(offset + x * 4)) count++;
    }
    rowProj[y] = count;
  }

  // Find line bands
  const minLineInk = Math.max(3, Math.floor(width * 0.004));
  interface Band { start: number; end: number; }
  const rawBands: Band[] = [];
  let inB = false;
  let bStart = 0;

  for (let y = 0; y < height; y++) {
    if (rowProj[y] >= minLineInk) {
      if (!inB) { inB = true; bStart = y; }
    } else {
      if (inB) {
        inB = false;
        if (y - bStart > 12) {
          rawBands.push({ start: bStart, end: y });
        }
      }
    }
  }
  if (inB && height - bStart > 12) {
    rawBands.push({ start: bStart, end: height });
  }

  const rowCount = layout.charactersPerLine.length;
  let finalBands: Band[] = [];

  if (rawBands.length === rowCount) {
    // Add small vertical breathing room (padding)
    finalBands = rawBands.map((b) => ({
      start: Math.max(0, b.start - 6),
      end: Math.min(height, b.end + 6),
    }));
  } else {
    // Fallback: divide available height proportionally
    const padTop = Math.round(height * 0.03);
    const lineH = (height - 2 * padTop) / rowCount;
    for (let r = 0; r < rowCount; r++) {
      finalBands.push({
        start: Math.round(padTop + r * lineH),
        end: Math.round(padTop + (r + 1) * lineH),
      });
    }
  }

  // Segment characters horizontally within each band
  const boxes: LetterBox[] = [];

  for (let r = 0; r < rowCount; r++) {
    const band = finalBands[r];
    const chars = layout.charactersPerLine[r];
    const colCount = chars.length;
    const bandHeight = band.end - band.start;

    // Scan ink span in this row
    let minX = width, maxX = 0;
    for (let y = band.start; y < band.end; y++) {
      const offset = y * width * 4;
      for (let x = 0; x < width; x++) {
        if (isInk(offset + x * 4)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }

    if (maxX <= minX) {
      minX = Math.round(width * 0.04);
      maxX = Math.round(width * 0.96);
    }

    // Add breathing room
    const spanStart = Math.max(0, minX - 10);
    const spanEnd = Math.min(width, maxX + 10);
    const totalW = spanEnd - spanStart;
    const charW = totalW / colCount;

    for (let c = 0; c < colCount; c++) {
      const char = chars[c];
      const bx = Math.round(spanStart + c * charW);
      boxes.push({
        char,
        x: bx,
        y: band.start,
        width: Math.min(width - bx, Math.round(charW)),
        height: Math.min(height - band.start, bandHeight),
        row: r,
        col: c,
      });
    }
  }

  return boxes;
}
