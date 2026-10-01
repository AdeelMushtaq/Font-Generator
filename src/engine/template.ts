/**
 * Printable Template Generator (PNG 300 DPI & Vector PDF)
 * 
 * Features:
 * - Configurable character sets (A-Z, a-z, 0-9, punctuation)
 * - Auto-sized grid (e.g. 8x8, 9x9, 10x10)
 * - Baseline guide line (~78% down)
 * - X-height guide line (dashed, ~42% down)
 * - Light reddish corner label (#c0392b) naming character
 * - Corner registration marks (TL, TR, BR, BL) for instant 4-point homography alignment
 */

import { jsPDF } from 'jspdf';
import { CharacterSetOption, TemplateGridConfig } from '../types';

export const CHARACTER_SETS: CharacterSetOption[] = [
  {
    id: 'standard',
    name: 'Standard Latin (64 chars)',
    description: 'A-Z, a-z, 0-9, plus . and ,',
    characters: [
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      ...'abcdefghijklmnopqrstuvwxyz'.split(''),
      ...'0123456789'.split(''),
      '.', ',',
    ],
  },
  {
    id: 'full',
    name: 'Extended with Punctuation (81 chars)',
    description: 'A-Z, a-z, 0-9, and common punctuation (. , ! ? \' " : ; - _ + = / @ &)',
    characters: [
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      ...'abcdefghijklmnopqrstuvwxyz'.split(''),
      ...'0123456789'.split(''),
      '.', ',', '!', '?', "'", '"', ':', ';', '-', '_', '+', '=', '/', '@', '&', '(', ')', '#', '$',
    ],
  },
  {
    id: 'uppercase_digits',
    name: 'Uppercase & Digits Only (36 chars)',
    description: 'A-Z, 0-9 for quick handwritten headline fonts',
    characters: [
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      ...'0123456789'.split(''),
    ],
  },
];

export function calculateGridDimensions(charCount: number): { cols: number; rows: number } {
  if (charCount <= 36) return { cols: 6, rows: 6 };
  if (charCount <= 49) return { cols: 7, rows: 7 };
  if (charCount <= 64) return { cols: 8, rows: 8 };
  if (charCount <= 81) return { cols: 9, rows: 9 };
  if (charCount <= 100) return { cols: 10, rows: 10 };
  const cols = Math.ceil(Math.sqrt(charCount));
  const rows = Math.ceil(charCount / cols);
  return { cols, rows };
}

/**
 * Draws the template onto an HTML Canvas (or OffscreenCanvas)
 */
export function renderTemplateToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  config: TemplateGridConfig,
  fontName: string = 'Font Creator Template'
): void {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // Background white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Header Title & Instructions
  const headerHeight = Math.round(height * 0.08);
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${Math.round(height * 0.024)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(fontName, Math.round(width * 0.05), Math.round(headerHeight * 0.45));

  ctx.fillStyle = '#64748b';
  ctx.font = `${Math.round(height * 0.012)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(
    'Write clearly with a black felt-tip pen or marker inside each box. Stay within guide lines. Do not cross the borders.',
    Math.round(width * 0.05),
    Math.round(headerHeight * 0.72)
  );

  // Compute grid area
  const marginX = Math.round(width * 0.05);
  const marginTop = headerHeight;
  const marginBottom = Math.round(height * 0.04);
  const availableWidth = width - 2 * marginX;
  const availableHeight = height - marginTop - marginBottom;

  const cellWidth = Math.floor(availableWidth / config.cols);
  const cellHeight = Math.floor(availableHeight / config.rows);
  const gridWidth = cellWidth * config.cols;
  const gridHeight = cellHeight * config.rows;

  // Draw 4 corner registration fiducial marks outside grid corners
  const regRadius = Math.round(Math.min(width, height) * 0.015);
  const corners = [
    { x: marginX, y: marginTop },
    { x: marginX + gridWidth, y: marginTop },
    { x: marginX + gridWidth, y: marginTop + gridHeight },
    { x: marginX, y: marginTop + gridHeight },
  ];

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(2, Math.round(width * 0.0015));

  for (const c of corners) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, regRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(c.x - regRadius * 1.5, c.y);
    ctx.lineTo(c.x + regRadius * 1.5, c.y);
    ctx.moveTo(c.x, c.y - regRadius * 1.5);
    ctx.lineTo(c.x, c.y + regRadius * 1.5);
    ctx.stroke();
  }

  // Draw cells
  for (let r = 0; r < config.rows; r++) {
    for (let c = 0; c < config.cols; c++) {
      const idx = r * config.cols + c;
      const char = config.characters[idx] || '';

      const x = marginX + c * cellWidth;
      const y = marginTop + r * cellHeight;

      // 1. Thin cell border
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cellWidth, cellHeight);

      if (!char) continue;

      // 2. Baseline guide line (~78% down)
      const baselineY = y + Math.round(cellHeight * config.baselineRatio);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, baselineY);
      ctx.lineTo(x + cellWidth - 2, baselineY);
      ctx.stroke();

      // 3. X-height guide line (dashed, ~42% down)
      const xHeightY = y + Math.round(cellHeight * config.xHeightRatio);
      ctx.strokeStyle = '#e2e8f0';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x + 2, xHeightY);
      ctx.lineTo(x + cellWidth - 2, xHeightY);
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash

      // 4. Small corner label (light red #c0392b)
      ctx.fillStyle = '#c0392b';
      const labelFontSize = Math.max(10, Math.round(cellHeight * 0.16));
      ctx.font = `600 ${labelFontSize}px monospace`;
      ctx.fillText(char, x + Math.round(cellWidth * 0.08), y + Math.round(cellHeight * 0.18));
    }
  }
}

/**
 * Generates high-res 300 DPI PNG data URL
 */
export function generateTemplatePng(
  characters: string[],
  fontName: string = 'My Hand Font'
): string {
  const { cols, rows } = calculateGridDimensions(characters.length);
  // High-res canvas: 2480 x 3508 (standard A4 at 300 DPI) or 2400 x 2400
  const canvas = document.createElement('canvas');
  canvas.width = 2480;
  canvas.height = 3200;

  const config: TemplateGridConfig = {
    characters,
    cols,
    rows,
    cellWidth: 0,
    cellHeight: 0,
    padding: 20,
    baselineRatio: 0.78,
    xHeightRatio: 0.42,
  };

  renderTemplateToCanvas(canvas, config, fontName);
  return canvas.toDataURL('image/png');
}

/**
 * Generates vector PDF using jsPDF
 */
export function generateTemplatePdf(
  characters: string[],
  fontName: string = 'My Hand Font'
): Blob {
  const { cols, rows } = calculateGridDimensions(characters.length);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const headerHeight = 20;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(fontName + ' Template', margin, margin + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Fill in each cell with black ink. Align to dashed x-height and solid baseline. Avoid touching borders.',
    margin,
    margin + 12
  );

  const gridLeft = margin;
  const gridTop = margin + headerHeight;
  const gridW = pageWidth - 2 * margin;
  const gridH = pageHeight - gridTop - margin;

  const cellW = gridW / cols;
  const cellH = gridH / rows;

  // Corner marks
  const r = 2;
  const corners = [
    [gridLeft, gridTop],
    [gridLeft + gridW, gridTop],
    [gridLeft + gridW, gridTop + gridH],
    [gridLeft, gridTop + gridH],
  ];

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  for (const [cx, cy] of corners) {
    doc.circle(cx, cy, r);
    doc.line(cx - r * 1.5, cy, cx + r * 1.5, cy);
    doc.line(cx, cy - r * 1.5, cx, cy + r * 1.5);
  }

  // Draw cells
  for (let rIdx = 0; rIdx < rows; rIdx++) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const idx = rIdx * cols + cIdx;
      const char = characters[idx];

      const x = gridLeft + cIdx * cellW;
      const y = gridTop + rIdx * cellH;

      // Cell border
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(x, y, cellW, cellH);

      if (!char) continue;

      // Baseline
      const baseY = y + cellH * 0.78;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.line(x + 1, baseY, x + cellW - 1, baseY);

      // X-height dashed
      const xhY = y + cellH * 0.42;
      doc.setDrawColor(226, 232, 240);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(x + 1, xhY, x + cellW - 1, xhY);
      doc.setLineDashPattern([], 0); // Reset

      // Corner label
      doc.setFont('courier', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(192, 57, 43); // #c0392b
      doc.text(char, x + cellW * 0.08, y + cellH * 0.18);
    }
  }

  return doc.output('blob');
}
