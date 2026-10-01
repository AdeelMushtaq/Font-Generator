/**
 * Exact boundary extraction via the pixel-edge method.
 * Guaranteed pixel-exact tracing before simplification.
 */

import { Point, ContourLoop } from '../types';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function computeBounds(points: Point[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Computes polygon signed area using shoelace formula
 * In standard screen coords (y down):
 * Positive = Clockwise
 * Negative = Counter-Clockwise
 */
export function computeSignedArea(points: Point[]): number {
  const n = points.length;
  if (n < 3) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const curr = points[i];
    const next = points[(i + 1) % n];
    sum += curr.x * next.y - next.x * curr.y;
  }
  return sum / 2;
}

/**
 * Standard ray-casting point-in-polygon test
 */
export function isPointInsidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  if (n < 3) return false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Encodes integer 2D point into string key
 */
function pointKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Direct edge between two integer grid vertices
 */
interface DirectedEdge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  used: boolean;
}

/**
 * Extracts pixel-edge boundary loops from binary mask
 */
export function tracePixelEdgeContours(
  mask: Uint8Array,
  width: number,
  height: number,
  noiseThresholdPx: number = 3
): ContourLoop[] {
  // 1. Collect all directed boundary edges
  // For every ink pixel (x, y), check its 4 cardinal neighbors
  // Orient edges so ink is consistently on the right side:
  // Top: (x, y) -> (x+1, y) if neighbor (x, y-1) is not ink
  // Right: (x+1, y) -> (x+1, y+1) if neighbor (x+1, y) is not ink
  // Bottom: (x+1, y+1) -> (x, y+1) if neighbor (x, y+1) is not ink
  // Left: (x, y+1) -> (x, y) if neighbor (x-1, y) is not ink

  const isInk = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return mask[y * width + x] === 1;
  };

  const edgesFromVertex = new Map<string, DirectedEdge[]>();

  const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const key = pointKey(x1, y1);
    const edge: DirectedEdge = { fromX: x1, fromY: y1, toX: x2, toY: y2, used: false };
    const list = edgesFromVertex.get(key);
    if (list) {
      list.push(edge);
    } else {
      edgesFromVertex.set(key, [edge]);
    }
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInk(x, y)) continue;

      // Top edge
      if (!isInk(x, y - 1)) {
        addEdge(x, y, x + 1, y);
      }
      // Right edge
      if (!isInk(x + 1, y)) {
        addEdge(x + 1, y, x + 1, y + 1);
      }
      // Bottom edge
      if (!isInk(x, y + 1)) {
        addEdge(x + 1, y + 1, x, y + 1);
      }
      // Left edge
      if (!isInk(x - 1, y)) {
        addEdge(x, y + 1, x, y);
      }
    }
  }

  // 2. Trace directed edges into closed polygon loops
  const rawPolygons: Point[][] = [];

  for (const edges of edgesFromVertex.values()) {
    for (const startEdge of edges) {
      if (startEdge.used) continue;

      const loopPoints: Point[] = [{ x: startEdge.fromX, y: startEdge.fromY }];
      let currentEdge: DirectedEdge = startEdge;
      currentEdge.used = true;

      const maxSteps = width * height * 8;
      let steps = 0;

      while (steps++ < maxSteps) {
        loopPoints.push({ x: currentEdge.toX, y: currentEdge.toY });

        // Check if loop has closed
        if (currentEdge.toX === startEdge.fromX && currentEdge.toY === startEdge.fromY) {
          // Remove duplicate closing point
          loopPoints.pop();
          break;
        }

        const nextKey = pointKey(currentEdge.toX, currentEdge.toY);
        const candidates = edgesFromVertex.get(nextKey);
        if (!candidates) break;

        // Find unused edge. If multiple (diagonal saddle point), pick the sharpest right turn
        // to maintain topological consistency
        let nextEdge: DirectedEdge | null = null;
        let unusedCount = 0;
        for (let i = 0; i < candidates.length; i++) {
          if (!candidates[i].used) unusedCount++;
        }

        if (unusedCount === 1) {
          for (let i = 0; i < candidates.length; i++) {
            if (!candidates[i].used) {
              nextEdge = candidates[i];
              break;
            }
          }
        } else if (unusedCount > 1) {
          // Compute heading vector
          const inDx = currentEdge.toX - currentEdge.fromX;
          const inDy = currentEdge.toY - currentEdge.fromY;
          const inAngle = Math.atan2(inDy, inDx);

          let bestDiff = -Infinity;
          for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            if (cand.used) continue;

            const outDx = cand.toX - cand.fromX;
            const outDy = cand.toY - cand.fromY;
            const outAngle = Math.atan2(outDy, outDx);

            // Relative turn angle in [-PI, PI]
            let diff = outAngle - inAngle;
            while (diff <= -Math.PI) diff += 2 * Math.PI;
            while (diff > Math.PI) diff -= 2 * Math.PI;

            // Prioritize sharpest right turn (most negative angle)
            // so we follow the ink border without jumping across saddles
            if (-diff > bestDiff) {
              bestDiff = -diff;
              nextEdge = cand;
            }
          }
        }

        if (!nextEdge) break;

        currentEdge = nextEdge;
        currentEdge.used = true;
      }

      if (loopPoints.length >= 3) {
        // Remove redundant collinear vertices along axis-aligned segments
        const simplified = removeCollinearPoints(loopPoints);
        if (simplified.length >= 3) {
          rawPolygons.push(simplified);
        }
      }
    }
  }

  // 3. Filter noise by bounding box
  const validPolygons = rawPolygons.filter((poly) => {
    const bounds = computeBounds(poly);
    return bounds.width >= noiseThresholdPx && bounds.height >= noiseThresholdPx;
  });

  // 4. Compute containment depth & classify hole vs outer
  // Loop depth is number of other loops that strictly contain a test point of this loop
  const contourLoops: ContourLoop[] = [];

  for (let i = 0; i < validPolygons.length; i++) {
    const polyA = validPolygons[i];
    const boundsA = computeBounds(polyA);
    const signedAreaA = computeSignedArea(polyA);

    // Pick representative test point on loop A
    // (midpoint of an edge shifted by small epsilon towards the interior)
    const testPoint = getInteriorTestPoint(polyA, signedAreaA > 0);

    let depth = 0;
    for (let j = 0; j < validPolygons.length; j++) {
      if (i === j) continue;
      const polyB = validPolygons[j];
      const boundsB = computeBounds(polyB);

      // Fast AABB rejection
      if (
        testPoint.x < boundsB.minX ||
        testPoint.x > boundsB.maxX ||
        testPoint.y < boundsB.minY ||
        testPoint.y > boundsB.maxY
      ) {
        continue;
      }

      if (isPointInsidePolygon(testPoint, polyB)) {
        depth++;
      }
    }

    const isHole = depth % 2 === 1;

    // Enforce consistent winding:
    // Screen coordinates (Y-down):
    // Outer loop should be Clockwise (signedArea > 0)
    // Hole loop should be Counter-Clockwise (signedArea < 0)
    // When later mapped to Font coords (where Y is flipped up),
    // outer will become CCW/CW as required by TrueType specs.
    let points = [...polyA];
    if (!isHole && signedAreaA < 0) {
      points.reverse();
    } else if (isHole && signedAreaA > 0) {
      points.reverse();
    }

    contourLoops.push({
      points,
      isHole,
      signedArea: computeSignedArea(points),
      depth,
      bounds: boundsA,
    });
  }

  return contourLoops;
}

/**
 * Removes collinear points on a closed polygon (e.g. horizontal / vertical lines)
 */
export function removeCollinearPoints(points: Point[]): Point[] {
  const n = points.length;
  if (n <= 3) return points;

  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    // Collinear if cross product is 0 and vectors point in same direction
    const cross = dx1 * dy2 - dy1 * dx2;
    const dot = dx1 * dx2 + dy1 * dy2;

    if (Math.abs(cross) < 1e-9 && dot > 0) {
      // Redundant collinear vertex, skip
      continue;
    }

    result.push(curr);
  }

  return result.length >= 3 ? result : points;
}

/**
 * Gets a representative test point inside the polygon
 */
function getInteriorTestPoint(polygon: Point[], isClockwise: boolean): Point {
  const n = polygon.length;
  // Try midpoints of edges nudged slightly normal to the edge into the interior
  for (let i = 0; i < n; i++) {
    const p0 = polygon[i];
    const p1 = polygon[(i + 1) % n];

    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;

    // In screen coordinates (y-down):
    // For a clockwise loop, the right-hand normal points outward, left-hand normal points inward.
    // normal = (dy, -dx) is left-hand
    const normalSign = isClockwise ? 1 : -1;
    const nx = (-dy / len) * normalSign * 0.1;
    const ny = (dx / len) * normalSign * 0.1;

    const testPt = { x: mx + nx, y: my + ny };
    if (isPointInsidePolygon(testPt, polygon)) {
      return testPt;
    }
  }

  // Fallback to centroid
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    cx += polygon[i].x;
    cy += polygon[i].y;
  }
  return { x: cx / n, y: cy / n };
}
