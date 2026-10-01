/**
 * Glyph Cleaning Utilities:
 * - Detects and eliminates stray ink leaks from neighboring characters
 * - Keeps primary character strokes and valid internal holes (counters)
 */

import { ProcessedGlyph, ContourLoop } from '../types';
import { computeBounds } from './tracer';

/**
 * Removes stray strokes that leaked from adjacent letters into this cell
 */
export function cleanStrayArtifacts(glyph: ProcessedGlyph): ProcessedGlyph {
  if (glyph.simplifiedLoops.length <= 1) return glyph;

  const outerLoops = glyph.simplifiedLoops.filter((l) => !l.isHole);
  if (outerLoops.length <= 1) return glyph;

  // Compute bounding box and approximate area for each outer loop
  const loopBounds = outerLoops.map((l) => computeBounds(l.points));
  const loopAreas = loopBounds.map((b) => b.width * b.height);
  const maxArea = Math.max(...loopAreas);

  const cellW = glyph.cellWidth || 100;
  const keepOuter: ContourLoop[] = [];

  for (let i = 0; i < outerLoops.length; i++) {
    const loop = outerLoops[i];
    const b = loopBounds[i];
    const area = loopAreas[i];

    // Check if this loop is a tiny stray artifact near the edge
    const isLeftEdgeLeak = b.minX <= 6 && b.width < cellW * 0.35 && area < maxArea * 0.45;
    const isRightEdgeLeak = b.maxX >= cellW - 6 && b.width < cellW * 0.35 && area < maxArea * 0.45;
    const isTinyNoise = area < maxArea * 0.08 && area < 100;

    if (area === maxArea) {
      // Always keep the largest/primary outer loop
      keepOuter.push(loop);
    } else if (!isLeftEdgeLeak && !isRightEdgeLeak && !isTinyNoise) {
      keepOuter.push(loop);
    }
  }

  // If all were somehow filtered (edge case), keep the largest
  if (keepOuter.length === 0) {
    const maxIdx = loopAreas.indexOf(maxArea);
    keepOuter.push(outerLoops[maxIdx >= 0 ? maxIdx : 0]);
  }

  const holeLoops = glyph.simplifiedLoops.filter((l) => l.isHole);
  const newLoops = [...keepOuter, ...holeLoops];
  const allPts = newLoops.flatMap((l) => l.points);
  const newCellBounds = computeBounds(allPts);

  return {
    ...glyph,
    simplifiedLoops: newLoops,
    cellBounds: newCellBounds,
  };
}

/**
 * Cleans stray neighbor leakage across all glyphs in font
 */
export function cleanAllGlyphs(glyphs: ProcessedGlyph[]): ProcessedGlyph[] {
  return glyphs.map((g) => cleanStrayArtifacts(g));
}
