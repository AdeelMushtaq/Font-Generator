/**
 * Heckbert's Unit-Square-to-Quad Projective Mapping (Homography)
 * Reference: Paul Heckbert, "Projective Mappings for Image Warping", 1989.
 * 
 * Maps normalized output coords (u, v) in [0, 1] to source pixel (x, y)
 * using forward rational linear mapping, with bilinear interpolation.
 */

import { Point, Quad } from '../types';

export interface HomographyMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
}

/**
 * Computes the projective mapping from unit square [0,1]^2 to quadrilateral P0, P1, P2, P3
 * P0 = (x0, y0) -> (0, 0) [Top-Left]
 * P1 = (x1, y1) -> (1, 0) [Top-Right]
 * P2 = (x2, y2) -> (1, 1) [Bottom-Right]
 * P3 = (x3, y3) -> (0, 1) [Bottom-Left]
 */
export function computeSquareToQuad(quad: Quad): HomographyMatrix {
  const [p0, p1, p2, p3] = quad;
  const x0 = p0.x, y0 = p0.y;
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const sx = x0 - x1 + x2 - x3;

  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sy = y0 - y1 + y2 - y3;

  // Affine case
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    return {
      a: x1 - x0,
      b: x2 - x1,
      c: x0,
      d: y1 - y0,
      e: y2 - y1,
      f: y0,
      g: 0,
      h: 0,
    };
  }

  // Projective case
  const det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) < 1e-12) {
    // Degenerate quad, fallback to affine between P0, P1, P3
    return {
      a: x1 - x0,
      b: x3 - x0,
      c: x0,
      d: y1 - y0,
      e: y3 - y0,
      f: y0,
      g: 0,
      h: 0,
    };
  }

  const g = (sx * dy2 - sy * dx2) / det;
  const h = (dx1 * sy - dy1 * sx) / det;

  return {
    a: x1 - x0 + g * x1,
    b: x3 - x0 + h * x3,
    c: x0,
    d: y1 - y0 + g * y1,
    e: y3 - y0 + h * y3,
    f: y0,
    g,
    h,
  };
}

/**
 * Maps normalized coordinates (u, v) in [0, 1]^2 to source image coordinate (x, y)
 */
export function mapUnitToSource(matrix: HomographyMatrix, u: number, v: number): Point {
  const denom = matrix.g * u + matrix.h * v + 1;
  const safeDenom = Math.abs(denom) < 1e-12 ? 1e-12 : denom;
  return {
    x: (matrix.a * u + matrix.b * v + matrix.c) / safeDenom,
    y: (matrix.d * u + matrix.e * v + matrix.f) / safeDenom,
  };
}

/**
 * Performs bilinear pixel sampling from image buffer
 */
export function sampleBilinear(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  channels: number = 4
): [number, number, number, number] {
  // Clamp coordinates
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));

  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);

  const fx = cx - x0;
  const fy = cy - y0;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const idx00 = (y0 * width + x0) * channels;
  const idx10 = (y0 * width + x1) * channels;
  const idx01 = (y1 * width + x0) * channels;
  const idx11 = (y1 * width + x1) * channels;

  const r = Math.round(data[idx00] * w00 + data[idx10] * w10 + data[idx01] * w01 + data[idx11] * w11);
  const g = Math.round(data[idx00 + 1] * w00 + data[idx10 + 1] * w10 + data[idx01 + 1] * w01 + data[idx11 + 1] * w11);
  const b = Math.round(data[idx00 + 2] * w00 + data[idx10 + 2] * w10 + data[idx01 + 2] * w01 + data[idx11 + 2] * w11);
  const a = channels === 4
    ? Math.round(data[idx00 + 3] * w00 + data[idx10 + 3] * w10 + data[idx01 + 3] * w01 + data[idx11 + 3] * w11)
    : 255;

  return [r, g, b, a];
}

/**
 * Rectifies source pixel data to output square canvas with bilinear sampling
 */
export function rectifyImageBuffer(
  srcData: Uint8ClampedArray | Uint8Array,
  srcWidth: number,
  srcHeight: number,
  quad: Quad,
  targetWidth: number,
  targetHeight: number
): Uint8ClampedArray {
  const matrix = computeSquareToQuad(quad);
  const dst = new Uint8ClampedArray(targetWidth * targetHeight * 4);

  for (let y = 0; y < targetHeight; y++) {
    const v = (y + 0.5) / targetHeight;
    for (let x = 0; x < targetWidth; x++) {
      const u = (x + 0.5) / targetWidth;
      const srcPt = mapUnitToSource(matrix, u, v);
      const [r, g, b, a] = sampleBilinear(srcData, srcWidth, srcHeight, srcPt.x, srcPt.y, 4);

      const dstIdx = (y * targetWidth + x) * 4;
      dst[dstIdx] = r;
      dst[dstIdx + 1] = g;
      dst[dstIdx + 2] = b;
      dst[dstIdx + 3] = a;
    }
  }

  return dst;
}
