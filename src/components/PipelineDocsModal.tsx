/**
 * Pipeline Documentation Modal:
 * Explains the full 6-step exact mathematical pipeline with visual diagrams
 * and documents the pixel-to-pixel accuracy guarantee.
 */

import React from 'react';
import { X, CheckCircle, ShieldCheck, Compass, Sparkles, Sliders, Box, Layers } from 'lucide-react';
import { useFontStore } from '../store/useFontStore';

export const PipelineDocsModal: React.FC = () => {
  const { isDocsModalOpen, setDocsModalOpen } = useFontStore();

  if (!isDocsModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 sm:p-8 text-zinc-200 my-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => setDocsModalOpen(false)}
          className="absolute top-5 right-5 p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Font Creator Engine Architecture
            </h2>
            <p className="text-sm text-zinc-400">
              Zero AI Guessing: Exact pixel-edge contour tracing & mathematical projective rectification
            </p>
          </div>
        </div>

        {/* Accuracy Guarantee Highlight */}
        <div className="mb-8 p-5 rounded-xl bg-gradient-to-r from-amber-500/10 via-zinc-800/60 to-zinc-900 border border-amber-500/30">
          <h3 className="text-base font-semibold text-amber-300 flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-amber-400" />
            The Pixel-to-Pixel Accuracy Guarantee
          </h3>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Every curve point in your exported font is deterministically bound to your scanned ink pixels.
            Unlike AI models that invent glyph shapes from text tokens, this pipeline uses an edge-boundary walk on the discrete pixel lattice followed by Douglas-Peucker simplification bounded by your exact chosen tolerance <code className="text-amber-300 px-1 py-0.5 bg-black/40 rounded">ε</code>.
            Automatic smoothing never displaces a point further from your original ink than you authorize.
          </p>
        </div>

        {/* 6 Stage Pipeline Breakdown */}
        <div className="space-y-6">
          {/* Stage 1 */}
          <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 text-amber-400 font-mono text-sm font-bold">1</span>
              <h4 className="text-lg font-semibold text-white">Printable Grid Template & Calibration Marks</h4>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed pl-10 mb-3">
              Generates a 300 DPI print-ready sheet with an auto-sized grid. Each cell features:
            </p>
            <ul className="text-xs text-zinc-300 space-y-1.5 pl-14 list-disc mb-3">
              <li><strong className="text-zinc-100">Baseline Guide (~78% down):</strong> Sets font space <code className="text-amber-300">Y=0</code> for uniform vertical alignment across letters.</li>
              <li><strong className="text-zinc-100">X-Height Guide (~42% down, dashed):</strong> Calibrates lowercase glyph body proportions (e.g. <span className="font-mono text-zinc-200">x, a, c, e</span>).</li>
              <li><strong className="text-zinc-100">Registration Fiducial Crosshairs:</strong> 4 corner marks (TL, TR, BR, BL) to eliminate guessing during perspective calibration.</li>
              <li><strong className="text-zinc-100">Chromatic Exclusion Label (#c0392b):</strong> Character identifiers printed in faint red ink, cleanly excluded by the ink luminance threshold.</li>
            </ul>
          </div>

          {/* Stage 2 */}
          <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 text-amber-400 font-mono text-sm font-bold">2</span>
              <h4 className="text-lg font-semibold text-white">Heckbert Unit-Square-to-Quad Projective Rectification</h4>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed pl-10 mb-2">
              Instead of naive CSS transforms or image-space affine approximations that cause keystoning distortion, we implement Paul Heckbert&apos;s projective rational mapping:
            </p>
            <div className="ml-10 p-3 bg-zinc-900 border border-zinc-800 rounded-lg font-mono text-xs text-amber-300 overflow-x-auto mb-3">
              X(u, v) = (a·u + b·v + c) / (g·u + h·v + 1), &nbsp; Y(u, v) = (d·u + e·v + f) / (g·u + h·v + 1)
            </div>
            <p className="text-xs text-zinc-400 pl-10">
              Each output pixel is sampled using <strong>bilinear interpolation</strong> from the 4 surrounding source pixels. All operations execute in an asynchronous <strong>Web Worker</strong> to keep the 60fps UI buttery smooth.
            </p>
          </div>

          {/* Stage 3 */}
          <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 text-amber-400 font-mono text-sm font-bold">3</span>
              <h4 className="text-lg font-semibold text-white">Cell Inset Cropping & Otsu Luminance Thresholding</h4>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed pl-10 mb-2">
              Each cell is inset-cropped by a user-tuned margin (default 10%) to isolate the handwritten ink from the outer cell box and red corner label.
              Luminance is calculated via ITU-R BT.601: <code className="text-amber-300">L = 0.299R + 0.587G + 0.114B</code>.
              Otsu&apos;s bimodal variance maximization computes the optimal separation threshold automatically, with manual live override and inverted scan support.
            </p>
          </div>

          {/* Stage 4 */}
          <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 text-amber-400 font-mono text-sm font-bold">4</span>
              <h4 className="text-lg font-semibold text-white">Pixel-Edge Contour Tracing & Hole Containment</h4>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed pl-10 mb-3">
              The heart of geometric fidelity. Rather than approximate marching squares or blur-based vectorizers:
            </p>
            <ul className="text-xs text-zinc-300 space-y-1.5 pl-14 list-disc">
              <li><strong className="text-zinc-100">Discrete Pixel-Edge Graph:</strong> For every ink pixel, each edge touching a non-ink pixel is extracted into a directed graph, keeping ink consistently on one side.</li>
              <li><strong className="text-zinc-100">Topological Saddle Resolution:</strong> At diagonal checkerboard junctions, ambiguous edges are resolved by following the sharpest right turn, preventing self-intersecting loops.</li>
              <li><strong className="text-zinc-100">Containment Depth Classification:</strong> Ray-casting point-in-polygon tests determine loop nesting. Depth 0, 2 = Outer contours; Depth 1, 3 = Interior holes (such as in &apos;o&apos;, &apos;a&apos;, &apos;B&apos;).</li>
              <li><strong className="text-zinc-100">Opposite Winding Direction:</strong> Enforces TrueType non-zero fill winding (outer loops clockwise, hole loops counter-clockwise in font space).</li>
            </ul>
          </div>

          {/* Stage 5 */}
          <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 text-amber-400 font-mono text-sm font-bold">5</span>
              <h4 className="text-lg font-semibold text-white">Controlled Simplification & Quadratic Bézier Fitting</h4>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed pl-10 mb-3">
              The raw pixel polygon is reduced using recursive Douglas-Peucker with a live accuracy metric:
            </p>
            <ul className="text-xs text-zinc-300 space-y-1.5 pl-14 list-disc">
              <li><strong className="text-zinc-100">Sharp Mode:</strong> Pure straight-line polygon segments. Pixel-for-pixel fidelity ideal for geometric lettering and pixel art.</li>
              <li><strong className="text-zinc-100">Smooth Mode:</strong> Continuous quadratic Bézier curves passing through simplified polygon midpoints, yielding natural organic handwriting curves while staying within the tolerance envelope.</li>
              <li><strong className="text-zinc-100">Live Error Reporting:</strong> The UI calculates the max deviation between your drawn ink and the vector curve, reporting exact precision in pixels.</li>
            </ul>
          </div>

          {/* Stage 6 */}
          <div className="border border-zinc-800 bg-zinc-950/60 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 text-amber-400 font-mono text-sm font-bold">6</span>
              <h4 className="text-lg font-semibold text-white">TrueType Font Assembly & Round-Trip Validation</h4>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed pl-10 mb-2">
              Glyphs are scaled uniformly to <code className="text-amber-300">unitsPerEm = 1000</code> (<code className="text-zinc-300">ascender = 800, descender = -200</code>) preserving the exact aspect ratio of your strokes. Advance widths are computed dynamically from ink bounds plus side bearings.
              Before offering download, the generated TTF byte stream is parsed back using <code className="text-amber-300">opentype.parse()</code> to guarantee zero corrupt glyphs, finite bounding boxes, and positive advance widths.
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={() => setDocsModalOpen(false)}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl transition"
          >
            Got it, Let&apos;s Build
          </button>
        </div>
      </div>
    </div>
  );
};
