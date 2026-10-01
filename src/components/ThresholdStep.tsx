import React, { useState, useEffect, useRef } from 'react';
import {
  Sliders,
  Sparkles,
  ArrowRight,
  Sun,
  Moon,
  RefreshCw,
  Eye,
  Crop,
} from 'lucide-react';
import { useFontStore } from '../store/useFontStore';
import { extractCellMask, computeOtsuThreshold } from '../engine/threshold';
import { calculateGridDimensions } from '../engine/template';

export const ThresholdStep: React.FC = () => {
  const {
    rectifiedPixels,
    rectifiedWidth,
    rectifiedHeight,
    getActiveCharacters,
    settings,
    updateSettings,
    autoThreshold,
    setAutoThreshold,
    setCurrentStep,
  } = useFontStore();

  const originalCellCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCellCanvasRef = useRef<HTMLCanvasElement>(null);

  const activeChars = getActiveCharacters();
  const { cols, rows } = calculateGridDimensions(activeChars.length);

  const [previewCellIndex, setPreviewCellIndex] = useState(0);

  // Compute Otsu threshold when entering this step
  useEffect(() => {
    if (rectifiedPixels && autoThreshold === 128) {
      const otsu = computeOtsuThreshold(rectifiedPixels, rectifiedWidth, rectifiedHeight);
      setAutoThreshold(otsu);
      if (settings.threshold === 128) {
        updateSettings({ threshold: otsu });
      }
    }
  }, [rectifiedPixels, rectifiedWidth, rectifiedHeight, autoThreshold, setAutoThreshold, settings.threshold, updateSettings]);

  // Render live cell preview: original cell vs binary mask
  useEffect(() => {
    if (!rectifiedPixels || !originalCellCanvasRef.current || !maskCellCanvasRef.current) return;

    const cellWidth = Math.floor(rectifiedWidth / cols);
    const cellHeight = Math.floor(rectifiedHeight / rows);

    const r = Math.floor(previewCellIndex / cols);
    const c = previewCellIndex % cols;
    const cellX = c * cellWidth;
    const cellY = r * cellHeight;

    const result = extractCellMask(
      rectifiedPixels,
      rectifiedWidth,
      rectifiedHeight,
      cellX,
      cellY,
      cellWidth,
      cellHeight,
      settings.insetPercent,
      settings.threshold,
      settings.invert
    );

    // 1. Draw cropped original cell
    const origCanvas = originalCellCanvasRef.current;
    origCanvas.width = result.maskWidth;
    origCanvas.height = result.maskHeight;
    const origCtx = origCanvas.getContext('2d')!;
    const origImgData = origCtx.createImageData(result.maskWidth, result.maskHeight);
    origImgData.data.set(result.croppedRgba);
    origCtx.putImageData(origImgData, 0, 0);

    // 2. Draw binary mask (black ink on white canvas)
    const maskCanvas = maskCellCanvasRef.current;
    maskCanvas.width = result.maskWidth;
    maskCanvas.height = result.maskHeight;
    const maskCtx = maskCanvas.getContext('2d')!;
    const maskImgData = maskCtx.createImageData(result.maskWidth, result.maskHeight);

    for (let i = 0; i < result.mask.length; i++) {
      const isInk = result.mask[i] === 1;
      const idx = i * 4;
      if (isInk) {
        // Deep ink (black)
        maskImgData.data[idx] = 15;
        maskImgData.data[idx + 1] = 23;
        maskImgData.data[idx + 2] = 42;
        maskImgData.data[idx + 3] = 255;
      } else {
        // Background paper (pure white)
        maskImgData.data[idx] = 255;
        maskImgData.data[idx + 1] = 255;
        maskImgData.data[idx + 2] = 255;
        maskImgData.data[idx + 3] = 255;
      }
    }
    maskCtx.putImageData(maskImgData, 0, 0);
  }, [
    rectifiedPixels,
    rectifiedWidth,
    rectifiedHeight,
    cols,
    rows,
    previewCellIndex,
    settings.insetPercent,
    settings.threshold,
    settings.invert,
  ]);

  if (!rectifiedPixels) {
    return (
      <div className="max-w-xl mx-auto my-16 text-center p-8 bg-zinc-900 border border-zinc-800 rounded-2xl">
        <p className="text-zinc-400 mb-4">Please rectify an image in Step 2 first.</p>
        <button
          onClick={() => setCurrentStep('upload_rectify')}
          className="px-5 py-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl text-sm"
        >
          Go to Step 2
        </button>
      </div>
    );
  }

  const previewChar = activeChars[previewCellIndex] || '?';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Step Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-400">
            Step 3 of 7
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
            Luminance Threshold & Inset Margin
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Cleanly separate drawn ink from paper background. The inset crop isolates the drawing from printed cell borders and red corner labels.
          </p>
        </div>

        <button
          onClick={() => setCurrentStep('vectorize')}
          className="flex items-center gap-2 px-5 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-xl text-sm transition shadow-lg"
        >
          <span>Next: Vectorize Contours</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Settings Column */}
        <div className="lg:col-span-6 space-y-6">
          {/* Threshold Slider Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Ink Luminance Threshold
              </label>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-amber-400 font-bold">
                {settings.threshold} / 255
              </span>
            </div>

            <input
              type="range"
              min={10}
              max={245}
              value={settings.threshold}
              onChange={(e) => updateSettings({ threshold: parseInt(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-zinc-950 rounded-lg"
            />

            <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-2">
              <span>Darker (thinner strokes)</span>
              <span>Lighter (fatter strokes)</span>
            </div>

            {/* Otsu Auto-Suggestion */}
            <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-zinc-300 block">
                  Otsu&apos;s Bimodal Recommendation
                </span>
                <span className="text-[11px] text-zinc-400">
                  Calculated optimal threshold: <strong className="text-amber-400 font-mono">{autoThreshold}</strong>
                </span>
              </div>
              <button
                onClick={() => updateSettings({ threshold: autoThreshold })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Apply Otsu</span>
              </button>
            </div>
          </div>

          {/* Inset Margin Slider Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Crop className="w-3.5 h-3.5 text-amber-400" />
                Cell Inset Margin
              </label>
              <span className="font-mono text-xs text-amber-400 font-bold">
                {settings.insetPercent}%
              </span>
            </div>
            <p className="text-xs text-zinc-400 mb-3">
              Crops off the outer edge of each cell to exclude the printed gray box and faint red corner labels.
            </p>

            <input
              type="range"
              min={4}
              max={24}
              step={1}
              value={settings.insetPercent}
              onChange={(e) => updateSettings({ insetPercent: parseInt(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-zinc-950 rounded-lg"
            />
          </div>

          {/* Invert Ink Toggle & Noise Reduction */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Invert Toggle */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-1">
                  Invert Ink Color
                </span>
                <span className="text-[11px] text-zinc-400">
                  Turn ON if your scan has light/white ink on dark paper.
                </span>
              </div>
              <button
                onClick={() => updateSettings({ invert: !settings.invert })}
                className={`mt-3 w-full py-2 px-3 rounded-lg border text-xs font-medium transition flex items-center justify-center gap-2 ${
                  settings.invert
                    ? 'bg-amber-500/10 border-amber-500 text-amber-400 font-semibold'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {settings.invert ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                <span>{settings.invert ? 'Inverted (Light Ink)' : 'Standard (Dark Ink)'}</span>
              </button>
            </div>

            {/* Noise Speckle Filter */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Noise Filter
                  </span>
                  <span className="font-mono text-xs text-amber-400 font-bold">
                    {settings.noiseThresholdPx}px
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400 block mb-2">
                  Discards isolated dust or paper grain loops smaller than this.
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={8}
                value={settings.noiseThresholdPx}
                onChange={(e) => updateSettings({ noiseThresholdPx: parseInt(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer h-2 bg-zinc-950 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Live Preview Column */}
        <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              Live Threshold Inspection: Letter &apos;{previewChar}&apos;
            </span>

            {/* Cell Selector Slider / Picker */}
            <select
              value={previewCellIndex}
              onChange={(e) => setPreviewCellIndex(parseInt(e.target.value))}
              className="bg-zinc-950 border border-zinc-750 text-xs text-white rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-amber-500"
            >
              {activeChars.map((ch, idx) => (
                <option key={idx} value={idx}>
                  Cell {idx + 1}: &apos;{ch}&apos;
                </option>
              ))}
            </select>
          </div>

          {/* Side-by-Side Comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Original Inset Crop */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
                Source Cell (Inset {settings.insetPercent}%)
              </span>
              <div className="aspect-square bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden flex items-center justify-center p-2">
                <canvas
                  ref={originalCellCanvasRef}
                  className="w-full h-full object-contain filter"
                />
              </div>
            </div>

            {/* Binary Ink Mask */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider block">
                Binary Mask (Threshold {settings.threshold})
              </span>
              <div className="aspect-square bg-zinc-950 rounded-xl border border-amber-500/30 overflow-hidden flex items-center justify-center p-2">
                <canvas
                  ref={maskCellCanvasRef}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-xl text-xs text-zinc-400">
            <p className="leading-relaxed">
              Ensure all strokes of <strong className="text-white">&apos;{previewChar}&apos;</strong> are solid without missing segments, and verify the red template label is completely vanished.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
