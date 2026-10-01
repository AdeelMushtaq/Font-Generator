# Font Creator

A web application that converts a handwritten template image into a pixel-accurate, installable TrueType (`.ttf`) font with **no AI guessing**: every glyph shape comes directly from tracing the user's drawn pixels.

---

## The Pixel-to-Pixel Accuracy Guarantee

Unlike AI-based font generators that synthesize glyphs from text prompts or diffusion models, Font Creator is a purely deterministic vectorization engine:
1. Every contour point originates from an exact discrete boundary between drawn ink and paper pixels.
2. Contours are simplified using recursive Douglas-Peucker with a user-governed tolerance $\epsilon$.
3. Automatic smoothing never displaces a point further from your original ink than your chosen tolerance ($\pm\epsilon$ px).

---

## Full Mathematical Pipeline

```
+---------------------------------------------------------------------------------------+
|                                    1. TEMPLATE                                        |
|   Configurable Character Set -> Auto Grid -> Baselines (78%), X-Heights (42%),        |
|   Red Labels (#c0392b), 4 Corner Registration Fiducials (TL, TR, BR, BL)             |
|   Export: Print-Ready 300 DPI PNG / Vector PDF / 1-Click Synthetic Sample             |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                        2. HECKBERT PROJECTIVE RECTIFICATION                           |
|   4-Point Corner Picker (mouse/touch handles + loupe zoom)                            |
|   Forward Map: (u, v) in [0,1]^2 -> (X, Y) in Source Image via Rational Linear Map:   |
|   X = (a*u + b*v + c)/(g*u + h*v + 1),  Y = (d*u + e*v + f)/(g*u + h*v + 1)           |
|   Bilinear 4-Neighbor Interpolation -> High-Res 2000x2000 Canvas                      |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                      3. INSET CROPPING & OTSU THRESHOLDING                            |
|   Inset crop by user margin (default 10%) to isolate handwriting from gray cell box   |
|   ITU-R BT.601 Luminance: L = 0.299*R + 0.587*G + 0.114*B                             |
|   Otsu's Criterion: maximizes between-class variance sigma_B^2(t)                     |
|   Live Threshold Slider (0-255) + Invert Toggle + Dust Filter                         |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                      4. EXACT PIXEL-EDGE CONTOUR TRACING                              |
|   Discrete Edge Extraction: Every pixel edge touching a non-ink neighbor is directed  |
|   Topological Saddle Resolution: Sharpest turn at diagonal junctions                   |
|   Ray-Casting Point-in-Polygon Containment Depth:                                      |
|   - Depth 0, 2: Outer Contours (Clockwise)                                            |
|   - Depth 1, 3: Interior Counter Holes (Counter-Clockwise, e.g. 'o', 'a', 'e', 'B')   |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                   5. CONTROLLED SIMPLIFICATION & CURVE FITTING                        |
|   Douglas-Peucker on closed loops with tolerance epsilon                               |
|   Modes:                                                                              |
|   (a) "Sharp": Straight polygon segments (true pixel fidelity)                        |
|   (b) "Smooth": Quadratic Béziers through polygon midpoints (organic hand flow)       |
|   Guaranteed error bound: max distance <= epsilon px                                  |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
+---------------------------------------------------------------------------------------+
|                      6. TRUETYPE (.TTF) ASSEMBLY & VALIDATION                         |
|   UnitsPerEm = 1000, Ascender = 800, Descender = -200, Baseline at Y=0                |
|   Uniform scaling derived from cell height (no stretching or distortion)              |
|   Dynamic advance width = Ink Bounding Box + Left/Right Side Bearings                 |
|   Auto-generate .notdef and space glyphs                                              |
|   Assemble binary TTF with opentype.js and round-trip parse to guarantee zero errors  |
+---------------------------------------------------------------------------------------+
```

---

## Features

- **Printable Template Generator**: Exports 300 DPI PNG and vector PDF with alignment guides. Includes 1-click procedural handwriting generator for testing without printing.
- **Web Worker Offloading**: All heavy per-pixel operations (homography rectification, thresholding, tracing, simplification) execute off the main thread.
- **Side-by-Side QA Grid**: Review every letterform rendered from vector paths next to source pixel thumbnails.
- **High-Zoom Diff Inspector**: Overlay vector outlines directly on top of the original raster crop up to 600% magnification.
- **Per-Glyph Touch-Up & Redraw**: Canvas pad to touch up broken strokes or redraw a single letter without re-processing other characters.
- **Kerning Pair Table**: Live visual kerning editor for optical pair collisions (`AV`, `To`, `Wa`, `Yo`).
- **Interactive Type Tester**: Real-time typing sandbox with custom sizes, letter spacing, alignment, and pangram presets.
- **Project Save & Reload**: Export and reload your complete configuration (quad, thresholds, bearings, kerning) in JSON.

---

## Running Tests

Unit tests cover synthetic edge-based boundary tracing, hole classification (e.g. ring, disjoint blobs, 'B'-shape with 2 holes), Douglas-Peucker tolerance bounds, Heckbert homography mapping, and font space coordinate mapping:

```bash
npm run test
```
