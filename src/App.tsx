/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useFontStore } from './store/useFontStore';
import { Navbar } from './components/Navbar';
import { QuickConverter } from './components/QuickConverter';
import { TemplateStep } from './components/TemplateStep';
import { CropRectifyStep } from './components/CropRectifyStep';
import { ThresholdStep } from './components/ThresholdStep';
import { VectorSettingsStep } from './components/VectorSettingsStep';
import { GlyphGridStep } from './components/GlyphGridStep';
import { TextPreviewStep } from './components/TextPreviewStep';
import { ExportStep } from './components/ExportStep';

import { DiffInspectorModal } from './components/DiffInspectorModal';
import { GlyphEditorModal } from './components/GlyphEditorModal';
import { KerningModal } from './components/KerningModal';
import { PipelineDocsModal } from './components/PipelineDocsModal';

import { AlertCircle, X } from 'lucide-react';

export default function App() {
  const { appMode, currentStep, workerError, setWorkerError } = useFontStore();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Navigation & Header */}
      <Navbar />

      {/* Global Error Banner */}
      {workerError && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2.5 text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{workerError}</span>
          </div>
          <button
            onClick={() => setWorkerError(null)}
            className="p-1 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active View: Quick Mode vs Pro Mode */}
      <main className="flex-1 pb-16">
        {appMode === 'quick' ? (
          <QuickConverter />
        ) : (
          <>
            {currentStep === 'template' && <TemplateStep />}
            {currentStep === 'upload_rectify' && <CropRectifyStep />}
            {currentStep === 'threshold' && <ThresholdStep />}
            {currentStep === 'vectorize' && <VectorSettingsStep />}
            {currentStep === 'glyphs' && <GlyphGridStep />}
            {currentStep === 'test_type' && <TextPreviewStep />}
            {currentStep === 'export' && <ExportStep />}
          </>
        )}
      </main>

      {/* Floating Modals */}
      <DiffInspectorModal />
      <GlyphEditorModal />
      <KerningModal />
      <PipelineDocsModal />
    </div>
  );
}
