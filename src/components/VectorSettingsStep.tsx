import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PenTool,
  Sliders,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Layers,
  Activity,
  SplitSquareVertical,
} from 'lucide-react';
import { useFontStore } from '../store/useFontStore';
import { calculateGridDimensions } from '../engine/template';
import { extractCellMask } from '../engine/threshold';
import { tracePixelEdgeContours } from '../engine/tracer';
import { processContourLoop } from '../engine/simplify';
import { assembleFont, validateFontBuffer } from '../engine/fontBuilder';

export const VectorSettingsStep: React.FC = () => {
  const {
    rectifiedPixels,
    rectifiedWidth,
    rectifiedHeight,
    getActiveCharacters,
    customBoxes,
    settings,
    updateSettings,
    setCurrentStep,
    setGlyphs,
    setGeneratedTtf,
    isProcessing,
    progressStage,
    progressPercent,
    setProcessing,
    setWorkerError,
  } = useFontStore();

  const activeChars = getActiveCharacters();
  const { cols, rows } = calculateGridDimensions(activeChars.length);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [previewCharIdx, setPreviewCharIdx] = useState(0);
  const [calculatedErrorPx, setCalculatedErrorPx] = useState(0.8);
  const [activeTabMode, setActiveTabMode] = useState<'sharp' | 'smooth'>(settings.curveMode);

  // Sync mode
  useEffect(() => {
    setActiveTabMode(settings.curveMode);
  }, [settings.curveMode]);

  // Live vector preview for a single sample character
  useEffect(() => {
    if (!rectifiedPixels || !previewCanvasRef.current) return;

    const hasBoxes = customBoxes && customBoxes.length > 0;
    let cellWidth = Math.floor(rectifiedWidth / cols);
    let cellHeight = Math.floor(rectifiedHeight / rows);
    let cellX = (previewCharIdx % cols) * cellWidth;
    let cellY = Math.floor(previewCharIdx / cols) * cellHeight;

    if (hasBoxes && customBoxes![previewCharIdx]) {
      const b = customBoxes![previewCharIdx];
      cellX = b.x;
      cellY = b.y;
      cellWidth = b.width;
      cellHeight = b.height;
    }

    const cellResult = extractCellMask(
      rectifiedPixels,
      rectifiedWidth,
      rectifiedHeight,
      cellX,
      cellY,
      cellWidth,
      cellHeight,
      hasBoxes ? 0 : settings.insetPercent,
      settings.threshold,
      settings.invert
    );

    const rawLoops = tracePixelEdgeContours(
      cellResult.mask,
      cellResult.maskWidth,
      cellResult.maskHeight,
      settings.noiseThresholdPx
    );

    let maxError = 0;
    const processedLoops = rawLoops.map((loop) => {
      const res = processContourLoop(loop, settings.simplifyTolerance, settings.curveMode);
      if (res.maxError > maxError) maxError = res.maxError;
      return res;
    });

    setCalculatedErrorPx(maxError);

    // Draw vector outline on preview canvas
    const canvas = previewCanvasRef.current;
    canvas.width = cellResult.maskWidth * 2;
    canvas.height = cellResult.maskHeight * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);

    // Dark canvas background
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, cellResult.maskWidth, cellResult.maskHeight);

    // Draw baseline
    const baseY = cellResult.maskHeight * (settings.baselinePercent / 100);
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(cellResult.maskWidth, baseY);
    ctx.stroke();

    // Render contours with non-zero fill
    ctx.fillStyle = '#fbbf24'; // Amber-400
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (const item of processedLoops) {
      if (settings.curveMode === 'smooth' && item.beziers && item.beziers.length > 0) {
        const beziers = item.beziers;
        ctx.moveTo(beziers[0].p0.x, beziers[0].p0.y);
        for (const seg of beziers) {
          ctx.quadraticCurveTo(seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y);
        }
      } else {
        const pts = item.simplified.points;
        if (pts.length < 3) continue;
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
      }
      ctx.closePath();
    }
    // Fill uses non-zero winding rule which automatically subtracts holes!
    ctx.fill();
    ctx.stroke();
  }, [
    rectifiedPixels,
    rectifiedWidth,
    rectifiedHeight,
    cols,
    rows,
    previewCharIdx,
    settings.insetPercent,
    settings.threshold,
    settings.invert,
    settings.noiseThresholdPx,
    settings.simplifyTolerance,
    settings.curveMode,
    settings.baselinePercent,
  ]);

  // Execute Vectorization & Font Construction via Web Worker
  const handleVectorizeAndBuild = useCallback(() => {
    if (!rectifiedPixels) return;

    setProcessing(true, 'Tracing pixel-edge boundaries in worker...', 10);
    setWorkerError(null);

    const worker = new Worker(new URL('../workers/fontWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setProcessing(true, msg.stage, msg.percent);
      } else if (msg.type === 'complete') {
        const { glyphs } = msg;
        setGlyphs(glyphs);

        setProcessing(true, 'Assembling TrueType Font (.ttf)...', 90);

        try {
          // Assemble TTF Font
          const font = assembleFont(glyphs, settings, 200);
          const buffer = font.toArrayBuffer();

          // Validate buffer
          const val = validateFontBuffer(buffer, activeChars);
          if (val.valid) {
            setGeneratedTtf(buffer);
          } else {
            console.warn('Font validation warnings:', val.warnings);
            setGeneratedTtf(buffer);
          }

          setProcessing(false);
          worker.terminate();
          setCurrentStep('glyphs');
        } catch (err) {
          setWorkerError(`Font assembly error: ${(err as Error).message}`);
          setProcessing(false);
          worker.terminate();
        }
      } else if (msg.type === 'error') {
        setWorkerError(msg.error);
        setProcessing(false);
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      setWorkerError(`Worker error: ${err.message}`);
      setProcessing(false);
      worker.terminate();
    };

    // Send payload
    worker.postMessage({
      type: 'process_all',
      payload: {
        sourcePixels: rectifiedPixels,
        sourceWidth: rectifiedWidth,
        sourceHeight: rectifiedHeight,
        quad: [
          { x: 0, y: 0 },
          { x: rectifiedWidth, y: 0 },
          { x: rectifiedWidth, y: rectifiedHeight },
          { x: 0, y: rectifiedHeight },
        ],
        characters: activeChars,
        cols,
        rows,
        settings: {
          ...settings,
          insetPercent: customBoxes && customBoxes.length > 0 ? 0 : settings.insetPercent,
        },
        targetResolution: 2000,
        customBoxes: customBoxes && customBoxes.length > 0 ? customBoxes : undefined,
      },
    });
  }, [
    rectifiedPixels,
    rectifiedWidth,
    rectifiedHeight,
    activeChars,
    cols,
    rows,
    settings,
    customBoxes,
    setProcessing,
    setWorkerError,
    setGlyphs,
    setGeneratedTtf,
    setCurrentStep,
  ]);

  const previewChar = activeChars[previewCharIdx] || 'A';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Intro Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-400">
            Step 4 of 7
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
            Contour Tracing & Curve Fitting
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Controlled simplification with Douglas-Peucker. Choose between razor-sharp straight pixel polygons or organic quadratic Béziers with bounded error tolerance.
          </p>
        </div>

        {isProcessing ? (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-zinc-900 border border-amber-500/40 rounded-xl text-xs text-amber-300">
            <Activity className="w-4 h-4 animate-spin text-amber-400" />
            <span>{progressStage}</span>
          </div>
        ) : (
          <button
            onClick={handleVectorizeAndBuild}
            className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-sm transition shadow-lg shadow-amber-500/10"
          >
            <PenTool className="w-4 h-4" />
            <span>Trace All & Build TTF</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Settings Column */}
        <div className="lg:col-span-6 space-y-6">
          {/* Curve Mode A/B Selector */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-3">
              Curve Fitting Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Sharp Mode */}
              <button
                onClick={() => updateSettings({ curveMode: 'sharp' })}
                className={`p-4 rounded-xl border text-left transition flex flex-col justify-between ${
                  settings.curveMode === 'sharp'
                    ? 'bg-amber-500/10 border-amber-500 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div>
                  <span className="font-bold text-sm block text-zinc-100 mb-1">Sharp Polygon</span>
                  <span className="text-xs text-zinc-400 leading-snug">
                    Straight line segments. Maximum fidelity to drawn pixels, great for blocky or geometric hand styles.
                  </span>
                </div>
                {settings.curveMode === 'sharp' && (
                  <span className="text-[11px] font-mono text-amber-400 font-semibold mt-3 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Active
                  </span>
                )}
              </button>

              {/* Smooth Mode */}
              <button
                onClick={() => updateSettings({ curveMode: 'smooth' })}
                className={`p-4 rounded-xl border text-left transition flex flex-col justify-between ${
                  settings.curveMode === 'smooth'
                    ? 'bg-amber-500/10 border-amber-500 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div>
                  <span className="font-bold text-sm block text-zinc-100 mb-1">Smooth Bézier</span>
                  <span className="text-xs text-zinc-400 leading-snug">
                    Quadratic curves through midpoints. Fluid handwriting appearance while strictly respecting tolerance.
                  </span>
                </div>
                {settings.curveMode === 'smooth' && (
                  <span className="text-[11px] font-mono text-amber-400 font-semibold mt-3 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Active
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Douglas-Peucker Tolerance Slider */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Simplification Tolerance (ε)
              </label>
              <span className="font-mono text-xs text-amber-400 font-bold px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700">
                {settings.simplifyTolerance.toFixed(1)} px
              </span>
            </div>
            <p className="text-xs text-zinc-400 mb-3">
              Points with perpendicular deviation under this threshold are merged into smooth segments.
            </p>

            <input
              type="range"
              min={0.2}
              max={4.0}
              step={0.1}
              value={settings.simplifyTolerance}
              onChange={(e) => updateSettings({ simplifyTolerance: parseFloat(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-zinc-950 rounded-lg"
            />

            <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-2 font-mono">
              <span>0.2px (High density / raw)</span>
              <span>4.0px (Simplified / light)</span>
            </div>
          </div>

          {/* Side Bearings (Spacing) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
              Default Glyph Side Bearings (Spacing)
            </label>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-zinc-400">Left Side Bearing (LSB)</span>
                  <span className="font-mono text-amber-400">{settings.leftSideBearing} units</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={140}
                  value={settings.leftSideBearing}
                  onChange={(e) => updateSettings({ leftSideBearing: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-950 rounded-lg"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-zinc-400">Right Side Bearing (RSB)</span>
                  <span className="font-mono text-amber-400">{settings.rightSideBearing} units</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={140}
                  value={settings.rightSideBearing}
                  onChange={(e) => updateSettings({ rightSideBearing: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-950 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Accuracy Guarantee Card */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                Pixel-to-Pixel Guarantee
              </h4>
              <p className="text-xs text-zinc-300 mt-1">
                Accuracy guaranteed within <strong className="text-amber-400 font-mono">±{calculatedErrorPx.toFixed(2)} px</strong> of your drawn ink. Zero artificial smoothing beyond your chosen tolerance.
              </p>
            </div>
          </div>
        </div>

        {/* Live Vector Preview Column */}
        <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Live Vector Glyph Preview: &apos;{previewChar}&apos;
            </span>

            <select
              value={previewCharIdx}
              onChange={(e) => setPreviewCharIdx(parseInt(e.target.value))}
              className="bg-zinc-950 border border-zinc-750 text-xs text-white rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-amber-500"
            >
              {activeChars.map((ch, idx) => (
                <option key={idx} value={idx}>
                  &apos;{ch}&apos; (Cell {idx + 1})
                </option>
              ))}
            </select>
          </div>

          {/* Rendered Vector Canvas */}
          <div className="w-full max-w-[340px] aspect-square rounded-xl bg-zinc-950 border border-zinc-800 shadow-2xl p-4 flex items-center justify-center relative overflow-hidden">
            <canvas ref={previewCanvasRef} className="w-full h-full object-contain" />
          </div>

          <div className="w-full mt-4 p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>Mode: <strong className="text-zinc-200 capitalize">{settings.curveMode}</strong></span>
            <span>Max Deviation: <strong className="text-amber-400">{calculatedErrorPx.toFixed(2)}px</strong></span>
            <span>Winding: <strong className="text-emerald-400">Non-Zero Fill</strong></span>
          </div>

          {isProcessing && (
            <div className="w-full mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-amber-400">
                <span>{progressStage}</span>
                <span className="font-mono">{progressPercent}%</span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
