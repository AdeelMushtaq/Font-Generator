import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, Eye, Check, Layers, ShieldCheck } from 'lucide-react';
import { useFontStore } from '../store/useFontStore';
import { extractCellMask } from '../engine/threshold';
import { calculateGridDimensions } from '../engine/template';

export const DiffInspectorModal: React.FC = () => {
  const {
    diffInspectorGlyph,
    setDiffInspectorGlyph,
    rectifiedPixels,
    rectifiedWidth,
    rectifiedHeight,
    getActiveCharacters,
    settings,
  } = useFontStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vectorOpacity, setVectorOpacity] = useState(0.75);
  const [showVertices, setShowVertices] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(3); // 3x zoom

  const activeChars = getActiveCharacters();
  const { cols, rows } = calculateGridDimensions(activeChars.length);

  useEffect(() => {
    if (!diffInspectorGlyph || !rectifiedPixels || !canvasRef.current) return;

    const cellWidth = Math.floor(rectifiedWidth / cols);
    const cellHeight = Math.floor(rectifiedHeight / rows);
    const cellX = diffInspectorGlyph.col * cellWidth;
    const cellY = diffInspectorGlyph.row * cellHeight;

    const effThresh = diffInspectorGlyph.customThreshold ?? settings.threshold;

    const cellResult = extractCellMask(
      rectifiedPixels,
      rectifiedWidth,
      rectifiedHeight,
      cellX,
      cellY,
      cellWidth,
      cellHeight,
      settings.insetPercent,
      effThresh,
      settings.invert
    );

    const canvas = canvasRef.current;
    const displayW = cellResult.maskWidth * zoomLevel;
    const displayH = cellResult.maskHeight * zoomLevel;
    canvas.width = displayW;
    canvas.height = displayH;

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false; // Keep raw pixel clarity

    // 1. Draw source pixel raster
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cellResult.maskWidth;
    tempCanvas.height = cellResult.maskHeight;
    const tempCtx = tempCanvas.getContext('2d')!;
    const origImgData = tempCtx.createImageData(cellResult.maskWidth, cellResult.maskHeight);
    origImgData.data.set(cellResult.croppedRgba);
    tempCtx.putImageData(origImgData, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0, displayW, displayH);

    // 2. Draw Vector Contours on top with zoom scale
    ctx.save();
    ctx.scale(zoomLevel, zoomLevel);

    const loops = diffInspectorGlyph.simplifiedLoops;
    const beziers = diffInspectorGlyph.bezierLoops;

    // Render filled vector path
    ctx.beginPath();
    if (settings.curveMode === 'smooth' && beziers && beziers.length > 0) {
      for (const segList of beziers) {
        if (segList.length === 0) continue;
        ctx.moveTo(segList[0].p0.x, segList[0].p0.y);
        for (const seg of segList) {
          ctx.quadraticCurveTo(seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y);
        }
      }
    } else {
      for (const loop of loops) {
        const pts = loop.points;
        if (pts.length < 3) continue;
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
      }
    }
    ctx.closePath();

    // Fill with translucent cyan/amber
    ctx.fillStyle = `rgba(245, 158, 11, ${vectorOpacity * 0.45})`;
    ctx.fill();

    // Stroke vector outline
    ctx.strokeStyle = `rgba(245, 158, 11, ${vectorOpacity})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Draw individual vertices
    if (showVertices) {
      for (const loop of loops) {
        for (const pt of loop.points) {
          ctx.fillStyle = loop.isHole ? '#38bdf8' : '#e11d48';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }, [
    diffInspectorGlyph,
    rectifiedPixels,
    rectifiedWidth,
    rectifiedHeight,
    cols,
    rows,
    settings,
    vectorOpacity,
    showVertices,
    zoomLevel,
  ]);

  if (!diffInspectorGlyph) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-4xl bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-6 text-zinc-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-mono text-xl font-bold text-amber-400">
              {diffInspectorGlyph.char}
            </span>
            <div>
              <h3 className="font-bold text-lg text-white">
                Pixel-to-Vector Diff Overlay: &apos;{diffInspectorGlyph.char}&apos;
              </h3>
              <p className="text-xs text-zinc-400">
                Vector outline rendered directly over original raw pixels at high magnification.
              </p>
            </div>
          </div>

          <button
            onClick={() => setDiffInspectorGlyph(null)}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 py-3 border-b border-zinc-800 text-xs">
          {/* Opacity Slider */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Vector Opacity:</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={vectorOpacity}
              onChange={(e) => setVectorOpacity(parseFloat(e.target.value))}
              className="w-24 accent-amber-500"
            />
            <span className="font-mono text-amber-400">{Math.round(vectorOpacity * 100)}%</span>
          </div>

          {/* Show Vertices Toggle */}
          <button
            onClick={() => setShowVertices(!showVertices)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              showVertices
                ? 'bg-amber-500/10 border-amber-500 text-amber-300'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}
          >
            {showVertices ? 'Hide Vertices' : 'Show Vertices'}
          </button>

          {/* Zoom Buttons */}
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setZoomLevel((z) => Math.max(1.5, z - 0.5))}
              className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-xs px-2 text-zinc-300">{zoomLevel.toFixed(1)}x</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(6, z + 0.5))}
              className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* High-Zoom Canvas Viewport */}
        <div className="flex-1 overflow-auto bg-zinc-950 rounded-xl p-4 my-4 flex items-center justify-center border border-zinc-800 min-h-[360px]">
          <canvas ref={canvasRef} className="shadow-2xl rounded border border-zinc-800" />
        </div>

        {/* Metrics Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-800 text-xs text-zinc-400 font-mono">
          <div className="flex items-center gap-4">
            <span>Accuracy: <strong className="text-amber-400">±{diffInspectorGlyph.maxErrorPx.toFixed(2)} px</strong></span>
            <span>Loops: <strong className="text-zinc-200">{diffInspectorGlyph.simplifiedLoops.length}</strong> ({diffInspectorGlyph.simplifiedLoops.filter(l => !l.isHole).length} outer, {diffInspectorGlyph.simplifiedLoops.filter(l => l.isHole).length} holes)</span>
            <span>Advance: <strong className="text-zinc-200">{diffInspectorGlyph.advanceWidth} units</strong></span>
          </div>
          <button
            onClick={() => setDiffInspectorGlyph(null)}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
