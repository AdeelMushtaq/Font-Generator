/**
 * Core type definitions for Font Creator
 */

export interface Point {
  x: number;
  y: number;
}

export type Quad = [Point, Point, Point, Point]; // TL, TR, BR, BL

export interface ContourLoop {
  points: Point[];
  isHole: boolean;
  signedArea: number;
  depth: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

export interface BezierSegment {
  p0: Point; // Start
  p1: Point; // Control
  p2: Point; // End
}

export interface ProcessedGlyph {
  id: string;
  char: string;
  unicode: number;
  name: string;
  cellIndex: number;
  row: number;
  col: number;
  
  // Traced vector data
  rawLoops: ContourLoop[];
  simplifiedLoops: ContourLoop[];
  bezierLoops?: BezierSegment[][];
  
  // Metrics in cell coordinates
  cellBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  
  // Metrics in Font Units (unitsPerEm = 1000)
  fontBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  advanceWidth: number;
  lsb: number;
  rsb: number;
  
  // Original cell pixel snapshot for QA & diff inspection
  cellDataUrl?: string;
  cellWidth: number;
  cellHeight: number;
  
  // Accuracy measurement
  maxErrorPx: number;
  isEmpty: boolean;
  
  // User overrides
  customThreshold?: number;
  isCustomDrawn?: boolean;
}

export interface CharacterSetOption {
  id: string;
  name: string;
  description: string;
  characters: string[];
}

export interface TemplateGridConfig {
  characters: string[];
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  padding: number;
  baselineRatio: number; // default 0.78
  xHeightRatio: number;  // default 0.42
}

export interface FontSettings {
  familyName: string;
  styleName: string; // 'Regular' | 'Bold' | 'Italic'
  unitsPerEm: number; // 1000
  ascender: number;   // 800
  descender: number;  // -200
  baselinePercent: number; // 78
  xHeightPercent: number;  // 42
  insetPercent: number;    // 10
  threshold: number;       // 0-255 (auto Otsu default)
  invert: boolean;         // false (dark ink on white paper)
  noiseThresholdPx: number;// 3
  simplifyTolerance: number;// default 1.5px
  curveMode: 'sharp' | 'smooth';
  leftSideBearing: number; // 60
  rightSideBearing: number;// 60
  kerningPairs: Record<string, number>;
}

export interface WorkerProgressMessage {
  type: 'progress';
  stage: string;
  percent: number;
}

export interface WorkerCompleteMessage {
  type: 'complete';
  rectifiedDataUrl: string;
  glyphs: ProcessedGlyph[];
  autoThreshold: number;
}

export interface WorkerErrorMessage {
  type: 'error';
  error: string;
}

export type WorkerResponse = WorkerProgressMessage | WorkerCompleteMessage | WorkerErrorMessage;
