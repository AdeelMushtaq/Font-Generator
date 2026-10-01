/**
 * Client-side PDF page rasterizer to High-DPI Canvas using pdfjs-dist
 */

import * as pdfjsLib from 'pdfjs-dist';

// Use standard cloudflare worker for browser PDF rasterization
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

export interface RenderedPdfPage {
  dataUrl: string;
  imageData: ImageData;
  width: number;
  height: number;
}

/**
 * Renders the first page of a PDF ArrayBuffer to high-DPI canvas (300 DPI equivalent)
 */
export async function renderPdfFirstPage(pdfBuffer: ArrayBuffer, dpiScale = 2.5): Promise<RenderedPdfPage> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(1);

  const viewport = page.getViewport({ scale: dpiScale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // Fill crisp white background before drawing PDF vectors
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = {
    canvasContext: ctx as any,
    viewport,
    canvas,
  };

  await page.render(renderContext).promise;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/png');

  return {
    dataUrl,
    imageData,
    width: canvas.width,
    height: canvas.height,
  };
}
