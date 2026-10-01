import React, { useState, useEffect, useRef } from 'react';
import { Download, Printer, Wand2, ArrowRight, Check, SlidersHorizontal } from 'lucide-react';
import { useFontStore } from '../store/useFontStore';
import { CHARACTER_SETS, renderTemplateToCanvas, generateTemplatePng, generateTemplatePdf, calculateGridDimensions } from '../engine/template';
import { generateSampleHandwrittenSheet } from '../engine/sampleData';

export const TemplateStep: React.FC = () => {
  const {
    characterSetId,
    setCharacterSetId,
    customCharacters,
    setCustomCharacters,
    getActiveCharacters,
    setSourceImage,
    setCurrentStep,
    settings,
    updateSettings,
  } = useFontStore();

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [customText, setCustomText] = useState(customCharacters.join(''));
  const [fontNameInput, setFontNameInput] = useState(settings.familyName);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);

  const activeChars = getActiveCharacters();
  const { cols, rows } = calculateGridDimensions(activeChars.length);

  // Redraw template preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    canvas.width = 1200;
    canvas.height = 1400;

    renderTemplateToCanvas(
      canvas,
      {
        characters: activeChars,
        cols,
        rows,
        cellWidth: 0,
        cellHeight: 0,
        padding: 10,
        baselineRatio: settings.baselinePercent / 100,
        xHeightRatio: settings.xHeightPercent / 100,
      },
      fontNameInput
    );
  }, [activeChars, cols, rows, fontNameInput, settings.baselinePercent, settings.xHeightPercent]);

  const handleDownloadPng = () => {
    const dataUrl = generateTemplatePng(activeChars, fontNameInput);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${fontNameInput || 'font'}-template-300dpi.png`;
    a.click();
  };

  const handleDownloadPdf = () => {
    const blob = generateTemplatePdf(activeChars, fontNameInput);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fontNameInput || 'font'}-template.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadSample = () => {
    setIsGeneratingSample(true);
    setTimeout(() => {
      const { dataUrl } = generateSampleHandwrittenSheet(activeChars, true);
      const img = new Image();
      img.onload = () => {
        // Create canvas to get ImageData
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);

        setSourceImage(dataUrl, img.width, img.height, imgData);
        setIsGeneratingSample(false);
        setCurrentStep('upload_rectify');
      };
      img.src = dataUrl;
    }, 50);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Intro Banner */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-400">
            Step 1 of 7
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
            Printable Template & Character Set
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Choose which characters you want to design, then download a calibrated grid sheet with precise baselines (~78%), x-heights (~42%), and corner alignment targets.
          </p>
        </div>

        {/* Instant Demo Quick Load */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleLoadSample}
            disabled={isGeneratingSample}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 font-semibold text-sm rounded-xl shadow-lg shadow-amber-500/10 transition transform active:scale-95"
          >
            <Wand2 className="w-4 h-4 text-zinc-950" />
            <span>{isGeneratingSample ? 'Preparing Sample...' : 'Try Sample Sheet (1-Click)'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Controls Column */}
        <div className="lg:col-span-5 space-y-6">
          {/* Font Name */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              Font Family Name
            </label>
            <input
              type="text"
              value={fontNameInput}
              onChange={(e) => {
                setFontNameInput(e.target.value);
                updateSettings({ familyName: e.target.value });
              }}
              placeholder="e.g. MyHandwriting, AdelStudioHand"
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-750 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-medium"
            />
          </div>

          {/* Character Set Selection */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">
              Select Character Preset
            </label>
            <div className="space-y-2.5">
              {CHARACTER_SETS.map((preset) => {
                const isSelected = characterSetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setCharacterSetId(preset.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500 text-white'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-zinc-100">{preset.name}</div>
                      <div className="text-xs text-zinc-400 mt-0.5">{preset.description}</div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                  </button>
                );
              })}

              {/* Custom Set Option */}
              <button
                onClick={() => setCharacterSetId('custom')}
                className={`w-full text-left p-3.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                  characterSetId === 'custom'
                    ? 'bg-amber-500/10 border-amber-500 text-white'
                    : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <div>
                  <div className="font-semibold text-sm text-zinc-100">Custom Character List</div>
                  <div className="text-xs text-zinc-400 mt-0.5">Define your own unique set of characters</div>
                </div>
                {characterSetId === 'custom' && <Check className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
              </button>
            </div>

            {/* Custom characters input */}
            {characterSetId === 'custom' && (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <label className="block text-xs text-zinc-400 mb-1.5">
                  Characters to include (no separators needed):
                </label>
                <textarea
                  rows={3}
                  value={customText}
                  onChange={(e) => {
                    const text = e.target.value;
                    setCustomText(text);
                    const chars = Array.from(new Set(text.replace(/[\n\r]/g, '').split(''))).filter(Boolean);
                    setCustomCharacters(chars);
                  }}
                  placeholder="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
                  className="w-full p-2.5 bg-zinc-950 border border-zinc-750 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
                <span className="text-[11px] text-zinc-400 font-mono mt-1 block">
                  Total unique glyphs: {Array.from(new Set(customText.split(''))).filter(Boolean).length}
                </span>
              </div>
            )}
          </div>

          {/* Grid Spec Card */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2 flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
              Generated Grid Metrics
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400 block text-[11px]">Grid Layout</span>
                <span className="font-mono font-semibold text-zinc-100">
                  {cols} cols × {rows} rows
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400 block text-[11px]">Total Glyphs</span>
                <span className="font-mono font-semibold text-amber-400">
                  {activeChars.length} characters
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400 block text-[11px]">Baseline Guide</span>
                <span className="font-mono text-zinc-200">78% down (solid)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400 block text-[11px]">X-Height Guide</span>
                <span className="font-mono text-zinc-200">42% down (dashed)</span>
              </div>
            </div>
          </div>

          {/* Export Template Buttons */}
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleDownloadPdf}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 rounded-xl text-sm font-semibold text-white transition"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Vector PDF</span>
              </button>

              <button
                onClick={handleDownloadPng}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 rounded-xl text-sm font-semibold text-white transition"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>300 DPI PNG</span>
              </button>
            </div>

            <button
              onClick={() => setCurrentStep('upload_rectify')}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-xl text-sm transition shadow-md"
            >
              <span>Next: Upload / Scan Calibration</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Template Preview Column */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Live Template Sheet Preview
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              Fiducial Crosshairs at 4 Corners
            </span>
          </div>

          {/* Canvas Wrapper */}
          <div className="w-full max-w-[480px] aspect-[12/14] bg-white rounded-lg shadow-2xl overflow-hidden border border-zinc-300 relative">
            <canvas
              ref={previewCanvasRef}
              className="w-full h-full object-contain"
            />
          </div>

          <p className="text-xs text-zinc-400 text-center mt-4 max-w-md">
            The small red letters in each box (<span className="text-red-400 font-mono">#c0392b</span>) identify each cell and are automatically excluded by the ink threshold.
          </p>
        </div>
      </div>
    </div>
  );
};
