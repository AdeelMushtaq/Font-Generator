/**
 * Luminance calculation, Otsu's thresholding, and cell cropping
 */

/**
 * Rec. 601 Luma: 0.299*R + 0.587*G + 0.114*B
 */
export function getLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Calculates optimal global threshold using Otsu's method
 * Maximizes between-class variance sigma_B^2 = w0 * w1 * (mu0 - mu1)^2
 */
export function computeOtsuThreshold(
  rgbaData: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): number {
  const histogram = new Int32Array(256);
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const lum = Math.round(getLuminance(rgbaData[idx], rgbaData[idx + 1], rgbaData[idx + 2]));
    histogram[Math.min(255, Math.max(0, lum))]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) {
    sum += t * histogram[t];
  }

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let optimalThreshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = totalPixels - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const varianceBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varianceBetween > maxVariance) {
      maxVariance = varianceBetween;
      optimalThreshold = t;
    }
  }

  return optimalThreshold;
}

/**
 * Smart adaptive threshold that handles both:
 * 1. Dark backgrounds with gold/metallic/colored light ink (threshold ~35-50)
 * 2. Light paper with dark ink (Otsu threshold ~120-140)
 */
export function computeSmartThreshold(
  rgbaData: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  invert: boolean
): number {
  if (invert) {
    // Dark background: sample perimeter borders to measure background darkness floor
    let bgSum = 0;
    let bgCount = 0;
    const stepX = Math.max(1, Math.floor(width / 60));
    const stepY = Math.max(1, Math.floor(height / 60));

    for (let x = 0; x < width; x += stepX) {
      const topIdx = (0 * width + x) * 4;
      const botIdx = ((height - 1) * width + x) * 4;
      bgSum += getLuminance(rgbaData[topIdx], rgbaData[topIdx + 1], rgbaData[topIdx + 2]);
      bgSum += getLuminance(rgbaData[botIdx], rgbaData[botIdx + 1], rgbaData[botIdx + 2]);
      bgCount += 2;
    }

    for (let y = 0; y < height; y += stepY) {
      const leftIdx = (y * width + 0) * 4;
      const rightIdx = (y * width + (width - 1)) * 4;
      bgSum += getLuminance(rgbaData[leftIdx], rgbaData[leftIdx + 1], rgbaData[leftIdx + 2]);
      bgSum += getLuminance(rgbaData[rightIdx], rgbaData[rightIdx + 1], rgbaData[rightIdx + 2]);
      bgCount += 2;
    }

    const avgBgLum = bgSum / (bgCount || 1);
    // Ink threshold: set just above background floor to capture full gold/shaded strokes
    return Math.max(28, Math.min(85, Math.round(avgBgLum + 25)));
  } else {
    return computeOtsuThreshold(rgbaData, width, height);
  }
}

/**
 * Extracts a sub-cell from image buffer with inset cropping
 * Returns binary mask (1 = ink, 0 = background)
 */
export function extractCellMask(
  srcData: Uint8ClampedArray | Uint8Array,
  srcWidth: number,
  _srcHeight: number,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  insetPercent: number,
  threshold: number,
  invert: boolean
): {
  mask: Uint8Array;
  maskWidth: number;
  maskHeight: number;
  offsetX: number;
  offsetY: number;
  croppedRgba: Uint8ClampedArray;
} {
  const insetX = insetPercent > 0 ? Math.round(cellW * (insetPercent / 100)) : 0;
  const insetY = insetPercent > 0 ? Math.round(cellH * (insetPercent / 100)) : 0;

  const startX = Math.max(0, cellX + insetX);
  const startY = Math.max(0, cellY + insetY);
  const maskWidth = Math.max(1, cellW - 2 * insetX);
  const maskHeight = Math.max(1, cellH - 2 * insetY);

  const mask = new Uint8Array(maskWidth * maskHeight);
  const croppedRgba = new Uint8ClampedArray(maskWidth * maskHeight * 4);

  for (let y = 0; y < maskHeight; y++) {
    const srcY = startY + y;
    for (let x = 0; x < maskWidth; x++) {
      const srcX = startX + x;
      const srcIdx = (srcY * srcWidth + srcX) * 4;
      const dstIdx = (y * maskWidth + x) * 4;

      const r = srcData[srcIdx] || 0;
      const g = srcData[srcIdx + 1] || 0;
      const b = srcData[srcIdx + 2] || 0;
      const a = srcData[srcIdx + 3] !== undefined ? srcData[srcIdx + 3] : 255;

      croppedRgba[dstIdx] = r;
      croppedRgba[dstIdx + 1] = g;
      croppedRgba[dstIdx + 2] = b;
      croppedRgba[dstIdx + 3] = a;

      const lum = getLuminance(r, g, b);
      
      // Determine if ink
      let isInk = false;
      if (!invert) {
        // Dark ink on light background
        isInk = lum < threshold;
      } else {
        // Light/gold/colored ink on dark background:
        // Also check if color has noticeable saturation or brightness above background
        const colorDiffFromBlack = Math.max(r, g, b);
        isInk = lum >= threshold || colorDiffFromBlack >= (threshold + 10);
      }

      mask[y * maskWidth + x] = isInk ? 1 : 0;
    }
  }

  return {
    mask,
    maskWidth,
    maskHeight,
    offsetX: insetX,
    offsetY: insetY,
    croppedRgba,
  };
}
