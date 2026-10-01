import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload,
  Zap,
  Download,
  CheckCircle2,
  Sparkles,
  Type,
  Sliders,
  RotateCcw,
  SlidersHorizontal,
  PenTool,
  Check,
  Eye,
  ArrowRight,
  ShieldCheck,
  Layers,
  Sun,
  Moon,
  Grid,
  Maximize2,
  RefreshCw,
  Move,
  Wand2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useFontStore } from '../store/useFontStore';
import { calculateGridDimensions } from '../engine/template';
import { generateSampleHandwrittenSheet } from '../engine/sampleData';
import { assembleFont } from '../engine/fontBuilder';
import {
  detectDarkBackground,
  CLASSIC_7_LINE_SPECIMEN,
  computeLayoutBoxes,
  LetterBox,
  SheetLayout,
} from '../engine/autoSegment';
import { segmentByProjectionValleys } from '../engine/profileSegmentation';
import { cleanAllGlyphs, cleanStrayArtifacts } from '../engine/cleanGlyphs';
import { renderPdfFirstPage } from '../engine/pdfReader';
import { Quad } from '../types';

export const QuickConverter: React.FC = () => {
  const {
    getActiveCharacters,
    sourceImageSrc,
    sourceImageData,
    sourceImageWidth,
    sourceImageHeight,
    setSourceImage,
    settings,
    updateSettings,
    glyphs,
    setGlyphs,
    generatedTtfBuffer,
    setGeneratedTtf,
    fontFamilyCssName,
    setRectifiedData,
    setAppMode,
    setCurrentStep,
    setDiffInspectorGlyph,
    customBoxes,
    setCustomBoxes,
  } = useFontStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStage, setProgressStage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  // Layout mode
  const [layoutMode, setLayoutMode] = useState<'specimen_7line' | 'equal_grid'>('specimen_7line');
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);

  // Fine-tuning adjustments (Offsets & Margins)
  const [marginX, setMarginX] = useState(4);
  const [marginY, setMarginY] = useState(3);
  const [offsetX, setOffsetX] = useState(0); // Horizontal shift in px
  const [offsetY, setOffsetY] = useState(0); // Vertical shift in px

  // Ink Sensitivity / Threshold state (Default 30 for dark background so metallic/gold is 100% captured!)
  const [inkSensitivity, setInkSensitivity] = useState(settings.invert ? 30 : 128);

  // Type tester local state
  const [testText, setTestText] = useState('ABCDEFGHI JKLMNOPQR STUVWXYZ\nabcdefghi jklmnopqr stuvwxyz 0123456789\nThe quick brown fox jumps over the lazy dog!');
  const [fontSize, setFontSize] = useState(52);
  const [letterSpacing, setLetterSpacing] = useState(0);

  // Compute active boxes
  const activeBoxes: LetterBox[] = useMemo(() => {
    let baseBoxes: LetterBox[] = [];

    if (customBoxes && customBoxes.length > 0) {
      baseBoxes = customBoxes;
    } else if (sourceImageWidth && sourceImageHeight) {
      if (layoutMode === 'specimen_7line') {
        baseBoxes = computeLayoutBoxes(sourceImageWidth, sourceImageHeight, CLASSIC_7_LINE_SPECIMEN, marginX, marginY);
      } else {
        const chars = getActiveCharacters();
        const { cols, rows } = calculateGridDimensions(chars.length);
        const cellW = sourceImageWidth / cols;
        const cellH = sourceImageHeight / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            if (idx < chars.length) {
              baseBoxes.push({
                char: chars[idx],
                x: Math.round(c * cellW),
                y: Math.round(r * cellH),
                width: Math.round(cellW),
                height: Math.round(cellH),
                row: r,
                col: c,
              });
            }
          }
        }
      }
    }

    if (offsetX === 0 && offsetY === 0) return baseBoxes;

    // Apply fine offsets
    return baseBoxes.map((b) => ({
      ...b,
      x: Math.max(0, b.x + offsetX),
      y: Math.max(0, b.y + offsetY),
    }));
  }, [customBoxes, sourceImageWidth, sourceImageHeight, layoutMode, marginX, marginY, offsetX, offsetY, getActiveCharacters]);

  // Draw overlay bounding boxes
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !sourceImageSrc || activeBoxes.length === 0) return;

    canvas.width = sourceImageWidth;
    canvas.height = sourceImageHeight;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showBoundingBoxes) return;

    for (const b of activeBoxes) {
      // Stroke box
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
      ctx.lineWidth = Math.max(2, Math.round(sourceImageWidth * 0.002));
      ctx.strokeRect(b.x + 1, b.y + 1, b.width - 2, b.height - 2);

      // Character tag
      const fontSize = Math.max(13, Math.round(b.height * 0.16));
      ctx.font = `bold ${fontSize}px monospace`;
      const textMetrics = ctx.measureText(b.char);
      const textW = textMetrics.width;

      ctx.fillStyle = 'rgba(245, 158, 11, 0.95)';
      ctx.fillRect(b.x + 3, b.y + 3, textW + 8, fontSize + 4);

      ctx.fillStyle = '#09090b';
      ctx.fillText(b.char, b.x + 7, b.y + fontSize + 1);
    }
  }, [sourceImageSrc, sourceImageWidth, sourceImageHeight, activeBoxes, showBoundingBoxes]);

  // Run Smart Auto-Fit on uploaded image using Empty Valley Profile Segmentation
  const handleAutoFit = () => {
    if (!sourceImageData) return;
    const fitted = segmentByProjectionValleys(
      sourceImageData.data,
      sourceImageWidth,
      sourceImageHeight,
      settings.invert,
      inkSensitivity,
      CLASSIC_7_LINE_SPECIMEN
    );
    setCustomBoxes(fitted);
    setOffsetX(0);
    setOffsetY(0);
  };

  // File Upload Handler (Supports Vector PDF, SVG, PNG, JPG)
  const handleFile = async (file: File) => {
    // 1. Vector PDF Support via client-side high-DPI rendering
    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      setIsProcessing(true);
      setProgressStage('Rasterizing Vector PDF at 300 DPI (Crystal Clear)...');
      setProgressPercent(25);

      try {
        const buffer = await file.arrayBuffer();
        const { dataUrl, imageData, width, height } = await renderPdfFirstPage(buffer, 2.5);

        const isDark = detectDarkBackground(imageData.data, width, height);
        const newThresh = isDark ? 30 : 128;
        setInkSensitivity(newThresh);

        updateSettings({
          invert: isDark,
          threshold: newThresh,
          insetPercent: 0,
          noiseThresholdPx: 1,
        });

        setLayoutMode('specimen_7line');

        const fitted = segmentByProjectionValleys(
          imageData.data,
          width,
          height,
          isDark,
          newThresh,
          CLASSIC_7_LINE_SPECIMEN
        );
        setCustomBoxes(fitted);
        setOffsetX(0);
        setOffsetY(0);

        setSourceImage(dataUrl, width, height, imageData);
        setIsProcessing(false);
      } catch (err) {
        alert(`PDF Loading Error: ${(err as Error).message}`);
        setIsProcessing(false);
      }
      return;
    }

    // 2. Standard Image (PNG, JPG, WebP, SVG)
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);

        // Auto-detect background polarity!
        const isDark = detectDarkBackground(imgData.data, img.width, img.height);
        const newThresh = isDark ? 30 : 128;
        setInkSensitivity(newThresh);

        updateSettings({
          invert: isDark,
          threshold: newThresh,
          insetPercent: 0, // No inset clipping!
          noiseThresholdPx: 1, // Keep fine handwriting strokes!
        });

        // Default to 7-line layout for specimen sheets
        setLayoutMode('specimen_7line');

        // Automatically detect empty valleys between lines and letters!
        const fitted = segmentByProjectionValleys(
          imgData.data,
          img.width,
          img.height,
          isDark,
          newThresh,
          CLASSIC_7_LINE_SPECIMEN
        );
        setCustomBoxes(fitted);
        setOffsetX(0);
        setOffsetY(0);

        setSourceImage(dataUrl, img.width, img.height, imgData);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // 1-Click Sample Sheet Generator
  const handleLoadSample = () => {
    setIsProcessing(true);
    setProgressStage('Generating sample handwritten sheet...');
    setProgressPercent(20);

    setTimeout(() => {
      const chars = CLASSIC_7_LINE_SPECIMEN.charactersPerLine.flat();
      const { dataUrl } = generateSampleHandwrittenSheet(chars, false);
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);

        const isDark = detectDarkBackground(imgData.data, img.width, img.height);
        const newThresh = isDark ? 30 : 128;
        setInkSensitivity(newThresh);

        updateSettings({
          invert: isDark,
          threshold: newThresh,
          insetPercent: 0,
          noiseThresholdPx: 1,
        });

        setLayoutMode('specimen_7line');

        const fitted = segmentByProjectionValleys(
          imgData.data,
          img.width,
          img.height,
          isDark,
          newThresh,
          CLASSIC_7_LINE_SPECIMEN
        );
        setCustomBoxes(fitted);
        setOffsetX(0);
        setOffsetY(0);

        setSourceImage(dataUrl, img.width, img.height, imgData);
        setIsProcessing(false);

        // Run conversion
        convertImageToTtf(imgData, img.width, img.height, fitted);
      };
      img.src = dataUrl;
    }, 40);
  };

  // Core 1-Click Fast Conversion Pipeline
  const convertImageToTtf = (
    imgDataParam?: ImageData,
    widthParam?: number,
    heightParam?: number,
    boxesParam?: LetterBox[]
  ) => {
    const imgData = imgDataParam || sourceImageData;
    const width = widthParam || sourceImageWidth;
    const height = heightParam || sourceImageHeight;
    const boxes = boxesParam || activeBoxes;

    if (!imgData || width === 0 || height === 0) return;

    setIsProcessing(true);
    setProgressStage('Extracting 1:1 solid ink contours...');
    setProgressPercent(20);

    const fullQuad: Quad = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];

    const worker = new Worker(new URL('../workers/fontWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setProgressStage(msg.stage);
        setProgressPercent(msg.percent);
      } else if (msg.type === 'complete') {
        const { glyphs: extractedGlyphs, rectifiedBuffer, rectifiedWidth, rectifiedHeight } = msg;

        setProgressStage('Cleaning neighbor artifacts & assembling TTF...');
        setProgressPercent(95);

        // Auto-purge any stray neighbor strokes
        const cleanedGlyphs = cleanAllGlyphs(extractedGlyphs);

        setRectifiedData(rectifiedBuffer, rectifiedWidth, rectifiedHeight);
        setGlyphs(cleanedGlyphs);

        try {
          const font = assembleFont(cleanedGlyphs, {
            ...settings,
            threshold: inkSensitivity,
            insetPercent: 0,
            noiseThresholdPx: 1,
          }, 200);

          const buffer = font.toArrayBuffer();
          setGeneratedTtf(buffer);

          try {
            confetti({
              particleCount: 120,
              spread: 80,
              origin: { y: 0.6 },
              colors: ['#f59e0b', '#fbbf24', '#10b981', '#38bdf8'],
            });
          } catch {
            // safe fallback
          }

          setIsProcessing(false);
          worker.terminate();
        } catch (err) {
          alert(`Font assembly error: ${(err as Error).message}`);
          setIsProcessing(false);
          worker.terminate();
        }
      } else if (msg.type === 'error') {
        alert(`Error: ${msg.error}`);
        setIsProcessing(false);
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      alert(`Worker error: ${err.message}`);
      setIsProcessing(false);
      worker.terminate();
    };

    const targetChars = boxes.map((b) => b.char);

    worker.postMessage({
      type: 'process_all',
      payload: {
        sourcePixels: imgData.data,
        sourceWidth: width,
        sourceHeight: height,
        quad: fullQuad,
        characters: targetChars,
        cols: 9,
        rows: 7,
        settings: {
          ...settings,
          threshold: inkSensitivity,
          insetPercent: 0, // No inset cutting!
          noiseThresholdPx: 1, // Keep delicate cursive loops!
        },
        targetResolution: 2000,
        customBoxes: boxes,
      },
    });
  };

  const handleDownloadTtf = () => {
    if (!generatedTtfBuffer) return;
    const blob = new Blob([generatedTtfBuffer], { type: 'font/ttf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settings.familyName.replace(/\s+/g, '')}-${settings.styleName}.ttf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isFontReady = !!generatedTtfBuffer && glyphs.length > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header Banner */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-semibold mb-3">
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span>FAST 1-CLICK FONT BUILDER</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Upload Image with Letters → Instant .TTF Font
        </h1>
        <p className="text-sm sm:text-base text-zinc-400 mt-2 max-w-2xl mx-auto">
          Every letter box is aligned to the blank gaps between characters. Stray edge leaks from neighbor letters are automatically purified for 100% solid, crisp calligraphy.
        </p>
      </div>

      {!isFontReady ? (
        /* ================= STATE 1: UPLOAD & CONVERT ================= */
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Image Dropzone & Visual Box Overlay */}
              <div className="lg:col-span-6 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    1. Upload Letter Sheet
                  </label>
                  {sourceImageSrc && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAutoFit}
                        className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-750 flex items-center gap-1 font-medium transition"
                        title="Re-run empty valley detection"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Auto-Fit Valleys</span>
                      </button>

                      <button
                        onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition ${
                          showBoundingBoxes
                            ? 'bg-amber-500/10 border-amber-500 text-amber-300 font-semibold'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {showBoundingBoxes ? '✓ Boxes On' : 'Boxes Off'}
                      </button>
                    </div>
                  )}
                </div>

                {!sourceImageSrc ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleFile(f);
                    }}
                    className="border-2 border-dashed border-zinc-700 hover:border-amber-500 bg-zinc-950/60 hover:bg-zinc-950 rounded-xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[300px]"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3">
                      <Upload className="w-7 h-7" />
                    </div>
                    <span className="font-semibold text-sm text-white mb-1">
                      Drop your Vector PDF or Font Image here
                    </span>
                    <span className="text-xs text-zinc-400 mb-4 max-w-xs">
                      Supports Vector PDF, SVG, PNG, JPG (Dark background or white paper)
                    </span>
                    <button className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition">
                      Browse File
                    </button>
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-zinc-750 bg-zinc-950 flex flex-col items-center justify-center">
                    <div className="relative w-full max-h-[420px] overflow-auto flex items-center justify-center p-2 bg-black">
                      <img
                        src={sourceImageSrc}
                        alt="Uploaded letters"
                        className="max-h-[380px] w-auto object-contain block"
                      />
                      {/* Bounding Box Canvas Overlay */}
                      <canvas
                        ref={overlayCanvasRef}
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      />
                    </div>

                    <div className="w-full p-3 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-mono">
                        {activeBoxes.length} letters mapped ({sourceImageWidth}×{sourceImageHeight}px)
                      </span>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-medium"
                      >
                        Replace Image
                      </button>
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.svg,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className="hidden"
                />

                {/* Fine Alignment Controls (Shift X / Shift Y) */}
                {sourceImageSrc && (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                        <Move className="w-3.5 h-3.5 text-amber-400" />
                        <span>Adjust Box Positions (If any letter is slightly shifted)</span>
                      </span>
                      <button
                        onClick={() => {
                          setOffsetX(0);
                          setOffsetY(0);
                        }}
                        className="text-[10px] text-zinc-400 hover:text-amber-400 font-mono"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                          <span>Shift Left / Right:</span>
                          <span className="font-mono text-amber-400">{offsetX > 0 ? `+${offsetX}` : offsetX}px</span>
                        </div>
                        <input
                          type="range"
                          min={-60}
                          max={60}
                          value={offsetX}
                          onChange={(e) => setOffsetX(parseInt(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                          <span>Shift Up / Down:</span>
                          <span className="font-mono text-amber-400">{offsetY > 0 ? `+${offsetY}` : offsetY}px</span>
                        </div>
                        <input
                          type="range"
                          min={-40}
                          max={40}
                          value={offsetY}
                          onChange={(e) => setOffsetY(parseInt(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-zinc-400">Need a sample to test?</span>
                  <button
                    onClick={handleLoadSample}
                    disabled={isProcessing}
                    className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-semibold"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Try Sample Sheet (1-Click Demo)</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Layout, Background Polarity & Convert */}
              <div className="lg:col-span-6 space-y-4">
                {/* Font Name */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Font Family Name
                  </label>
                  <input
                    type="text"
                    value={settings.familyName}
                    onChange={(e) => updateSettings({ familyName: e.target.value })}
                    placeholder="e.g. MyCalligraphyFont"
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-750 rounded-xl text-sm font-semibold text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Background Polarity Toggle */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                      Background Color & Ink Polarity
                    </span>
                    <span className="text-[11px] font-mono text-amber-400">
                      {settings.invert ? '🌙 Dark Background' : '☀️ Light Paper'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        updateSettings({ invert: true, threshold: 30 });
                        setInkSensitivity(30);
                      }}
                      className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition ${
                        settings.invert
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-bold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>Dark/Black Background (Gold/Light text)</span>
                    </button>

                    <button
                      onClick={() => {
                        updateSettings({ invert: false, threshold: 128 });
                        setInkSensitivity(128);
                      }}
                      className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition ${
                        !settings.invert
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-bold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      <span>White/Light Paper (Dark ink)</span>
                    </button>
                  </div>
                </div>

                {/* Sheet Layout Mode */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2">
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Sheet Layout Preset
                  </label>

                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setLayoutMode('specimen_7line');
                        setCustomBoxes(null);
                      }}
                      className={`w-full p-2.5 rounded-lg border text-left text-xs transition flex items-start justify-between ${
                        layoutMode === 'specimen_7line'
                          ? 'bg-amber-500/15 border-amber-500 text-white font-semibold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="text-zinc-100 font-bold">Standard 7-Line Sheet (A-Z, a-z, 0-9)</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          Line 1: A-I (9) • Line 2: J-R (9) • Line 3: S-Z (8) • Line 4: a-i (9) • Line 5: j-r (9) • Line 6: s-z (8) • Line 7: 0-9 (10)
                        </div>
                      </div>
                      {layoutMode === 'specimen_7line' && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                    </button>

                    <button
                      onClick={() => {
                        setLayoutMode('equal_grid');
                        setCustomBoxes(null);
                      }}
                      className={`w-full p-2.5 rounded-lg border text-left text-xs transition flex items-start justify-between ${
                        layoutMode === 'equal_grid'
                          ? 'bg-amber-500/15 border-amber-500 text-white font-semibold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="text-zinc-100 font-bold">Uniform Grid (8×8 Cells)</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          Equal sized square boxes (Font Creator template format)
                        </div>
                      </div>
                      {layoutMode === 'equal_grid' && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                    </button>
                  </div>
                </div>

                {/* Ink Threshold / Sensitivity */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-zinc-200 block">Ink Sensitivity (Solid Strokes)</span>
                      <span className="text-[11px] text-zinc-400">
                        {settings.invert
                          ? 'Set lower (20-35) to capture all gold/shaded parts of the stroke'
                          : 'Set higher (120-160) to keep thick lines'}
                      </span>
                    </div>
                    <span className="font-mono text-amber-400 font-bold px-2 py-0.5 rounded bg-zinc-900 border border-zinc-750">
                      {inkSensitivity}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={settings.invert ? 15 : 60}
                    max={settings.invert ? 100 : 200}
                    value={inkSensitivity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setInkSensitivity(val);
                      updateSettings({ threshold: val });
                    }}
                    className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                    <span>{settings.invert ? 'Full Solid Stroke (Sensitive)' : 'Thin Stroke'}</span>
                    <span>{settings.invert ? 'Glitter Only (Faint)' : 'Bold Stroke'}</span>
                  </div>
                </div>

                {/* Big Action Button */}
                <div className="pt-2">
                  {isProcessing ? (
                    <div className="p-4 bg-zinc-950 border border-amber-500/40 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs text-amber-400 font-semibold">
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
                  ) : (
                    <button
                      onClick={() => convertImageToTtf()}
                      disabled={!sourceImageSrc}
                      className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 disabled:opacity-40 text-zinc-950 font-extrabold text-base rounded-xl transition shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transform active:scale-98"
                    >
                      <Zap className="w-5 h-5 fill-current" />
                      <span>{sourceImageSrc ? '⚡ Create .TTF Font Now' : 'Upload Image to Start'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Pro Switcher Link */}
          <div className="text-center">
            <button
              onClick={() => {
                setAppMode('pro');
                setCurrentStep('glyphs');
              }}
              className="text-xs text-zinc-400 hover:text-amber-400 transition underline underline-offset-4"
            >
              Need to inspect individual glyph vector diffs or touch up strokes? Open Glyphs QA →
            </button>
          </div>
        </div>
      ) : (
        /* ================= STATE 2: FONT READY & DOWNLOAD ================= */
        <div className="space-y-6">
          {/* Success Banner & Download Action */}
          <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900 border border-emerald-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
                <CheckCircle2 className="w-4 h-4" /> Font Generated Successfully!
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {settings.familyName}-{settings.styleName}.ttf is ready
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                {glyphs.length} characters assembled • 1000 UnitsPerEm • TrueType (.ttf) format
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={handleDownloadTtf}
                className="py-3.5 px-6 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-sm transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transform active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Download .TTF Font</span>
              </button>

              <button
                onClick={() => {
                  setGeneratedTtf(null);
                  setGlyphs([]);
                }}
                className="py-3.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-sm font-semibold transition"
              >
                Re-upload / Adjust
              </button>
            </div>
          </div>

          {/* Live Typing Sandbox */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-zinc-800 text-xs">
              <span className="font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <Type className="w-4 h-4 text-amber-400" />
                Live Type Tester (Rendered in your custom font)
              </span>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">Size:</span>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                    className="w-24 accent-amber-500"
                  />
                  <span className="font-mono text-amber-400 w-8">{fontSize}px</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-zinc-400">Spacing:</span>
                  <input
                    type="range"
                    min={-4}
                    max={16}
                    value={letterSpacing}
                    onChange={(e) => setLetterSpacing(parseInt(e.target.value))}
                    className="w-20 accent-amber-500"
                  />
                  <span className="font-mono text-amber-400 w-7">{letterSpacing}px</span>
                </div>
              </div>
            </div>

            {/* Editable Sandbox */}
            <div className="bg-zinc-950 rounded-xl border border-zinc-800 p-6 min-h-[220px]">
              <textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                style={{
                  fontFamily: fontFamilyCssName,
                  fontSize: `${fontSize}px`,
                  letterSpacing: `${letterSpacing}px`,
                }}
                className="w-full h-full min-h-[160px] bg-transparent resize-none border-none outline-none text-zinc-100 leading-relaxed block tracking-normal"
                placeholder="Type anything in your generated font..."
              />
            </div>
          </div>

          {/* Glyphs Quick QA Overview */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Traced Letters Gallery ({glyphs.length})
                </h3>
                <p className="text-xs text-zinc-400">
                  Every letter extracted from your image. Click to inspect vector overlay.
                </p>
              </div>

              <button
                onClick={() => {
                  setAppMode('pro');
                  setCurrentStep('glyphs');
                }}
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
              >
                <span>Open Advanced QA & Diff Inspector</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {glyphs.map((g) => (
                <div
                  key={g.id}
                  onClick={() => setDiffInspectorGlyph(g)}
                  className="p-2.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/50 rounded-xl flex flex-col items-center justify-center cursor-pointer transition group"
                  title="Click to inspect vector diff overlay"
                >
                  <span className="font-mono text-[10px] text-zinc-400 mb-1">{g.char}</span>
                  <div
                    className="text-2xl text-white group-hover:text-amber-400 transition"
                    style={{ fontFamily: fontFamilyCssName }}
                  >
                    {g.char}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
