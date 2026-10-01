import React, { useState, useRef, useEffect } from 'react';
import { X, Eraser, Pen, Trash2, Check, RotateCcw, Sliders, RefreshCw } from 'lucide-react';
import { useFontStore } from '../store/useFontStore';
import { extractCellMask } from '../engine/threshold';
import { calculateGridDimensions } from '../engine/template';
import { tracePixelEdgeContours, computeBounds } from '../engine/tracer';
import { processContourLoop } from '../engine/simplify';
import { assembleFont } from '../engine/fontBuilder';

export const GlyphEditorModal: React.FC = () => {
  const {
    editDrawGlyph,
    setEditDrawGlyph,
    updateSingleGlyph,
    rectifiedPixels,
    rectifiedWidth,
    rectifiedHeight,
    getActiveCharacters,
    settings,
    glyphs,
    setGeneratedTtf,
  } = useFontStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [brushSize, setBrushSize] = useState(6);
  const [isDrawing, setIsDrawing] = useState(false);
  const [localThreshold, setLocalThreshold] = useState(settings.threshold);

  const activeChars = getActiveCharacters();
  const { cols, rows } = calculateGridDimensions(activeChars.length);

  // Initialize canvas with cell pixels
  useEffect(() => {
    if (!editDrawGlyph || !rectifiedPixels || !canvasRef.current) return;

    setLocalThreshold(editDrawGlyph.customThreshold ?? settings.threshold);

    const cellWidth = Math.floor(rectifiedWidth / cols);
    const cellHeight = Math.floor(rectifiedHeight / rows);
    const cellX = editDrawGlyph.col * cellWidth;
    const cellY = editDrawGlyph.row * cellHeight;

    const cellResult = extractCellMask(
      rectifiedPixels,
      rectifiedWidth,
      rectifiedHeight,
      cellX,
      cellY,
      cellWidth,
      cellHeight,
      settings.insetPercent,
      editDrawGlyph.customThreshold ?? settings.threshold,
      settings.invert
    );

    const canvas = canvasRef.current;
    canvas.width = cellResult.maskWidth;
    canvas.height = cellResult.maskHeight;
    const ctx = canvas.getContext('2d')!;

    // Draw white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cellResult.maskWidth, cellResult.maskHeight);

    // Draw existing binary mask as black ink
    const imgData = ctx.createImageData(cellResult.maskWidth, cellResult.maskHeight);
    for (let i = 0; i < cellResult.mask.length; i++) {
      const isInk = cellResult.mask[i] === 1;
      const idx = i * 4;
      imgData.data[idx] = isInk ? 0 : 255;
      imgData.data[idx + 1] = isInk ? 0 : 255;
      imgData.data[idx + 2] = isInk ? 0 : 255;
      imgData.data[idx + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }, [editDrawGlyph, rectifiedPixels, rectifiedWidth, rectifiedHeight, cols, rows, settings]);

  if (!editDrawGlyph) return null;

  // Drawing event handlers
  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const ctx = canvas.getContext('2d')!;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = tool === 'pen' ? '#000000' : '#ffffff';

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const ctx = canvas.getContext('2d')!;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  // Clear canvas completely
  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  // Apply Changes and Re-Trace single glyph instantly
  const handleSaveAndRetrace = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);

    // Create binary mask from canvas (black = ink)
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) {
      const r = imgData.data[i * 4];
      mask[i] = r < 128 ? 1 : 0;
    }

    // Exact pixel-edge contour tracing
    const rawLoops = tracePixelEdgeContours(mask, w, h, settings.noiseThresholdPx);

    const simplifiedLoops = [];
    const bezierLoops = [];
    let maxGlyphError = 0;

    for (const loop of rawLoops) {
      const res = processContourLoop(loop, settings.simplifyTolerance, settings.curveMode);
      simplifiedLoops.push(res.simplified);
      if (res.beziers) bezierLoops.push(res.beziers);
      if (res.maxError > maxGlyphError) maxGlyphError = res.maxError;
    }

    const allPoints = simplifiedLoops.flatMap((l) => l.points);
    const cellBounds = computeBounds(allPoints);
    const isEmpty = rawLoops.length === 0 || allPoints.length === 0;

    const totalSpan = settings.ascender - settings.descender;
    const scale = totalSpan / h;
    const baselineY = h * (settings.baselinePercent / 100);

    const fontMinX = Math.round(cellBounds.minX * scale);
    const fontMaxX = Math.round(cellBounds.maxX * scale);
    const fontMinY = Math.round((baselineY - cellBounds.maxY) * scale);
    const fontMaxY = Math.round((baselineY - cellBounds.minY) * scale);

    const advanceWidth = isEmpty
      ? 360
      : Math.max(180, Math.round(cellBounds.width * scale + settings.leftSideBearing + settings.rightSideBearing));

    const updatedGlyph = {
      ...editDrawGlyph,
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
      customThreshold: localThreshold,
      isCustomDrawn: true,
    };

    updateSingleGlyph(updatedGlyph);

    // Rebuild font buffer
    const updatedGlyphs = glyphs.map((g) => (g.id === updatedGlyph.id ? updatedGlyph : g));
    const font = assembleFont(updatedGlyphs, settings, 200);
    const buffer = font.toArrayBuffer();
    setGeneratedTtf(buffer);

    setEditDrawGlyph(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-6 text-zinc-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-mono text-xl font-bold text-amber-400">
              {editDrawGlyph.char}
            </span>
            <div>
              <h3 className="font-bold text-lg text-white">
                Edit & Redraw Glyph: &apos;{editDrawGlyph.char}&apos;
              </h3>
              <p className="text-xs text-zinc-400">
                Touch up broken strokes or completely redraw this letter directly on canvas.
              </p>
            </div>
          </div>

          <button
            onClick={() => setEditDrawGlyph(null)}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between py-3 border-b border-zinc-800 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTool('pen')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
                tool === 'pen'
                  ? 'bg-amber-500 text-zinc-950 font-bold border-amber-500'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Pen className="w-3.5 h-3.5" />
              <span>Pencil</span>
            </button>

            <button
              onClick={() => setTool('eraser')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
                tool === 'eraser'
                  ? 'bg-amber-500 text-zinc-950 font-bold border-amber-500'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Eraser</span>
            </button>

            {/* Brush Size */}
            <div className="flex items-center gap-2 ml-4">
              <span className="text-zinc-400">Size:</span>
              <input
                type="range"
                min={2}
                max={20}
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-20 accent-amber-500"
              />
              <span className="font-mono text-amber-400">{brushSize}px</span>
            </div>
          </div>

          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 border border-zinc-800 rounded-lg transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Canvas</span>
          </button>
        </div>

        {/* Drawing Pad Canvas */}
        <div className="my-5 flex flex-col items-center justify-center bg-zinc-950 rounded-xl p-4 border border-zinc-800">
          <div className="w-[320px] h-[320px] bg-white rounded-lg shadow-2xl overflow-hidden border border-zinc-300 relative cursor-crosshair">
            <canvas
              ref={canvasRef}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
              className="w-full h-full object-contain touch-none"
            />
          </div>
          <span className="text-[11px] text-zinc-400 mt-2 font-mono">
            Draw in black ink. Baseline and proportions are maintained automatically.
          </span>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
          <button
            onClick={() => setEditDrawGlyph(null)}
            className="px-4 py-2 text-xs text-zinc-400 hover:text-white transition"
          >
            Cancel
          </button>

          <button
            onClick={handleSaveAndRetrace}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition shadow-lg shadow-amber-500/10"
          >
            <Check className="w-4 h-4" />
            <span>Apply & Re-trace Letter</span>
          </button>
        </div>
      </div>
    </div>
  );
};
