import React, { useState } from 'react';
import {
  Grid,
  Search,
  Eye,
  PenTool,
  CheckCircle2,
  ArrowRight,
  Filter,
  AlertTriangle,
  ZoomIn,
  Sparkles,
  Scissors,
  Wand2,
} from 'lucide-react';
import { useFontStore } from '../store/useFontStore';
import { ProcessedGlyph } from '../types';
import { cleanStrayArtifacts, cleanAllGlyphs } from '../engine/cleanGlyphs';
import { assembleFont } from '../engine/fontBuilder';

export const GlyphGridStep: React.FC = () => {
  const {
    glyphs,
    setGlyphs,
    updateSingleGlyph,
    setDiffInspectorGlyph,
    setEditDrawGlyph,
    setCurrentStep,
    fontFamilyCssName,
    settings,
    setGeneratedTtf,
  } = useFontStore();

  const [activeFilter, setActiveFilter] = useState<'all' | 'upper' | 'lower' | 'digits' | 'punct'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cleanedCount, setCleanedCount] = useState<number | null>(null);

  if (glyphs.length === 0) {
    return (
      <div className="max-w-xl mx-auto my-16 text-center p-8 bg-zinc-900 border border-zinc-800 rounded-2xl">
        <p className="text-zinc-400 mb-4">No glyphs have been vectorized yet.</p>
        <button
          onClick={() => setCurrentStep('vectorize')}
          className="px-5 py-2.5 bg-amber-500 text-zinc-950 font-bold rounded-xl text-sm"
        >
          Go to Step 4 (Vectorize)
        </button>
      </div>
    );
  }

  // Handle Clean All Glyphs
  const handleCleanAll = () => {
    const cleaned = cleanAllGlyphs(glyphs);
    setGlyphs(cleaned);
    try {
      const font = assembleFont(cleaned, settings, 200);
      setGeneratedTtf(font.toArrayBuffer());
    } catch {
      // safe fallback
    }
    setCleanedCount(glyphs.length);
    setTimeout(() => setCleanedCount(null), 3000);
  };

  // Handle Single Glyph Clean
  const handleCleanSingle = (glyph: ProcessedGlyph) => {
    const cleaned = cleanStrayArtifacts(glyph);
    updateSingleGlyph(cleaned);
    const updatedAll = glyphs.map((g) => (g.id === glyph.id ? cleaned : g));
    try {
      const font = assembleFont(updatedAll, settings, 200);
      setGeneratedTtf(font.toArrayBuffer());
    } catch {
      // safe fallback
    }
  };

  // Filter glyphs
  const filteredGlyphs = glyphs.filter((g) => {
    if (searchQuery && !g.char.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (activeFilter === 'upper') return g.char >= 'A' && g.char <= 'Z';
    if (activeFilter === 'lower') return g.char >= 'a' && g.char <= 'z';
    if (activeFilter === 'digits') return g.char >= '0' && g.char <= '9';
    if (activeFilter === 'punct') return !(/[a-zA-Z0-9]/).test(g.char);
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Step Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-400">
            Step 5 of 7
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
            Glyph QA & Side-by-Side Verification
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Visually confirm accuracy letter-by-letter. Click any character to inspect the high-zoom diff overlay or touch up individual strokes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCleanAll}
            className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold rounded-xl text-sm transition"
            title="Automatically eliminates neighbor strokes leaking into glyphs"
          >
            <Wand2 className="w-4 h-4" />
            <span>{cleanedCount ? '✓ Cleaned!' : 'Clean Stray Neighbor Leaks'}</span>
          </button>

          <button
            onClick={() => setCurrentStep('test_type')}
            className="flex items-center gap-2 px-5 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-xl text-sm transition shadow-lg"
          >
            <span>Next: Live Type Tester</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto text-xs">
          {[
            { id: 'all', label: `All (${glyphs.length})` },
            { id: 'upper', label: 'A-Z' },
            { id: 'lower', label: 'a-z' },
            { id: 'digits', label: '0-9' },
            { id: 'punct', label: 'Symbols' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveFilter(cat.id as any)}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                activeFilter === cat.id
                  ? 'bg-amber-500 text-zinc-950 font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-48">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Find character..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Glyphs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {filteredGlyphs.map((glyph) => {
          const outerCount = glyph.simplifiedLoops.filter((l) => !l.isHole).length;
          const holeCount = glyph.simplifiedLoops.filter((l) => l.isHole).length;
          const hasStray = outerCount > 1;

          return (
            <div
              key={glyph.id}
              className={`bg-zinc-900 border ${
                hasStray ? 'border-amber-500/40 hover:border-amber-500' : 'border-zinc-800 hover:border-zinc-700'
              } rounded-xl p-3 flex flex-col transition group relative`}
            >
              {/* Top Row: Character Label & Error */}
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold text-amber-400 px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                  {glyph.char}
                </span>
                <span className="font-mono text-[10px] text-zinc-400">
                  ±{glyph.maxErrorPx.toFixed(1)}px
                </span>
              </div>

              {/* Character Render Box */}
              <div className="aspect-square bg-zinc-950 rounded-lg border border-zinc-800/80 flex items-center justify-center relative overflow-hidden mb-3 group-hover:border-zinc-700">
                {/* Vector SVG Path rendering */}
                <svg
                  viewBox={`0 0 ${glyph.cellWidth || 100} ${glyph.cellHeight || 100}`}
                  className="w-3/4 h-3/4 object-contain"
                  style={{ fillRule: 'evenodd' }}
                >
                  <path
                    d={generateSvgPath(glyph, settings.curveMode)}
                    fill="#f4f4f5"
                  />
                </svg>

                {glyph.isCustomDrawn && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" title="Custom edited" />
                )}
              </div>

              {/* Metrics Details */}
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-2.5">
                <span>{outerCount} outer, {holeCount} holes</span>
                <span>{glyph.advanceWidth}w</span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-zinc-800/80">
                {hasStray ? (
                  <button
                    onClick={() => handleCleanSingle(glyph)}
                    className="flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-[11px] text-amber-300 font-semibold transition col-span-1"
                    title="Remove stray neighbor stroke"
                  >
                    <Scissors className="w-3 h-3" />
                    <span>Clean</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setDiffInspectorGlyph(glyph)}
                    className="flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white transition"
                    title="Inspect Diff Overlay"
                  >
                    <Eye className="w-3 h-3 text-amber-400" />
                    <span>Diff</span>
                  </button>
                )}

                <button
                  onClick={() => setEditDrawGlyph(glyph)}
                  className="flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white transition"
                  title="Touch Up or Redraw Letter"
                >
                  <PenTool className="w-3 h-3 text-amber-400" />
                  <span>Edit</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Generates SVG path string for high-fidelity vector rendering
function generateSvgPath(glyph: ProcessedGlyph, curveMode: 'sharp' | 'smooth'): string {
  if (glyph.isEmpty || glyph.simplifiedLoops.length === 0) return '';

  let d = '';

  if (curveMode === 'smooth' && glyph.bezierLoops && glyph.bezierLoops.length > 0) {
    for (const segList of glyph.bezierLoops) {
      if (segList.length === 0) continue;
      const p0 = segList[0].p0;
      d += `M ${p0.x} ${p0.y} `;
      for (const seg of segList) {
        d += `Q ${seg.p1.x} ${seg.p1.y} ${seg.p2.x} ${seg.p2.y} `;
      }
      d += 'Z ';
    }
  } else {
    for (const loop of glyph.simplifiedLoops) {
      const pts = loop.points;
      if (pts.length < 3) continue;
      d += `M ${pts[0].x} ${pts[0].y} `;
      for (let i = 1; i < pts.length; i++) {
        d += `L ${pts[i].x} ${pts[i].y} `;
      }
      d += 'Z ';
    }
  }

  return d;
}
