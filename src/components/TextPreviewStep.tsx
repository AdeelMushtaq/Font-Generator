import React, { useState } from 'react';
import {
  Type,
  Sliders,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  SlidersHorizontal,
  ArrowRight,
  Palette,
  RotateCcw,
} from 'lucide-react';
import { useFontStore } from '../store/useFontStore';

const PANGRAMS = [
  'The quick brown fox jumps over the lazy dog.',
  'Pack my box with five dozen liquor jugs!',
  'Sphinx of black quartz, judge my vow.',
  'How razorback-jumping frogs can level six piqued gymnasts?',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789',
];

export const TextPreviewStep: React.FC = () => {
  const {
    fontFamilyCssName,
    settings,
    setKerningModalOpen,
    setCurrentStep,
    glyphs,
  } = useFontStore();

  const [text, setText] = useState(
    'The quick brown fox jumps over the lazy dog.\nPack my box with five dozen liquor jugs!'
  );
  const [fontSize, setFontSize] = useState(48);
  const [lineHeight, setLineHeight] = useState(1.4);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
  const [theme, setTheme] = useState<'dark' | 'paper' | 'sepia'>('dark');

  if (glyphs.length === 0) {
    return (
      <div className="max-w-xl mx-auto my-16 text-center p-8 bg-zinc-900 border border-zinc-800 rounded-2xl">
        <p className="text-zinc-400 mb-4">No font has been assembled yet.</p>
        <button
          onClick={() => setCurrentStep('vectorize')}
          className="px-5 py-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl text-sm"
        >
          Go to Step 4 (Vectorize)
        </button>
      </div>
    );
  }

  const themeClasses = {
    dark: 'bg-zinc-950 text-zinc-100 border-zinc-800',
    paper: 'bg-[#faf8f5] text-[#1c1917] border-stone-300 shadow-inner',
    sepia: 'bg-[#f4ebd9] text-[#3e2723] border-[#d7ccc8]',
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-400">
            Step 6 of 7
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
            Live Interactive Type Tester
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Type anything in your live generated font. Test letterforms, pangrams, paragraph flow, and fine-tune kerning collisions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setKerningModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-amber-500/40 text-amber-300 font-semibold rounded-xl text-sm transition"
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            <span>Kerning Editor</span>
          </button>

          <button
            onClick={() => setCurrentStep('export')}
            className="flex items-center gap-2 px-5 py-2.5 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-xl text-sm transition shadow-lg"
          >
            <span>Next: Export TTF</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Control Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
        {/* Pangram Preset Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto text-xs py-1">
          <span className="text-zinc-400 font-semibold">Presets:</span>
          {PANGRAMS.map((pangram, i) => (
            <button
              key={i}
              onClick={() => setText(pangram)}
              className="px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 whitespace-nowrap transition"
            >
              {pangram.slice(0, 16)}...
            </button>
          ))}
        </div>

        {/* Sliders & Theme */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Font Size */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Size:</span>
            <input
              type="range"
              min={18}
              max={120}
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className="w-24 accent-amber-500 cursor-pointer"
            />
            <span className="font-mono text-amber-400 w-8">{fontSize}px</span>
          </div>

          {/* Letter Spacing */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">Spacing:</span>
            <input
              type="range"
              min={-4}
              max={16}
              value={letterSpacing}
              onChange={(e) => setLetterSpacing(parseInt(e.target.value))}
              className="w-20 accent-amber-500 cursor-pointer"
            />
            <span className="font-mono text-amber-400 w-7">{letterSpacing}px</span>
          </div>

          {/* Alignment */}
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setTextAlign('left')}
              className={`p-1.5 rounded ${textAlign === 'left' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
              title="Align Left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTextAlign('center')}
              className={`p-1.5 rounded ${textAlign === 'center' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
              title="Align Center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTextAlign('right')}
              className={`p-1.5 rounded ${textAlign === 'right' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
              title="Align Right"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Surface Theme */}
          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setTheme('dark')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition ${theme === 'dark' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
            >
              Dark
            </button>
            <button
              onClick={() => setTheme('paper')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition ${theme === 'paper' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
            >
              Paper
            </button>
            <button
              onClick={() => setTheme('sepia')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition ${theme === 'sepia' ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
            >
              Journal
            </button>
          </div>
        </div>
      </div>

      {/* Live Typing Sandbox Canvas */}
      <div
        className={`rounded-2xl border p-8 sm:p-12 min-h-[460px] shadow-2xl transition-colors duration-200 relative ${themeClasses[theme]}`}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            fontFamily: fontFamilyCssName,
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight,
            letterSpacing: `${letterSpacing}px`,
            textAlign: textAlign,
          }}
          className="w-full h-full min-h-[360px] bg-transparent resize-none border-none outline-none leading-relaxed block tracking-normal"
          placeholder="Start typing in your newly crafted font..."
        />

        <div className="absolute bottom-4 right-4 text-[11px] font-mono opacity-50 select-none">
          Rendered via @font-face ({settings.familyName} {settings.styleName})
        </div>
      </div>
    </div>
  );
};
