import React, { useState } from 'react';
import { X, Plus, Trash2, Check, SlidersHorizontal } from 'lucide-react';
import { useFontStore } from '../store/useFontStore';
import { assembleFont } from '../engine/fontBuilder';

export const KerningModal: React.FC = () => {
  const {
    isKerningModalOpen,
    setKerningModalOpen,
    settings,
    updateSettings,
    glyphs,
    setGeneratedTtf,
    fontFamilyCssName,
  } = useFontStore();

  const [pairs, setPairs] = useState<Record<string, number>>(settings.kerningPairs || {});
  const [newPairStr, setNewPairStr] = useState('');
  const [activePreviewPair, setActivePreviewPair] = useState('AV');

  if (!isKerningModalOpen) return null;

  const handleSliderChange = (pair: string, val: number) => {
    const updated = { ...pairs, [pair]: val };
    setPairs(updated);
    updateSettings({ kerningPairs: updated });
    setActivePreviewPair(pair);
  };

  const handleAddPair = () => {
    const trimmed = newPairStr.trim();
    if (trimmed.length === 2 && !pairs[trimmed]) {
      const updated = { ...pairs, [trimmed]: -40 };
      setPairs(updated);
      updateSettings({ kerningPairs: updated });
      setActivePreviewPair(trimmed);
      setNewPairStr('');
    }
  };

  const handleDeletePair = (pair: string) => {
    const updated = { ...pairs };
    delete updated[pair];
    setPairs(updated);
    updateSettings({ kerningPairs: updated });
  };

  const handleSave = () => {
    updateSettings({ kerningPairs: pairs });
    // Reassemble font with kerning
    const font = assembleFont(glyphs, { ...settings, kerningPairs: pairs }, 200);
    const buffer = font.toArrayBuffer();
    setGeneratedTtf(buffer);
    setKerningModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-750 rounded-2xl shadow-2xl p-6 text-zinc-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Kerning Pair Adjustments</h3>
              <p className="text-xs text-zinc-400">
                Fine-tune optical letter spacing between specific character collisions (e.g. &apos;AV&apos;, &apos;To&apos;).
              </p>
            </div>
          </div>

          <button
            onClick={() => setKerningModalOpen(false)}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Pair Preview Box */}
        <div className="my-4 p-6 bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col items-center justify-center">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">
            Live Kerning Preview: &apos;{activePreviewPair}&apos;
          </span>
          <div
            className="text-7xl font-normal text-white tracking-normal select-none"
            style={{ fontFamily: fontFamilyCssName }}
          >
            {activePreviewPair}
          </div>
          <span className="text-xs font-mono text-amber-400 mt-2">
            Offset: {pairs[activePreviewPair] ?? 0} font units
          </span>
        </div>

        {/* Add Custom Pair */}
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-zinc-800">
          <input
            type="text"
            maxLength={2}
            value={newPairStr}
            onChange={(e) => setNewPairStr(e.target.value)}
            placeholder="e.g. LT, Fe"
            className="w-24 px-3 py-2 bg-zinc-950 border border-zinc-750 rounded-lg text-xs font-mono uppercase text-white focus:outline-none focus:border-amber-500 text-center"
          />
          <button
            onClick={handleAddPair}
            disabled={newPairStr.trim().length !== 2}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold rounded-lg text-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Kerning Pair</span>
          </button>
        </div>

        {/* List of Pairs */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {Object.entries(pairs).map(([pair, offset]) => (
            <div
              key={pair}
              onClick={() => setActivePreviewPair(pair)}
              className={`p-3 rounded-xl border transition flex items-center justify-between gap-4 cursor-pointer ${
                activePreviewPair === pair
                  ? 'bg-amber-500/10 border-amber-500/50'
                  : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="w-12 text-center font-mono font-bold text-sm text-white">
                {pair}
              </div>

              <div className="flex-1 flex items-center gap-3">
                <input
                  type="range"
                  min={-150}
                  max={60}
                  step={5}
                  value={offset}
                  onChange={(e) => handleSliderChange(pair, parseInt(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                />
                <span className="font-mono text-xs text-amber-400 w-12 text-right">
                  {offset > 0 ? `+${offset}` : offset}
                </span>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeletePair(pair);
                }}
                className="p-1.5 text-zinc-500 hover:text-red-400 transition"
                title="Remove pair"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-800 mt-4">
          <button
            onClick={() => setKerningModalOpen(false)}
            className="px-4 py-2 text-xs text-zinc-400 hover:text-white transition"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition shadow-lg shadow-amber-500/10"
          >
            <Check className="w-4 h-4" />
            <span>Apply Kerning to Font</span>
          </button>
        </div>
      </div>
    </div>
  );
};
