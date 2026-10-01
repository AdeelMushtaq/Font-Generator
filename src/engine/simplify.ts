/**
 * Douglas-Peucker simplification and curve fitting.
 * Guarantees that points never drift further than chosen tolerance.
 */

import { Point, ContourLoop, BezierSegment } from '../types';
import { computeSignedArea, computeBounds } from './tracer';

/**
 * Perpendicular distance from point P to line segment AB
 */
export function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-12) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  // Cross product / length
  const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  return num / Math.sqrt(lenSq);
}

/**
 * Standard recursive Douglas-Peucker on an open polyline
 */
export function douglasPeuckerPolyline(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2 || tolerance <= 0) {
    return points;
  }

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = douglasPeuckerPolyline(points.slice(0, maxIdx + 1), tolerance);
    const right = douglasPeuckerPolyline(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

/**
 * Douglas-Peucker for a closed polygon loop
 * Finds the point furthest from start, splits loop into two halves,
 * simplifies each, and stitches back together.
 */
export function simplifyClosedLoop(points: Point[], tolerance: number): Point[] {
  const n = points.length;
  if (n <= 3 || tolerance <= 0) {
    return points;
  }

  // Find point furthest from index 0
  const p0 = points[0];
  let maxDist = -1;
  let splitIdx = Math.floor(n / 2);

  for (let i = 1; i < n; i++) {
    const d = Math.hypot(points[i].x - p0.x, points[i].y - p0.y);
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }

  // Split into two polylines: [0 .. splitIdx] and [splitIdx .. n-1, 0]
  const chain1 = points.slice(0, splitIdx + 1);
  const chain2 = [...points.slice(splitIdx), points[0]];

  const simp1 = douglasPeuckerPolyline(chain1, tolerance);
  const simp2 = douglasPeuckerPolyline(chain2, tolerance);

  // Combine (simp1 ends at splitIdx, simp2 starts at splitIdx and ends at 0)
  const combined = [...simp1.slice(0, -1), ...simp2.slice(0, -1)];

  return combined.length >= 3 ? combined : points;
}

/**
 * Generates quadratic Bézier segments through midpoints of polygon
 * For polygon [V0, V1, ... V_{n-1}]:
 * Midpoints M_i = (V_i + V_{i+1}) / 2
 * Segment i: start M_{i-1}, control V_i, end M_i
 */
export function fitQuadraticBeziers(polygon: Point[]): BezierSegment[] {
  const n = polygon.length;
  if (n < 3) return [];

  // Compute midpoints
  const midpoints: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    midpoints.push({
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    });
  }

  const segments: BezierSegment[] = [];
  for (let i = 0; i < n; i++) {
    const prevMid = midpoints[(i - 1 + n) % n];
    const control = polygon[i];
    const currMid = midpoints[i];

    segments.push({
      p0: prevMid,
      p1: control,
      p2: currMid,
    });
  }

  return segments;
}

/**
 * Measures maximum Euclidean distance between original points and simplified polygon
 * This gives the honest "Accuracy guarantee: within X px" metric.
 */
export function computeMaxDeviationPx(original: Point[], simplified: Point[]): number {
  if (simplified.length < 2 || original.length === 0) return 0;

  let maxDev = 0;
  const m = simplified.length;

  for (let i = 0; i < original.length; i++) {
    const p = original[i];
    let minDistToEdges = Infinity;

    for (let j = 0; j < m; j++) {
      const a = simplified[j];
      const b = simplified[(j + 1) % m];
      const dist = perpendicularDistance(p, a, b);
      if (dist < minDistToEdges) {
        minDistToEdges = dist;
      }
    }

    if (minDistToEdges > maxDev) {
      maxDev = minDistToEdges;
    }
  }

  return Math.round(maxDev * 100) / 100;
}

/**
 * Simplifies a full contour loop, preserving winding and metadata
 */
export function processContourLoop(
  loop: ContourLoop,
  tolerance: number,
  curveMode: 'sharp' | 'smooth'
): { simplified: ContourLoop; beziers?: BezierSegment[]; maxError: number } {
  const originalPoints = loop.points;
  const simpPoints = simplifyClosedLoop(originalPoints, tolerance);

  // Preserve intended winding direction
  const simpSignedArea = computeSignedArea(simpPoints);
  let finalPoints = simpPoints;
  if ((loop.isHole && simpSignedArea > 0) || (!loop.isHole && simpSignedArea < 0)) {
    finalPoints = [...simpPoints].reverse();
  }

  const maxError = computeMaxDeviationPx(originalPoints, finalPoints);

  const simplified: ContourLoop = {
    points: finalPoints,
    isHole: loop.isHole,
    signedArea: computeSignedArea(finalPoints),
    depth: loop.depth,
    bounds: computeBounds(finalPoints),
  };

  let beziers: BezierSegment[] | undefined;
  if (curveMode === 'smooth') {
    beziers = fitQuadraticBeziers(finalPoints);
  }

  return { simplified, beziers, maxError };
}
