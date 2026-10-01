import React, { useRef } from 'react';
import {
  FileText,
  Crop,
  Sliders,
  PenTool,
  Grid,
  Type,
  Download,
  BookOpen,
  FolderDown,
  FolderUp,
  RotateCcw,
  Sparkles,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';
import { useFontStore, PipelineStep } from '../store/useFontStore';

const STEPS: { id: PipelineStep; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'template', label: '1. Template', icon: FileText },
  { id: 'upload_rectify', label: '2. Rectify Quad', icon: Crop },
  { id: 'threshold', label: '3. Threshold', icon: Sliders },
  { id: 'vectorize', label: '4. Vectorize', icon: PenTool },
  { id: 'glyphs', label: '5. Glyphs QA', icon: Grid },
  { id: 'test_type', label: '6. Type Tester', icon: Type },
  { id: 'export', label: '7. Export TTF', icon: Download },
];

export const Navbar: React.FC = () => {
  const {
    appMode,
    setAppMode,
    currentStep,
    setCurrentStep,
    setDocsModalOpen,
    exportProjectJson,
    importProjectJson,
    resetAll,
    sourceImageSrc,
    rectifiedPixels,
    glyphs,
  } = useFontStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadProject = () => {
    const json = exportProjectJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `font-creator-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        const ok = importProjectJson(content);
        if (ok) {
          alert('Project loaded successfully!');
        } else {
          alert('Failed to parse project file. Please ensure it is a valid Font Creator JSON export.');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Determine if a step is accessible
  const isStepEnabled = (stepId: PipelineStep): boolean => {
    if (stepId === 'template') return true;
    if (stepId === 'upload_rectify') return true;
    if (stepId === 'threshold') return !!sourceImageSrc;
    if (stepId === 'vectorize') return !!rectifiedPixels;
    if (stepId === 'glyphs') return glyphs.length > 0;
    if (stepId === 'test_type') return glyphs.length > 0;
    if (stepId === 'export') return glyphs.length > 0;
    return true;
  };

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur sticky top-0 z-40">
      {/* Top Bar: Brand, Mode Switcher & Tools */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 p-[1px] shadow-lg shadow-amber-500/10">
            <div className="w-full h-full bg-zinc-950 rounded-[11px] flex items-center justify-center text-amber-400 font-mono font-bold text-lg">
              F
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-tight text-base sm:text-lg">Font Creator</span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                PIXEL-EXACT
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">
              Turn letter images into installable .TTF fonts
            </p>
          </div>
        </div>

        {/* Center Mode Switcher */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setAppMode('quick')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
              appMode === 'quick'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${appMode === 'quick' ? 'fill-current' : ''}`} />
            <span>⚡ Quick Mode</span>
          </button>

          <button
            onClick={() => setAppMode('pro')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
              appMode === 'pro'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Pro Calibrator</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Docs / Guarantee */}
          <button
            onClick={() => setDocsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition"
            title="View Pipeline Architecture & Accuracy Guarantee"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden md:inline">How It Works</span>
          </button>

          {/* Save Project */}
          <button
            onClick={handleDownloadProject}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 rounded-lg transition"
            title="Save Project Settings to JSON"
          >
            <FolderDown className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Save</span>
          </button>

          {/* Load Project */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 rounded-lg transition"
            title="Load Saved Project JSON"
          >
            <FolderUp className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Load</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleUploadProject}
            className="hidden"
          />

          {/* Reset */}
          <button
            onClick={() => {
              if (confirm('Start a new font project? Any unsaved progress will be cleared.')) {
                resetAll();
              }
            }}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition"
            title="Reset Project"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Step Navigation Bar (only shown in Pro Mode) */}
      {appMode === 'pro' && (
        <nav className="border-t border-zinc-900 bg-zinc-950/60 overflow-x-auto scrollbar-none animate-fade-in">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 py-1.5">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const enabled = isStepEnabled(step.id);

              return (
                <button
                  key={step.id}
                  onClick={() => enabled && setCurrentStep(step.id)}
                  disabled={!enabled}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    isActive
                      ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                      : enabled
                      ? 'text-zinc-300 hover:text-white hover:bg-zinc-900'
                      : 'text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-zinc-950' : 'text-zinc-400'}`} />
                  <span>{step.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
};
