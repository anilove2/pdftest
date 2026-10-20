'use client';

import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

interface PDFEditorProps {
  file: File;
  onBack: () => void;
}

interface PageData {
  canvas: fabric.Canvas | null;
  renderTask: any;
}

export default function PDFEditor({ file, onBack }: PDFEditorProps) {
  const [pdf, setPdf] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pages, setPages] = useState<PageData[]>([]);
  const [scale, setScale] = useState(1.5);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<'select' | 'text' | 'draw' | 'highlight'>('select');
  const [isDrawing, setIsDrawing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPDF();
  }, [file]);

  useEffect(() => {
    if (pdf && currentPage > 0) {
      renderPage(currentPage - 1);
    }
  }, [currentPage, scale, pdf]);

  const loadPDF = async () => {
    try {
      setIsLoading(true);
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdf(pdfDoc);
      setTotalPages(pdfDoc.numPages);
      setPages(Array(pdfDoc.numPages).fill({ canvas: null, renderTask: null }));
      setCurrentPage(1);
    } catch (error) {
      console.error('Error loading PDF:', error);
      alert('Failed to load PDF');
    } finally {
      setIsLoading(false);
    }
  };

  const renderPage = async (pageNum: number) => {
    if (!pdf) return;

    try {
      const page = await pdf.getPage(pageNum + 1);
      const viewport = page.getViewport({ scale });

      const canvasEl = document.getElementById(`canvas-${pageNum}`) as HTMLCanvasElement;
      if (!canvasEl) return;

      const context = canvasEl.getContext('2d');
      if (!context) return;

      canvasEl.height = viewport.height;
      canvasEl.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      const renderTask = page.render(renderContext);
      await renderTask.promise;

      // Create Fabric canvas overlay
      const fabricCanvas = new fabric.Canvas(`fabric-${pageNum}`, {
        selection: mode === 'select',
        isDrawingMode: mode === 'draw',
      });

      if (mode === 'draw' && fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush.color = 'black';
        fabricCanvas.freeDrawingBrush.width = 2;
      }

      fabricCanvas.setWidth(viewport.width);
      fabricCanvas.setHeight(viewport.height);
      fabricCanvas.renderAll();

      setPages((prev) => {
        const newPages = [...prev];
        if (newPages[pageNum]) {
          // Dispose old canvas if exists
          if (newPages[pageNum].canvas) {
            newPages[pageNum].canvas.dispose();
          }
        }
        newPages[pageNum] = {
          canvas: fabricCanvas,
          renderTask,
        };
        return newPages;
      });
    } catch (error) {
      console.error('Error rendering page:', error);
    }
  };

  const addText = () => {
    const pageData = pages[currentPage - 1];
    if (!pageData?.canvas) return;

    const text = new fabric.Textbox('Click to edit', {
      left: 100,
      top: 100,
      width: 200,
      fontSize: 16,
      fill: 'black',
    } as any);
    pageData.canvas.add(text);
    pageData.canvas.setActiveObject(text as any);
    pageData.canvas.renderAll();
  };

  const deleteSelected = () => {
    const pageData = pages[currentPage - 1];
    if (!pageData?.canvas) return;

    const activeObjects = pageData.canvas.getActiveObjects();
    if (activeObjects.length > 0) {
      activeObjects.forEach((obj) => pageData.canvas?.remove(obj));
      pageData.canvas.discardActiveObject();
      pageData.canvas.renderAll();
    }
  };

  const clearPage = () => {
    const pageData = pages[currentPage - 1];
    if (!pageData?.canvas) return;

    pageData.canvas.clear();
    pageData.canvas.renderAll();
  };

  const downloadPDF = async () => {
    if (!pdf) return;

    try {
      setIsLoading(true);
      const pdfBytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pdfPages = pdfDoc.getPages();

      for (let i = 0; i < pages.length; i++) {
        const pageData = pages[i];
        if (!pageData?.canvas) continue;

        const canvas = pageData.canvas;
        const dataURL = canvas.toDataURL({
          format: 'png',
          multiplier: 2,
        });

        const pngImage = await pdfDoc.embedPng(dataURL);
        const page = pdfPages[i];
        const { width, height } = page.getSize();

        page.drawImage(pngImage, {
          x: 0,
          y: 0,
          width: width,
          height: height,
        });
      }

      const modifiedPdfBytes = await pdfDoc.save();
      const blob = new Blob([modifiedPdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${file.name}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to export PDF');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = (newMode: typeof mode) => {
    setMode(newMode);
    pages.forEach((pageData) => {
      if (pageData.canvas) {
        pageData.canvas.isDrawingMode = newMode === 'draw';
        pageData.canvas.selection = newMode === 'select';
        pageData.canvas.defaultCursor = newMode === 'select' ? 'default' : 'crosshair';
      }
    });
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading PDF...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-900">
      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-2 flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm flex items-center gap-1"
          >
            ← Back
          </button>
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            onClick={() => handleModeChange('select')}
            className={`px-3 py-1.5 rounded text-sm ${
              mode === 'select'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            Select
          </button>
          <button
            onClick={() => handleModeChange('text')}
            className={`px-3 py-1.5 rounded text-sm ${
              mode === 'text'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            Text
          </button>
          <button
            onClick={() => handleModeChange('draw')}
            className={`px-3 py-1.5 rounded text-sm ${
              mode === 'draw'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            Draw
          </button>
          {mode === 'text' && (
            <button
              onClick={addText}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
            >
              + Add Text
            </button>
          )}
          <button
            onClick={deleteSelected}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
          >
            Delete
          </button>
          <button
            onClick={clearPage}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm"
          >
            Clear Page
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="text-sm px-2">
            Page {currentPage} / {totalPages}
          </span>
          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm disabled:opacity-50"
          >
            Next →
          </button>
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="px-2 py-1.5 bg-gray-200 dark:bg-gray-700 rounded text-sm"
          >
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>
          <button
            onClick={downloadPDF}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1"
          >
            Download PDF
          </button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex justify-center"
      >
        {pdf && (
          <div className="relative">
            <div style={{ position: 'relative' }}>
              <canvas id={`canvas-${currentPage - 1}`} className="shadow-lg" />
              <canvas
                id={`fabric-${currentPage - 1}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  zIndex: 10,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
