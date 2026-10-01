/**
 * Robust Connected Component Labeling (CCL) and Letter Blob Segmentation.
 * 
 * Instead of blind mathematical grid cutting, this finds the ACTUAL drawn ink letters
 * via flood-fill blob analysis, merges letter dots/accents (like 'i', 'j', '!'),
 * clusters them into text lines, and extracts the exact bounding box for every character.
 */

import { LetterBox, SheetLayout, CLASSIC_7_LINE_SPECIMEN } from './autoSegment';
import { getLuminance } from './threshold';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
  centerX: number;
  centerY: number;
}

/**
 * Extracts all connected ink components from the image buffer
 */
export function extractInkBlobs(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  invert: boolean,
  threshold: number
): BoundingBox[] {
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
      // Dark ink on light paper
      ink = lum < threshold;
    } else {
      // Light / gold / metallic ink on dark background
      ink = lum >= threshold || Math.max(r, g, b) >= (threshold + 8);
    }
    isInk[i] = ink ? 1 : 0;
  }

  // 2. Connected Component Labeling via Breadth-First Search (BFS)
  const visited = new Uint8Array(totalPixels);
  const blobs: BoundingBox[] = [];

  const queueX = new Int32Array(totalPixels);
  const queueY = new Int32Array(totalPixels);

  // Minimum pixel area to filter dust (e.g. 15 pixels)
  const minArea = 15;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (isInk[startIdx] === 0 || visited[startIdx] === 1) continue;

      let minX = x, maxX = x;
      let minY = y, maxY = y;
      let area = 0;
      let sumX = 0, sumY = 0;

      let qHead = 0, qTail = 0;
      queueX[qTail] = x;
      queueY[qTail] = y;
      qTail++;
      visited[startIdx] = 1;

      while (qHead < qTail) {
        const curX = queueX[qHead];
        const curY = queueY[qHead];
        qHead++;

        area++;
        sumX += curX;
        sumY += curY;

        if (curX < minX) minX = curX;
        if (curX > maxX) maxX = curX;
        if (curY < minY) minY = curY;
        if (curY > maxY) maxY = curY;

        // 8-way neighbors
        for (let dy = -1; dy <= 1; dy++) {
          const ny = curY + dy;
          if (ny < 0 || ny >= height) continue;
          const rowOffset = ny * width;

          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = curX + dx;
            if (nx < 0 || nx >= width) continue;

            const nIdx = rowOffset + nx;
            if (isInk[nIdx] === 1 && visited[nIdx] === 0) {
              visited[nIdx] = 1;
              queueX[qTail] = nx;
              queueY[qTail] = ny;
              qTail++;
            }
          }
        }
      }

      if (area >= minArea && (maxX - minX >= 3 || maxY - minY >= 3)) {
        blobs.push({
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          area,
          centerX: sumX / area,
          centerY: sumY / area,
        });
      }
    }
  }

  // 3. Merge detached components (e.g. dots of 'i', 'j', exclamation marks, accents)
  const mergedBlobs = mergeAccentsAndDots(blobs);

  return mergedBlobs;
}

/**
 * Merges dots and accents that belong to the same letter
 */
function mergeAccentsAndDots(blobs: BoundingBox[]): BoundingBox[] {
  if (blobs.length <= 1) return blobs;

  const result: BoundingBox[] = [];
  const merged = new Uint8Array(blobs.length);

  for (let i = 0; i < blobs.length; i++) {
    if (merged[i]) continue;
    let b = { ...blobs[i] };

    for (let j = i + 1; j < blobs.length; j++) {
      if (merged[j]) continue;
      const other = blobs[j];

      // Check if other is a small dot or part of this letter vertically
      const overlapX = Math.max(0, Math.min(b.maxX, other.maxX) - Math.max(b.minX, other.minX));
      const closeX = overlapX > 0 || Math.abs(b.centerX - other.centerX) < Math.max(b.width, other.width) * 0.6;
      const verticalGap = Math.max(0, Math.max(b.minY, other.minY) - Math.min(b.maxY, other.maxY));

      const isVerticalPartner = closeX && verticalGap < Math.max(b.height, other.height) * 0.7;

      if (isVerticalPartner) {
        merged[j] = 1;
        b = {
          minX: Math.min(b.minX, other.minX),
          minY: Math.min(b.minY, other.minY),
          maxX: Math.max(b.maxX, other.maxX),
          maxY: Math.max(b.maxY, other.maxY),
          width: Math.max(b.maxX, other.maxX) - Math.min(b.minX, other.minX) + 1,
          height: Math.max(b.maxY, other.maxY) - Math.min(b.minY, other.minY) + 1,
          area: b.area + other.area,
          centerX: (b.centerX * b.area + other.centerX * other.area) / (b.area + other.area),
          centerY: (b.centerY * b.area + other.centerY * other.area) / (b.area + other.area),
        };
      }
    }

    result.push(b);
  }

  return result;
}

/**
 * Groups detected letter blobs into lines and assigns them to expected characters.
 */
export function segmentLettersByBlobs(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  invert: boolean,
  threshold: number,
  layout: SheetLayout = CLASSIC_7_LINE_SPECIMEN
): LetterBox[] {
  const blobs = extractInkBlobs(rgba, width, height, invert, threshold);
  if (blobs.length === 0) return [];

  const expectedRows = layout.charactersPerLine.length; // 7

  // Sort all blobs vertically by centerY
  blobs.sort((a, b) => a.centerY - b.centerY);

  // Cluster blobs into lines based on vertical proximity
  const lines: BoundingBox[][] = [];
  const approxLineHeight = height / (expectedRows * 1.2);

  for (const b of blobs) {
    let placed = false;
    for (const line of lines) {
      const lineCenterY = line.reduce((acc, curr) => acc + curr.centerY, 0) / line.length;
      if (Math.abs(b.centerY - lineCenterY) < approxLineHeight * 0.6) {
        line.push(b);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lines.push([b]);
    }
  }

  // Sort lines from top to bottom
  lines.sort((lineA, lineB) => {
    const avgA = lineA.reduce((s, b) => s + b.centerY, 0) / lineA.length;
    const avgB = lineB.reduce((s, b) => s + b.centerY, 0) / lineB.length;
    return avgA - avgB;
  });

  // If number of detected lines matches or is close to expectedRows
  // Sort characters in each line from left to right
  for (const line of lines) {
    line.sort((a, b) => a.minX - b.minX);
  }

  const finalBoxes: LetterBox[] = [];

  // Match lines to expected characters
  for (let r = 0; r < expectedRows; r++) {
    const chars = layout.charactersPerLine[r];
    const expectedCount = chars.length;

    // Use detected line if available
    const detectedLine = lines[r];

    if (detectedLine && detectedLine.length > 0) {
      // Line bounding span
      const lineMinY = Math.min(...detectedLine.map((b) => b.minY));
      const lineMaxY = Math.max(...detectedLine.map((b) => b.maxY));
      const lineH = lineMaxY - lineMinY + 1;
      const padY = Math.max(6, Math.round(lineH * 0.12));

      if (detectedLine.length === expectedCount) {
        // EXACT 1-to-1 MATCH! Every blob corresponds exactly to a letter!
        for (let c = 0; c < expectedCount; c++) {
          const b = detectedLine[c];
          const padX = Math.max(6, Math.round(b.width * 0.15));
          finalBoxes.push({
            char: chars[c],
            x: Math.max(0, b.minX - padX),
            y: Math.max(0, lineMinY - padY),
            width: Math.min(width - Math.max(0, b.minX - padX), b.width + 2 * padX),
            height: Math.min(height - Math.max(0, lineMinY - padY), lineH + 2 * padY),
            row: r,
            col: c,
          });
        }
        continue;
      } else {
        // Blob count slightly different (e.g. cursive letters touching or extra speckle)
        // Divide the line's horizontal ink extent evenly across expected characters
        const lineMinX = Math.min(...detectedLine.map((b) => b.minX));
        const lineMaxX = Math.max(...detectedLine.map((b) => b.maxX));
        const totalLineW = lineMaxX - lineMinX + 1;
        const charW = totalLineW / expectedCount;

        for (let c = 0; c < expectedCount; c++) {
          const bx = Math.round(lineMinX + c * charW);
          finalBoxes.push({
            char: chars[c],
            x: Math.max(0, bx - 4),
            y: Math.max(0, lineMinY - padY),
            width: Math.min(width - Math.max(0, bx - 4), Math.round(charW) + 8),
            height: Math.min(height - Math.max(0, lineMinY - padY), lineH + 2 * padY),
            row: r,
            col: c,
          });
        }
        continue;
      }
    }

    // Fallback if line not detected
    const rowH = height / expectedRows;
    const colW = width / expectedCount;
    for (let c = 0; c < expectedCount; c++) {
      finalBoxes.push({
        char: chars[c],
        x: Math.round(c * colW),
        y: Math.round(r * rowH),
        width: Math.round(colW),
        height: Math.round(rowH),
        row: r,
        col: c,
      });
    }
  }

  return finalBoxes;
}
