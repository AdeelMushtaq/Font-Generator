import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Crop,
  Check,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ZoomIn,
  Move,
  Info,
  Maximize2,
} from 'lucide-react';
import { useFontStore } from '../store/useFontStore';
import { Quad, Point } from '../types';
import { calculateGridDimensions } from '../engine/template';

export const CropRectifyStep: React.FC = () => {
  const {
    sourceImageSrc,
    sourceImageWidth,
    sourceImageHeight,
    sourceImageData,
    quad,
    setQuad,
    resetQuadToImageBounds,
    setSourceImage,
    setRectifiedData,
    rectifiedDataUrl,
    rectifiedPixels,
    setCurrentStep,
    getActiveCharacters,
    settings,
    isProcessing,
    progressStage,
    progressPercent,
    setProcessing,
    setWorkerError,
  } = useFontStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rectifiedCanvasRef = useRef<HTMLCanvasElement>(null);

  const [activeHandle, setActiveHandle] = useState<number | null>(null);
  const [loupePoint, setLoupePoint] = useState<Point | null>(null);
  const [isStraightShortcutUsed, setIsStraightShortcutUsed] = useState(false);

  const activeChars = getActiveCharacters();
  const { cols, rows } = calculateGridDimensions(activeChars.length);

  // File Upload Handler
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Read full pixel buffer via temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);

        setSourceImage(dataUrl, img.width, img.height, imgData);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Convert image pixel coordinates to container client coordinates
  const getContainerScale = useCallback(() => {
    if (!imageRef.current || sourceImageWidth === 0) return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = rect.width / sourceImageWidth;
    const scaleY = rect.height / sourceImageHeight;
    return { scaleX, scaleY, offsetX: rect.left, offsetY: rect.top, width: rect.width, height: rect.height };
  }, [sourceImageWidth, sourceImageHeight]);

  // Pointer drag events for handles
  const handlePointerDown = (handleIdx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveHandle(handleIdx);
    setLoupePoint(quad[handleIdx]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeHandle === null || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();

    const clientX = e.clientX;
    const clientY = e.clientY;

    // Constrain to image bounds
    const clampedX = Math.max(rect.left, Math.min(rect.right, clientX));
    const clampedY = Math.max(rect.top, Math.min(rect.bottom, clientY));

    const imgX = Math.round(((clampedX - rect.left) / rect.width) * sourceImageWidth);
    const imgY = Math.round(((clampedY - rect.top) / rect.height) * sourceImageHeight);

    const newQuad: Quad = [...quad] as Quad;
    newQuad[activeHandle] = { x: imgX, y: imgY };
    setQuad(newQuad);
    setLoupePoint({ x: imgX, y: imgY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeHandle !== null) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
      setActiveHandle(null);
      setLoupePoint(null);
    }
  };

  // Execute Projective Rectification via Web Worker
  const runRectification = useCallback(() => {
    if (!sourceImageData) return;

    setProcessing(true, 'Initiating Heckbert rectification worker...', 10);
    setWorkerError(null);

    const worker = new Worker(new URL('../workers/fontWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setProcessing(true, msg.stage, msg.percent);
      } else if (msg.type === 'complete') {
        const { rectifiedBuffer, rectifiedWidth, rectifiedHeight, autoThreshold } = msg;

        // Render to canvas to create dataUrl and keep state
        const canvas = document.createElement('canvas');
        canvas.width = rectifiedWidth;
        canvas.height = rectifiedHeight;
        const ctx = canvas.getContext('2d')!;
        const imgData = ctx.createImageData(rectifiedWidth, rectifiedHeight);
        imgData.data.set(rectifiedBuffer);
        ctx.putImageData(imgData, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');

        setRectifiedData(rectifiedBuffer, rectifiedWidth, rectifiedHeight, dataUrl);
        setProcessing(false);
        worker.terminate();
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
        sourcePixels: sourceImageData.data,
        sourceWidth: sourceImageWidth,
        sourceHeight: sourceImageHeight,
        quad,
        characters: activeChars,
        cols,
        rows,
        settings,
        targetResolution: 2000,
      },
    });
  }, [sourceImageData, sourceImageWidth, sourceImageHeight, quad, activeChars, cols, rows, settings, setProcessing, setRectifiedData, setWorkerError]);

  // Redraw preview of rectified canvas if available
  useEffect(() => {
    if (rectifiedPixels && rectifiedCanvasRef.current) {
      const canvas = rectifiedCanvasRef.current;
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d')!;

      // Create scaled offscreen
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = 2000;
      fullCanvas.height = 2000;
      const fullCtx = fullCanvas.getContext('2d')!;
      const imgData = fullCtx.createImageData(2000, 2000);
      imgData.data.set(rectifiedPixels);
      fullCtx.putImageData(imgData, 0, 0);

      ctx.drawImage(fullCanvas, 0, 0, 400, 400);
    }
  }, [rectifiedPixels]);

  // Labels for the 4 corners
  const CORNER_LABELS = [
    { name: '1: Top-Left (TL)', color: 'border-amber-400 text-amber-300' },
    { name: '2: Top-Right (TR)', color: 'border-blue-400 text-blue-300' },
    { name: '3: Bottom-Right (BR)', color: 'border-emerald-400 text-emerald-300' },
    { name: '4: Bottom-Left (BL)', color: 'border-rose-400 text-rose-300' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Intro Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-400">
            Step 2 of 7
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
            Perspective Rectification (4-Point Heckbert Map)
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Align the 4 handles (TL, TR, BR, BL) to the outer corners of your template. Our projective homography mapping will mathematically de-skew the photo into an orthogonal 2000×2000 canvas.
          </p>
        </div>

        {/* Shortcuts */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              resetQuadToImageBounds();
              setIsStraightShortcutUsed(true);
            }}
            className="px-3.5 py-2 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition"
            title="Sets corners directly to image boundaries if already straight"
          >
            Already Straight, Skip
          </button>

          <button
            onClick={resetQuadToImageBounds}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg border border-zinc-700 transition"
            title="Reset handles"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!sourceImageSrc ? (
        // Empty State: Upload Prompt
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileUpload(file);
          }}
          className="border-2 border-dashed border-zinc-700 hover:border-amber-500 rounded-2xl p-12 text-center bg-zinc-900/40 hover:bg-zinc-900/80 transition cursor-pointer max-w-2xl mx-auto my-12"
        >
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">
            Upload your filled template photo or scan
          </h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto mb-6">
            Accepts any resolution (PNG, JPG, WebP). If photographed on a desk, our 4-point corner tool will correct perspective keystoning.
          </p>
          <button className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-sm transition">
            Choose File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className="hidden"
          />
        </div>
      ) : (
        // Interactive 4-Point Corner Picker
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Corner Viewport */}
          <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-3 text-xs">
              <span className="text-zinc-400 font-medium flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-amber-400" />
                Drag the 4 numbered corner pins to align with sheet corners
              </span>
              <span className="font-mono text-zinc-400">
                Resolution: {sourceImageWidth}×{sourceImageHeight}px
              </span>
            </div>

            {/* Interactive Image Container */}
            <div
              ref={containerRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative w-full max-w-[640px] select-none touch-none rounded-lg overflow-hidden border border-zinc-700 bg-zinc-950"
            >
              <img
                ref={imageRef}
                src={sourceImageSrc}
                alt="Source template"
                className="w-full h-auto block pointer-events-none"
              />

              {/* SVG Overlay for quad boundary line */}
              {imageRef.current && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox={`0 0 ${sourceImageWidth} ${sourceImageHeight}`}
                >
                  <polygon
                    points={`${quad[0].x},${quad[0].y} ${quad[1].x},${quad[1].y} ${quad[2].x},${quad[2].y} ${quad[3].x},${quad[3].y}`}
                    fill="rgba(245, 158, 11, 0.12)"
                    stroke="rgba(245, 158, 11, 0.9)"
                    strokeWidth={Math.max(3, Math.round(sourceImageWidth * 0.002))}
                    strokeDasharray="6 4"
                  />
                </svg>
              )}

              {/* 4 Interactive Handles */}
              {quad.map((pt, idx) => {
                const leftPct = (pt.x / sourceImageWidth) * 100;
                const topPct = (pt.y / sourceImageHeight) * 100;
                const isSelected = activeHandle === idx;

                return (
                  <div
                    key={idx}
                    onPointerDown={(e) => handlePointerDown(idx, e)}
                    style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full cursor-grab active:cursor-grabbing flex items-center justify-center font-mono font-bold text-xs shadow-2xl transition-transform ${
                      isSelected
                        ? 'scale-125 bg-amber-400 text-zinc-950 ring-4 ring-amber-500/40 z-30'
                        : 'bg-zinc-900/95 text-white border-2 border-amber-400 hover:scale-110 z-20'
                    }`}
                  >
                    {idx + 1}
                  </div>
                );
              })}
            </div>

            {/* Loupe / Magnifier helper */}
            {loupePoint && (
              <div className="mt-3 flex items-center gap-2 text-xs font-mono text-zinc-400">
                <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  Corner {activeHandle !== null ? activeHandle + 1 : ''} at ({loupePoint.x}, {loupePoint.y}) px
                </span>
              </div>
            )}
          </div>

          {/* Sidebar & Action Controls */}
          <div className="lg:col-span-4 space-y-6">
            {/* Corner Coordinates List */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">
                Selected Quad Coordinates
              </h3>
              <div className="space-y-2">
                {CORNER_LABELS.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs"
                  >
                    <span className="font-semibold text-zinc-300">{item.name}</span>
                    <span className="font-mono text-amber-400">
                      {quad[idx].x}, {quad[idx].y}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rectify Action Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                Projective Warping Engine
              </h3>
              <p className="text-xs text-zinc-400 mb-4">
                Executes forward rational Heckbert mapping with bilinear interpolation in an Offscreen Worker to generate a 2000×2000 orthogonal canvas.
              </p>

              {isProcessing ? (
                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-400 font-medium">{progressStage}</span>
                    <span className="font-mono text-zinc-400">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-500 h-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={runRectification}
                  className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-sm transition shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2"
                >
                  <Crop className="w-4 h-4 text-zinc-950" />
                  <span>{rectifiedPixels ? 'Re-Run Rectification' : 'Rectify & Flatten Image'}</span>
                </button>
              )}
            </div>

            {/* Rectified Output Preview (if already done) */}
            {rectifiedPixels && (
              <div className="bg-zinc-900 border border-emerald-500/30 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    Rectification Complete
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400">2000×2000 px</span>
                </div>

                <div className="w-full aspect-square bg-zinc-950 rounded-lg overflow-hidden border border-zinc-700 flex items-center justify-center">
                  <canvas ref={rectifiedCanvasRef} className="w-full h-full object-contain" />
                </div>

                <button
                  onClick={() => setCurrentStep('threshold')}
                  className="w-full py-3 px-4 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-xl text-sm transition flex items-center justify-center gap-2"
                >
                  <span>Proceed to Thresholding</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
