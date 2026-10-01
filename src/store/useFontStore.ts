/**
 * Global Zustand state store for Font Creator
 */

import { create } from 'zustand';
import { Quad, FontSettings, ProcessedGlyph, CharacterSetOption } from '../types';
import { CHARACTER_SETS } from '../engine/template';

export type PipelineStep =
  | 'template'
  | 'upload_rectify'
  | 'threshold'
  | 'vectorize'
  | 'glyphs'
  | 'test_type'
  | 'export';

export interface MultiWeightEntry {
  styleName: string;
  ttfBuffer: ArrayBuffer | null;
  glyphCount: number;
}

interface FontState {
  // App Mode: 'quick' (simplest 1-click upload to TTF) vs 'pro' (multi-step calibration)
  appMode: 'quick' | 'pro';
  setAppMode: (mode: 'quick' | 'pro') => void;

  // Current Step (used in pro mode)
  currentStep: PipelineStep;
  setCurrentStep: (step: PipelineStep) => void;

  // Character Set & Grid
  characterSetId: string;
  customCharacters: string[];
  customBoxes: Array<{
    char: string;
    x: number;
    y: number;
    width: number;
    height: number;
    row: number;
    col: number;
  }> | null;
  setCharacterSetId: (id: string) => void;
  setCustomCharacters: (chars: string[]) => void;
  setCustomBoxes: (boxes: Array<{
    char: string;
    x: number;
    y: number;
    width: number;
    height: number;
    row: number;
    col: number;
  }> | null) => void;
  getActiveCharacters: () => string[];

  // Source Image & Rectification
  sourceImageSrc: string | null;
  sourceImageWidth: number;
  sourceImageHeight: number;
  sourceImageData: ImageData | null;
  quad: Quad;
  rectifiedDataUrl: string | null;
  rectifiedPixels: Uint8ClampedArray | null;
  rectifiedWidth: number;
  rectifiedHeight: number;

  setSourceImage: (src: string, width: number, height: number, data?: ImageData) => void;
  setQuad: (quad: Quad) => void;
  resetQuadToImageBounds: () => void;
  setRectifiedData: (pixels: Uint8ClampedArray, width: number, height: number, dataUrl?: string) => void;

  // Font Settings
  settings: FontSettings;
  updateSettings: (partial: Partial<FontSettings>) => void;
  autoThreshold: number;
  setAutoThreshold: (th: number) => void;

  // Processed Glyphs
  glyphs: ProcessedGlyph[];
  setGlyphs: (glyphs: ProcessedGlyph[]) => void;
  updateSingleGlyph: (glyph: ProcessedGlyph) => void;

  // Multi-weight Fonts
  weights: MultiWeightEntry[];
  addWeight: (weight: MultiWeightEntry) => void;

  // TTF Output & WebFont
  generatedTtfBuffer: ArrayBuffer | null;
  generatedFontUrl: string | null;
  fontFamilyCssName: string;
  setGeneratedTtf: (buffer: ArrayBuffer | null) => void;

  // Worker State
  isProcessing: boolean;
  progressStage: string;
  progressPercent: number;
  workerError: string | null;
  setProcessing: (isProcessing: boolean, stage?: string, percent?: number) => void;
  setWorkerError: (err: string | null) => void;

  // Modals & Tools
  diffInspectorGlyph: ProcessedGlyph | null;
  setDiffInspectorGlyph: (g: ProcessedGlyph | null) => void;

  editDrawGlyph: ProcessedGlyph | null;
  setEditDrawGlyph: (g: ProcessedGlyph | null) => void;

  isKerningModalOpen: boolean;
  setKerningModalOpen: (open: boolean) => void;

  isDocsModalOpen: boolean;
  setDocsModalOpen: (open: boolean) => void;

  // Project Save / Load
  exportProjectJson: () => string;
  importProjectJson: (jsonStr: string) => boolean;
  resetAll: () => void;
}

const DEFAULT_SETTINGS: FontSettings = {
  familyName: 'MyHandwriting',
  styleName: 'Regular',
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  baselinePercent: 78,
  xHeightPercent: 42,
  insetPercent: 10,
  threshold: 128,
  invert: false,
  noiseThresholdPx: 3,
  simplifyTolerance: 1.4,
  curveMode: 'smooth',
  leftSideBearing: 60,
  rightSideBearing: 60,
  kerningPairs: {
    'AV': -60,
    'VA': -60,
    'To': -45,
    'Ta': -40,
    'Te': -40,
    'We': -35,
    'Wa': -40,
    'Yo': -50,
  },
};

export const useFontStore = create<FontState>((set, get) => ({
  appMode: 'quick',
  setAppMode: (mode) => set({ appMode: mode }),

  currentStep: 'template',
  setCurrentStep: (step) => set({ currentStep: step }),

  characterSetId: 'standard',
  customCharacters: [],
  customBoxes: null,
  setCharacterSetId: (id) => set({ characterSetId: id }),
  setCustomCharacters: (chars) => set({ customCharacters: chars }),
  setCustomBoxes: (boxes) => set({ customBoxes: boxes }),

  getActiveCharacters: () => {
    const { characterSetId, customCharacters } = get();
    if (characterSetId === 'custom' && customCharacters.length > 0) {
      return customCharacters;
    }
    const found = CHARACTER_SETS.find((c) => c.id === characterSetId);
    return found ? found.characters : CHARACTER_SETS[0].characters;
  },

  sourceImageSrc: null,
  sourceImageWidth: 0,
  sourceImageHeight: 0,
  sourceImageData: null,
  quad: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ],
  rectifiedDataUrl: null,
  rectifiedPixels: null,
  rectifiedWidth: 2000,
  rectifiedHeight: 2000,

  setSourceImage: (src, width, height, data) => {
    // Default quad to corners of image
    const padX = Math.round(width * 0.05);
    const padY = Math.round(height * 0.05);
    const quad: Quad = [
      { x: padX, y: padY },
      { x: width - padX, y: padY },
      { x: width - padX, y: height - padY },
      { x: padX, y: height - padY },
    ];
    set({
      sourceImageSrc: src,
      sourceImageWidth: width,
      sourceImageHeight: height,
      sourceImageData: data || null,
      quad,
    });
  },

  setQuad: (quad) => set({ quad }),

  resetQuadToImageBounds: () => {
    const { sourceImageWidth: w, sourceImageHeight: h } = get();
    if (w > 0 && h > 0) {
      set({
        quad: [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ],
      });
    }
  },

  setRectifiedData: (pixels, width, height, dataUrl) => {
    set({
      rectifiedPixels: pixels,
      rectifiedWidth: width,
      rectifiedHeight: height,
      rectifiedDataUrl: dataUrl || null,
    });
  },

  settings: DEFAULT_SETTINGS,
  updateSettings: (partial) => {
    set((state) => ({
      settings: { ...state.settings, ...partial },
    }));
  },

  autoThreshold: 128,
  setAutoThreshold: (th) => set({ autoThreshold: th }),

  glyphs: [],
  setGlyphs: (glyphs) => set({ glyphs }),
  updateSingleGlyph: (glyph) => {
    set((state) => ({
      glyphs: state.glyphs.map((g) => (g.id === glyph.id ? glyph : g)),
    }));
  },

  weights: [],
  addWeight: (weight) => {
    set((state) => ({
      weights: [...state.weights.filter((w) => w.styleName !== weight.styleName), weight],
    }));
  },

  generatedTtfBuffer: null,
  generatedFontUrl: null,
  fontFamilyCssName: 'UserGeneratedFont',
  setGeneratedTtf: (buffer) => {
    if (!buffer) {
      set({ generatedTtfBuffer: null, generatedFontUrl: null });
      return;
    }
    const blob = new Blob([buffer], { type: 'font/ttf' });
    const url = URL.createObjectURL(blob);
    const cssName = `UserFont_${Date.now()}`;

    // Register font face for live preview in browser
    try {
      const fontFace = new FontFace(cssName, `url(${url})`);
      fontFace.load().then((loadedFace) => {
        document.fonts.add(loadedFace);
      });
    } catch {
      // Non-browser fallback
    }

    set({
      generatedTtfBuffer: buffer,
      generatedFontUrl: url,
      fontFamilyCssName: cssName,
    });
  },

  isProcessing: false,
  progressStage: '',
  progressPercent: 0,
  workerError: null,
  setProcessing: (isProcessing, stage = '', percent = 0) =>
    set({ isProcessing, progressStage: stage, progressPercent: percent }),
  setWorkerError: (err) => set({ workerError: err }),

  diffInspectorGlyph: null,
  setDiffInspectorGlyph: (g) => set({ diffInspectorGlyph: g }),

  editDrawGlyph: null,
  setEditDrawGlyph: (g) => set({ editDrawGlyph: g }),

  isKerningModalOpen: false,
  setKerningModalOpen: (open) => set({ isKerningModalOpen: open }),

  isDocsModalOpen: false,
  setDocsModalOpen: (open) => set({ isDocsModalOpen: open }),

  exportProjectJson: () => {
    const state = get();
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      characterSetId: state.characterSetId,
      customCharacters: state.customCharacters,
      settings: state.settings,
      quad: state.quad,
      autoThreshold: state.autoThreshold,
      // Source image thumbnail/data if available
      sourceImageWidth: state.sourceImageWidth,
      sourceImageHeight: state.sourceImageHeight,
    };
    return JSON.stringify(payload, null, 2);
  },

  importProjectJson: (jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr);
      if (data.version && data.settings) {
        set({
          characterSetId: data.characterSetId || 'standard',
          customCharacters: data.customCharacters || [],
          settings: { ...DEFAULT_SETTINGS, ...data.settings },
          quad: data.quad || get().quad,
          autoThreshold: data.autoThreshold || 128,
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  resetAll: () => {
    set({
      currentStep: 'template',
      sourceImageSrc: null,
      sourceImageData: null,
      rectifiedDataUrl: null,
      rectifiedPixels: null,
      glyphs: [],
      generatedTtfBuffer: null,
      generatedFontUrl: null,
      settings: DEFAULT_SETTINGS,
      workerError: null,
    });
  },
}));
