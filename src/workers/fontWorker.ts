/**
 * Web Worker for heavy offscreen image processing:
 * - Bilinear Heckbert Homography rectification
 * - Smart adaptive thresholding (Dark Background vs Light Paper)
 * - Inset cell cropping & luminance extraction
 * - Pixel-edge exact contour tracing & hole depth classification
 * - Douglas-Peucker simplification & quadratic Bézier fitting
 */

import { Quad, FontSettings, ProcessedGlyph, ContourLoop, BezierSegment } from '../types';
import { rectifyImageBuffer } from '../engine/homography';
import { computeOtsuThreshold, computeSmartThreshold, extractCellMask } from '../engine/threshold';
import { tracePixelEdgeContours, computeBounds } from '../engine/tracer';
import { processContourLoop } from '../engine/simplify';
import { getGlyphName } from '../engine/fontBuilder';

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  try {
    if (type === 'process_all') {
      const {
        sourcePixels,
        sourceWidth,
        sourceHeight,
        quad,
        characters,
        cols,
        rows,
        settings,
        targetResolution = 2000,
        customBoxes,
      } = payload as {
        sourcePixels: Uint8ClampedArray;
        sourceWidth: number;
        sourceHeight: number;
        quad: Quad;
        characters: string[];
        cols: number;
        rows: number;
        settings: FontSettings;
        targetResolution: number;
        customBoxes?: Array<{
          char: string;
          x: number;
          y: number;
          width: number;
          height: number;
          row: number;
          col: number;
        }>;
      };

      const hasCustomBoxes = customBoxes && customBoxes.length > 0;

      // Check if quad is standard full image (no perspective distortion)
      const isFullQuad =
        Math.abs(quad[0].x) <= 2 && Math.abs(quad[0].y) <= 2 &&
        Math.abs(quad[1].x - sourceWidth) <= 2 && Math.abs(quad[1].y) <= 2 &&
        Math.abs(quad[2].x - sourceWidth) <= 2 && Math.abs(quad[2].y - sourceHeight) <= 2 &&
        Math.abs(quad[3].x) <= 2 && Math.abs(quad[3].y - sourceHeight) <= 2;

      let workingBuffer: Uint8ClampedArray;
      let workingWidth: number;
      let workingHeight: number;

      if (isFullQuad && hasCustomBoxes) {
        // Native 1:1 Pixel Processing: bypass warping to guarantee 100% distortion-free letter extraction!
        self.postMessage({ type: 'progress', stage: 'Extracting native pixel contours...', percent: 20 });
        workingBuffer = sourcePixels;
        workingWidth = sourceWidth;
        workingHeight = sourceHeight;
      } else {
        // Stage 1: Rectification
        self.postMessage({ type: 'progress', stage: 'Projective rectification (Heckbert map)...', percent: 15 });
        workingBuffer = rectifyImageBuffer(
          sourcePixels,
          sourceWidth,
          sourceHeight,
          quad,
          targetResolution,
          targetResolution
        );
        workingWidth = targetResolution;
        workingHeight = targetResolution;
      }

      // Stage 2: Smart adaptive thresholding
      self.postMessage({ type: 'progress', stage: 'Computing optimal luminance threshold...', percent: 35 });
      const autoThreshold = computeSmartThreshold(workingBuffer, workingWidth, workingHeight, settings.invert);
      const effectiveThreshold = settings.threshold && settings.threshold !== 128
        ? settings.threshold
        : autoThreshold;

      // Stage 3: Process cells
      self.postMessage({ type: 'progress', stage: 'Extracting cells & tracing pixel-edge contours...', percent: 45 });

      const cellWidth = Math.floor(workingWidth / cols);
      const cellHeight = Math.floor(workingHeight / rows);

      const glyphs: ProcessedGlyph[] = [];
      const totalCells = hasCustomBoxes ? customBoxes!.length : characters.length;

      // Scale factors if workingBuffer is warped to targetResolution
      const scaleX = workingWidth / sourceWidth;
      const scaleY = workingHeight / sourceHeight;

      for (let i = 0; i < totalCells; i++) {
        let char = characters[i] || '';
        let r = Math.floor(i / cols);
        let c = i % cols;
        let cellX = c * cellWidth;
        let cellY = r * cellHeight;
        let cWidth = cellWidth;
        let cHeight = cellHeight;

        if (hasCustomBoxes) {
          const box = customBoxes![i];
          char = box.char;
          r = box.row;
          c = box.col;

          if (workingBuffer === sourcePixels) {
            // Direct 1:1 coordinates
            cellX = Math.max(0, box.x);
            cellY = Math.max(0, box.y);
            cWidth = Math.min(workingWidth - cellX, box.width);
            cHeight = Math.min(workingHeight - cellY, box.height);
          } else {
            // Scaled coordinates
            cellX = Math.max(0, Math.round(box.x * scaleX));
            cellY = Math.max(0, Math.round(box.y * scaleY));
            cWidth = Math.min(workingWidth - cellX, Math.max(10, Math.round(box.width * scaleX)));
            cHeight = Math.min(workingHeight - cellY, Math.max(10, Math.round(box.height * scaleY)));
          }
        }

        // Progress update every few cells
        if (i % 6 === 0) {
          const pct = Math.round(45 + (i / totalCells) * 50);
          self.postMessage({
            type: 'progress',
            stage: `Tracing glyph '${char}' (${i + 1}/${totalCells})...`,
            percent: pct,
          });
        }

        const cellResult = extractCellMask(
          workingBuffer,
          workingWidth,
          workingHeight,
          cellX,
          cellY,
          cWidth,
          cHeight,
          settings.insetPercent || 0, // 0 for clean lettering!
          effectiveThreshold,
          settings.invert
        );

        // Exact pixel-edge contour tracing (using noise threshold 1 for fine cursive lines)
        const rawLoops = tracePixelEdgeContours(
          cellResult.mask,
          cellResult.maskWidth,
          cellResult.maskHeight,
          settings.noiseThresholdPx || 1
        );

        // Simplify loops and fit beziers
        const simplifiedLoops: ContourLoop[] = [];
        const bezierLoops: BezierSegment[][] = [];
        let maxGlyphError = 0;

        for (const loop of rawLoops) {
          const { simplified, beziers, maxError } = processContourLoop(
            loop,
            settings.simplifyTolerance || 1.2,
            settings.curveMode
          );
          simplifiedLoops.push(simplified);
          if (beziers) bezierLoops.push(beziers);
          if (maxError > maxGlyphError) maxGlyphError = maxError;
        }

        // Bounding box of ink
        const allPoints = simplifiedLoops.flatMap((l) => l.points);
        const cellBounds = computeBounds(allPoints);
        const isEmpty = rawLoops.length === 0 || allPoints.length === 0;

        // Font unit metrics
        const totalSpan = settings.ascender - settings.descender; // 1000
        const scale = totalSpan / cellResult.maskHeight;
        const baselineY = cellResult.maskHeight * (settings.baselinePercent / 100);

        const fontMinX = Math.round(cellBounds.minX * scale);
        const fontMaxX = Math.round(cellBounds.maxX * scale);
        const fontMinY = Math.round((baselineY - cellBounds.maxY) * scale);
        const fontMaxY = Math.round((baselineY - cellBounds.minY) * scale);

        const advanceWidth = isEmpty
          ? 360
          : Math.max(180, Math.round(cellBounds.width * scale + settings.leftSideBearing + settings.rightSideBearing));

        glyphs.push({
          id: `glyph-${i}-${char}`,
          char,
          unicode: char.charCodeAt(0),
          name: getGlyphName(char),
          cellIndex: i,
          row: r,
          col: c,
          rawLoops,
          simplifiedLoops,
          bezierLoops: settings.curveMode === 'smooth' ? bezierLoops : undefined,
          cellBounds,
          fontBounds: {
            minX: fontMinX,
            minY: fontMinY,
            maxX: fontMaxX,
            maxY: fontMaxY,
            width: fontMaxX - fontMinX,
            height: fontMaxY - fontMinY,
          },
          advanceWidth,
          lsb: settings.leftSideBearing,
          rsb: settings.rightSideBearing,
          cellWidth: cellResult.maskWidth,
          cellHeight: cellResult.maskHeight,
          maxErrorPx: maxGlyphError,
          isEmpty,
        });
      }

      self.postMessage({ type: 'progress', stage: 'Finalizing font data...', percent: 100 });

      self.postMessage({
        type: 'complete',
        glyphs,
        rectifiedBuffer: workingBuffer,
        rectifiedWidth: workingWidth,
        rectifiedHeight: workingHeight,
        autoThreshold,
      });
    } else if (type === 'retrace_glyph') {
      const {
        glyph,
        cellPixels,
        cellWidth,
        cellHeight,
        settings,
        threshold,
      } = payload;

      const effThresh = threshold ?? settings.threshold;

      const mask = new Uint8Array(cellWidth * cellHeight);
      for (let y = 0; y < cellHeight; y++) {
        for (let x = 0; x < cellWidth; x++) {
          const idx = (y * cellWidth + x) * 4;
          const r = cellPixels[idx];
          const g = cellPixels[idx + 1];
          const b = cellPixels[idx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          let isInk = false;
          if (!settings.invert) {
            isInk = lum < effThresh;
          } else {
            isInk = lum >= effThresh || Math.max(r, g, b) >= (effThresh + 8);
          }
          mask[y * cellWidth + x] = isInk ? 1 : 0;
        }
      }

      const rawLoops = tracePixelEdgeContours(mask, cellWidth, cellHeight, settings.noiseThresholdPx || 1);
      const simplifiedLoops: ContourLoop[] = [];
      const bezierLoops: BezierSegment[][] = [];
      let maxGlyphError = 0;

      for (const loop of rawLoops) {
        const { simplified, beziers, maxError } = processContourLoop(
          loop,
          settings.simplifyTolerance || 1.2,
          settings.curveMode
        );
        simplifiedLoops.push(simplified);
        if (beziers) bezierLoops.push(beziers);
        if (maxError > maxGlyphError) maxGlyphError = maxError;
      }

      const allPoints = simplifiedLoops.flatMap((l) => l.points);
      const cellBounds = computeBounds(allPoints);
      const isEmpty = rawLoops.length === 0 || allPoints.length === 0;

      const totalSpan = settings.ascender - settings.descender;
      const scale = totalSpan / cellHeight;
      const baselineY = cellHeight * (settings.baselinePercent / 100);

      const fontMinX = Math.round(cellBounds.minX * scale);
      const fontMaxX = Math.round(cellBounds.maxX * scale);
      const fontMinY = Math.round((baselineY - cellBounds.maxY) * scale);
      const fontMaxY = Math.round((baselineY - cellBounds.minY) * scale);

      const advanceWidth = isEmpty
        ? 360
        : Math.max(180, Math.round(cellBounds.width * scale + settings.leftSideBearing + settings.rightSideBearing));

      const updatedGlyph: ProcessedGlyph = {
        ...glyph,
        rawLoops,
        simplifiedLoops,
        bezierLoops: settings.curveMode === 'smooth' ? bezierLoops : undefined,
        cellBounds,
        fontBounds: {
          minX: fontMinX,
          minY: fontMinY,
          maxX: fontMaxX,
          maxY: fontMaxY,
          width: fontMaxX - fontMinX,
          height: fontMaxY - fontMinY,
        },
        advanceWidth,
        maxErrorPx: maxGlyphError,
        isEmpty,
        customThreshold: threshold,
      };

      self.postMessage({
        type: 'glyph_complete',
        glyph: updatedGlyph,
      });
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: (err as Error).message || 'Worker processing failed',
    });
  }
};
