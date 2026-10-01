import { describe, it, expect } from 'vitest';
import { tracePixelEdgeContours, computeSignedArea, computeBounds } from '../engine/tracer';
import { douglasPeuckerPolyline, perpendicularDistance, processContourLoop } from '../engine/simplify';
import { computeSquareToQuad, mapUnitToSource } from '../engine/homography';
import { mapCellToFontPoint, assembleFont, validateFontBuffer } from '../engine/fontBuilder';
import { FontSettings, ProcessedGlyph, Quad } from '../types';

describe('Pixel-Edge Boundary Tracing on Synthetic Masks', () => {
  it('detects a single outer loop for a filled square', () => {
    // 20x20 canvas with 10x10 filled square at [5..14, 5..14]
    const W = 20, H = 20;
    const mask = new Uint8Array(W * H);
    for (let y = 5; y < 15; y++) {
      for (let x = 5; x < 15; x++) {
        mask[y * W + x] = 1;
      }
    }

    const loops = tracePixelEdgeContours(mask, W, H, 2);
    expect(loops.length).toBe(1);
    expect(loops[0].isHole).toBe(false);
    expect(loops[0].depth).toBe(0);

    // Bounding box should span exactly 5 to 15
    const bounds = loops[0].bounds;
    expect(bounds.minX).toBe(5);
    expect(bounds.maxX).toBe(15);
    expect(bounds.minY).toBe(5);
    expect(bounds.maxY).toBe(15);
    expect(bounds.width).toBe(10);
    expect(bounds.height).toBe(10);
  });

  it('detects 2 loops with opposite winding for a ring (square with hole)', () => {
    // Outer square 20x20 [2..18], inner hole [7..13]
    const W = 22, H = 22;
    const mask = new Uint8Array(W * H);
    for (let y = 2; y < 20; y++) {
      for (let x = 2; x < 20; x++) {
        mask[y * W + x] = 1;
      }
    }
    // Punch hole
    for (let y = 7; y < 15; y++) {
      for (let x = 7; x < 15; x++) {
        mask[y * W + x] = 0;
      }
    }

    const loops = tracePixelEdgeContours(mask, W, H, 2);
    expect(loops.length).toBe(2);

    const outer = loops.find((l) => !l.isHole);
    const hole = loops.find((l) => l.isHole);

    expect(outer).toBeDefined();
    expect(hole).toBeDefined();

    expect(outer?.depth).toBe(0);
    expect(hole?.depth).toBe(1);

    // Opposite signed areas (opposite winding)
    expect(outer!.signedArea * hole!.signedArea).toBeLessThan(0);
  });

  it('detects 2 outer loops with no holes for two disjoint blobs', () => {
    const W = 30, H = 20;
    const mask = new Uint8Array(W * H);
    // Blob 1 at [2..8, 2..8]
    for (let y = 2; y < 9; y++) {
      for (let x = 2; x < 9; x++) {
        mask[y * W + x] = 1;
      }
    }
    // Blob 2 at [18..26, 2..8]
    for (let y = 2; y < 9; y++) {
      for (let x = 18; x < 27; x++) {
        mask[y * W + x] = 1;
      }
    }

    const loops = tracePixelEdgeContours(mask, W, H, 2);
    expect(loops.length).toBe(2);
    expect(loops.every((l) => !l.isHole)).toBe(true);
    expect(loops.every((l) => l.depth === 0)).toBe(true);
  });

  it("detects 3 loops (1 outer, 2 holes) for a 'B'-like shape", () => {
    const W = 30, H = 40;
    const mask = new Uint8Array(W * H);
    // Outer body [4..26, 4..36]
    for (let y = 4; y < 36; y++) {
      for (let x = 4; x < 26; x++) {
        mask[y * W + x] = 1;
      }
    }
    // Upper hole [10..20, 8..16]
    for (let y = 8; y < 17; y++) {
      for (let x = 10; x < 20; x++) {
        mask[y * W + x] = 0;
      }
    }
    // Lower hole [10..20, 22..31]
    for (let y = 22; y < 32; y++) {
      for (let x = 10; x < 20; x++) {
        mask[y * W + x] = 0;
      }
    }

    const loops = tracePixelEdgeContours(mask, W, H, 2);
    expect(loops.length).toBe(3);

    const outerLoops = loops.filter((l) => !l.isHole);
    const holeLoops = loops.filter((l) => l.isHole);

    expect(outerLoops.length).toBe(1);
    expect(holeLoops.length).toBe(2);

    expect(outerLoops[0].depth).toBe(0);
    expect(holeLoops[0].depth).toBe(1);
    expect(holeLoops[1].depth).toBe(1);
  });
});

describe('Douglas-Peucker Simplification Correctness', () => {
  it('never discards points further than tolerance epsilon', () => {
    // A sine-wave polyline
    const points = [];
    for (let x = 0; x <= 100; x += 2) {
      points.push({ x, y: 30 + Math.sin(x / 10) * 20 });
    }

    const tolerance = 2.5;
    const simplified = douglasPeuckerPolyline(points, tolerance);

    // Every original point must be within tolerance of some segment in simplified polyline
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      let minDistance = Infinity;

      for (let j = 0; j < simplified.length - 1; j++) {
        const a = simplified[j];
        const b = simplified[j + 1];
        const dist = perpendicularDistance(p, a, b);
        if (dist < minDistance) minDistance = dist;
      }

      expect(minDistance).toBeLessThanOrEqual(tolerance + 1e-4);
    }
  });

  it('keeps sharp corners intact with reasonable tolerance', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
      { x: 0, y: 10 },
    ];
    const loop = {
      points: square,
      isHole: false,
      signedArea: computeSignedArea(square),
      depth: 0,
      bounds: computeBounds(square),
    };

    const { simplified } = processContourLoop(loop, 1.0, 'sharp');
    expect(simplified.points.length).toBeGreaterThanOrEqual(4);
    expect(simplified.bounds.width).toBe(20);
    expect(simplified.bounds.height).toBe(20);
  });
});

describe('Heckbert Projective Mapping', () => {
  it('maps unit square accurately onto identical quad', () => {
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    const matrix = computeSquareToQuad(quad);
    const tl = mapUnitToSource(matrix, 0, 0);
    const tr = mapUnitToSource(matrix, 1, 0);
    const br = mapUnitToSource(matrix, 1, 1);
    const bl = mapUnitToSource(matrix, 0, 1);
    const center = mapUnitToSource(matrix, 0.5, 0.5);

    expect(tl.x).toBeCloseTo(0);
    expect(tl.y).toBeCloseTo(0);
    expect(tr.x).toBeCloseTo(100);
    expect(tr.y).toBeCloseTo(0);
    expect(br.x).toBeCloseTo(100);
    expect(br.y).toBeCloseTo(100);
    expect(bl.x).toBeCloseTo(0);
    expect(bl.y).toBeCloseTo(100);
    expect(center.x).toBeCloseTo(50);
    expect(center.y).toBeCloseTo(50);
  });

  it('maps non-affine perspective trapezoid to finite coordinates', () => {
    // Keystone quadrilateral
    const quad: Quad = [
      { x: 20, y: 10 },
      { x: 80, y: 15 },
      { x: 110, y: 95 },
      { x: 0, y: 90 },
    ];

    const matrix = computeSquareToQuad(quad);
    const tl = mapUnitToSource(matrix, 0, 0);
    const br = mapUnitToSource(matrix, 1, 1);
    const mid = mapUnitToSource(matrix, 0.5, 0.5);

    expect(Number.isFinite(tl.x) && Number.isFinite(tl.y)).toBe(true);
    expect(Number.isFinite(br.x) && Number.isFinite(br.y)).toBe(true);
    expect(Number.isFinite(mid.x) && Number.isFinite(mid.y)).toBe(true);

    expect(tl.x).toBeCloseTo(20);
    expect(tl.y).toBeCloseTo(10);
    expect(br.x).toBeCloseTo(110);
    expect(br.y).toBeCloseTo(95);
  });
});

describe('Font Space Coordinate Mapping & Assembly', () => {
  it('correctly maps pixel coordinates to font baseline with uniform scale', () => {
    const cellHeight = 200;
    const baselinePercent = 78;
    const ascender = 800;
    const descender = -200;
    const scale = (ascender - descender) / cellHeight; // 1000 / 200 = 5
    const baselineY = cellHeight * (baselinePercent / 100); // 156

    // A point right on baseline
    const ptOnBase = { x: 50, y: baselineY };
    const fontPt = mapCellToFontPoint(ptOnBase, 0, cellHeight, scale, baselineY, 60);
    expect(fontPt.y).toBe(0); // Y=0 on baseline
    expect(fontPt.x).toBe(50 * 5 + 60);

    // A point above baseline (e.g. 56px from top)
    const ptAbove = { x: 50, y: 56 };
    const fontPtAbove = mapCellToFontPoint(ptAbove, 0, cellHeight, scale, baselineY, 60);
    expect(fontPtAbove.y).toBe((156 - 56) * 5); // 500 font units
    expect(fontPtAbove.y).toBeGreaterThan(0);
  });

  it('assembles a valid TTF and passes round-trip parsing', () => {
    const settings: FontSettings = {
      familyName: 'TestHandFont',
      styleName: 'Regular',
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      baselinePercent: 78,
      xHeightPercent: 42,
      insetPercent: 10,
      threshold: 128,
      invert: false,
      noiseThresholdPx: 3,
      simplifyTolerance: 1.5,
      curveMode: 'sharp',
      leftSideBearing: 60,
      rightSideBearing: 60,
      kerningPairs: {},
    };

    // Fake glyph for 'A'
    const triangleLoop = {
      points: [
        { x: 20, y: 150 },
        { x: 50, y: 30 },
        { x: 80, y: 150 },
      ],
      isHole: false,
      signedArea: 3600,
      depth: 0,
      bounds: { minX: 20, minY: 30, maxX: 80, maxY: 150, width: 60, height: 120 },
    };

    const glyphA: ProcessedGlyph = {
      id: 'g-A',
      char: 'A',
      unicode: 65,
      name: 'A',
      cellIndex: 0,
      row: 0,
      col: 0,
      rawLoops: [triangleLoop],
      simplifiedLoops: [triangleLoop],
      cellBounds: triangleLoop.bounds,
      fontBounds: { minX: 100, minY: 0, maxX: 500, maxY: 600, width: 400, height: 600 },
      advanceWidth: 500,
      lsb: 60,
      rsb: 60,
      cellWidth: 100,
      cellHeight: 200,
      maxErrorPx: 0.5,
      isEmpty: false,
    };

    const font = assembleFont([glyphA], settings, 200);
    expect(font).toBeDefined();

    const buffer = font.toArrayBuffer();
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(500);

    const validation = validateFontBuffer(buffer, ['A']);
    expect(validation.valid).toBe(true);
    expect(validation.glyphCount).toBeGreaterThanOrEqual(2); // .notdef + space + A
  });
});
