/**
 * Peak and Valley Projection Profile Segmentation.
 * 
 * Instead of guessing coordinates or clustering arbitrary blobs, this finds the
 * natural empty valleys between text lines and characters:
 * 1. Horizontal projection profile finds the 6 empty gaps between the 7 text lines.
 * 2. Vertical projection profile within each line finds the empty gaps between letters.
 * 3. Never cuts through a letter because dividers are placed strictly in the ink valleys.
 */

import { LetterBox, SheetLayout, CLASSIC_7_LINE_SPECIMEN } from './autoSegment';

/**
 * Smooths an array of numbers using a simple moving average
 */
function movingAverage(arr: Int32Array | Float32Array, radius: number): Float32Array {
  const len = arr.length;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    let count = 0;
    for (let r = -radius; r <= radius; r++) {
      const idx = i + r;
      if (idx >= 0 && idx < len) {
        sum += arr[idx];
        count++;
      }
    }
    out[i] = sum / (count || 1);
  }
  return out;
}

/**
 * Finds K-1 valleys to divide a profile into K sections
 */
function findValleysToDivide(profile: Float32Array, numSections: number): number[] {
  const len = profile.length;
  if (numSections <= 1) return [];

  // Approximate section size
  const sectionSize = len / numSections;
  const dividers: number[] = [];

  for (let s = 1; s < numSections; s++) {
    // Search for minimum in the expected boundary window [expected - 40%, expected + 40%]
    const expected = s * sectionSize;
    const searchStart = Math.max(0, Math.floor(expected - sectionSize * 0.4));
    const searchEnd = Math.min(len - 1, Math.ceil(expected + sectionSize * 0.4));

    let minVal = Infinity;
    let minIdx = Math.round(expected);

    for (let i = searchStart; i <= searchEnd; i++) {
      if (profile[i] < minVal) {
        minVal = profile[i];
        minIdx = i;
      }
    }

    dividers.push(minIdx);
  }

  return dividers;
}

/**
 * Segments an alphabet specimen into exact letter boxes via Peak/Valley Projection Profiling
 */
export function segmentByProjectionValleys(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  invert: boolean,
  threshold: number,
  layout: SheetLayout = CLASSIC_7_LINE_SPECIMEN
): LetterBox[] {
  const totalPixels = width * height;
  const isInk = new Uint8Array(totalPixels);

  // 1. Build binary mask
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    let ink = false;
    if (!invert) {
      ink = lum < threshold;
    } else {
      ink = lum >= threshold || Math.max(r, g, b) >= (threshold + 8);
    }
    isInk[i] = ink ? 1 : 0;
  }

  // 2. Horizontal Projection Profile (Row Ink Counts)
  const rawRowProj = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (isInk[rowOffset + x] === 1) count++;
    }
    rawRowProj[y] = count;
  }

  // Find overall ink top and bottom bounds
  let topBound = 0;
  while (topBound < height && rawRowProj[topBound] < 3) topBound++;
  let bottomBound = height - 1;
  while (bottomBound > 0 && rawRowProj[bottomBound] < 3) bottomBound--;

  // Smooth the horizontal profile
  const smoothedRowProj = movingAverage(rawRowProj, 7);

  // Active vertical span
  const activeTop = Math.max(0, topBound - 8);
  const activeBottom = Math.min(height - 1, bottomBound + 8);
  const activeHeight = activeBottom - activeTop + 1;

  // Extract active sub-profile
  const activeSubProfile = new Float32Array(activeHeight);
  for (let y = 0; y < activeHeight; y++) {
    activeSubProfile[y] = smoothedRowProj[activeTop + y];
  }

  const numRows = layout.charactersPerLine.length; // 7
  const rowValleys = findValleysToDivide(activeSubProfile, numRows);

  // Convert row valleys to full image coordinates
  const rowBoundaries: number[] = [activeTop];
  for (const v of rowValleys) {
    rowBoundaries.push(activeTop + v);
  }
  rowBoundaries.push(activeBottom);

  const boxes: LetterBox[] = [];

  // 3. For each line band, compute Vertical Projection Profile to find letter columns
  for (let r = 0; r < numRows; r++) {
    const chars = layout.charactersPerLine[r];
    const numCols = chars.length;

    // Line vertical extent
    const lineY0 = rowBoundaries[r];
    const lineY1 = rowBoundaries[r + 1];
    const lineH = lineY1 - lineY0;

    // Compute column ink counts in this line
    const rawColProj = new Int32Array(width);
    for (let y = lineY0; y < lineY1; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        if (isInk[rowOffset + x] === 1) rawColProj[x]++;
      }
    }

    // Find line horizontal extent
    let leftBound = 0;
    while (leftBound < width && rawColProj[leftBound] < 2) leftBound++;
    let rightBound = width - 1;
    while (rightBound > 0 && rawColProj[rightBound] < 2) rightBound--;

    const activeLeft = Math.max(0, leftBound - 6);
    const activeRight = Math.min(width - 1, rightBound + 6);
    const activeLineW = activeRight - activeLeft + 1;

    // Smooth column profile
    const smoothedColProj = movingAverage(rawColProj, 6);
    const activeColSubProfile = new Float32Array(activeLineW);
    for (let x = 0; x < activeLineW; x++) {
      activeColSubProfile[x] = smoothedColProj[activeLeft + x];
    }

    // Find column valleys
    const colValleys = findValleysToDivide(activeColSubProfile, numCols);

    const colBoundaries: number[] = [activeLeft];
    for (const v of colValleys) {
      colBoundaries.push(activeLeft + v);
    }
    colBoundaries.push(activeRight);

    // Build letter boxes for this line
    for (let c = 0; c < numCols; c++) {
      const char = chars[c];
      const bx0 = colBoundaries[c];
      const bx1 = colBoundaries[c + 1];
      const bw = Math.max(12, bx1 - bx0);

      // Add 2px margin around box to ensure strokes don't touch the perimeter
      const padX = 2;
      const padY = 2;

      boxes.push({
        char,
        x: Math.max(0, bx0 - padX),
        y: Math.max(0, lineY0 - padY),
        width: Math.min(width - Math.max(0, bx0 - padX), bw + 2 * padX),
        height: Math.min(height - Math.max(0, lineY0 - padY), lineH + 2 * padY),
        row: r,
        col: c,
      });
    }
  }

  return boxes;
}
