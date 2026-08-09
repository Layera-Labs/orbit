/**
 * AIPanel - Manual AI tools in sidebar
 * Images: Text→Img, Img→Img
 * Videos: Text→Vid, Img→Vid
 * Audio: Text→Audio
 */
import * as React from 'react';
import { useState, useCallback } from 'react';
import { OrbitButton, OrbitSlider, OrbitDropdown } from '@layera-labs/ui';
import type { AiBackend } from '../../backends/types';
import { useEditorStore } from '../../store';
import { useToast } from '../ToastProvider';
import type { OrbitEngine } from '@layera-labs/core';
import type { GeneratedAsset } from '@layera-labs/shared';

type TopTab = 'image' | 'video' | 'audio';

interface AIPanelProps {
  engine: OrbitEngine | null;
  /**
   * REQUIRED, deliberately. Every control in this panel is a generate button;
   * with nothing to generate against, the whole panel is dead controls. So a
   * host that has no AI layer does not render `AIPanel` at all — and the type
   * says so at the callsite, instead of the panel mounting and silently doing
   * nothing.
   */
  backend: AiBackend;
}

export const AIPanel: React.FC<AIPanelProps> = ({ backend }) => {
  const [topTab, setTopTab] = useState<TopTab>('image');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  const aiMode = useEditorStore((s) => s.aiMode);
  const aiSubMode = useEditorStore((s) => s.aiSubMode);
  const aiPrompt = useEditorStore((s) => s.aiPrompt);
  const aiReferenceImage = useEditorStore((s) => s.aiReferenceImage);
  const aiStrength = useEditorStore((s) => s.aiStrength);
  const aiDuration = useEditorStore((s) => s.aiDuration);
  const aiResolution = useEditorStore((s) => s.aiResolution);
  const aiModel = useEditorStore((s) => s.aiModel);
  const aiResults = useEditorStore((s) => s.aiResults);

  const setAIMode = useEditorStore((s) => s.setAIMode);
  const setAISubMode = useEditorStore((s) => s.setAISubMode);
  const setAIPrompt = useEditorStore((s) => s.setAIPrompt);
  const setAIReferenceImage = useEditorStore((s) => s.setAIReferenceImage);
  const setAIStrength = useEditorStore((s) => s.setAIStrength);
  const setAIDuration = useEditorStore((s) => s.setAIDuration);
  const setAIResolution = useEditorStore((s) => s.setAIResolution);
  const setAIModel = useEditorStore((s) => s.setAIModel);
  const addAIResult = useEditorStore((s) => s.addAIResult);
  const clearAIResults = useEditorStore((s) => s.clearAIResults);

  const topTabs: { id: TopTab; label: string }[] = [
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Videos' },
    { id: 'audio', label: 'Audio' },
  ];

  const imageSubTabs = [
    { id: 'text-to-image', label: 'Text→Img' },
    { id: 'image-to-image', label: 'Img→Img' },
  ];
  const videoSubTabs = [
    { id: 'text-to-video', label: 'Text→Vid' },
    { id: 'image-to-video', label: 'Img→Vid' },
  ];
  const audioSubTabs = [
    { id: 'text-to-audio', label: 'Text→Audio' },
  ];

  const subTabs =
    topTab === 'image' ? imageSubTabs : topTab === 'video' ? videoSubTabs : audioSubTabs;

  const handleTopTabChange = (tab: TopTab) => {
    setTopTab(tab);
    setAIMode(tab);
    const defaultSub =
      tab === 'image' ? 'text-to-image' : tab === 'video' ? 'text-to-video' : 'text-to-audio';
    setAISubMode(defaultSub as any);
  };

  const handleGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      let asset: GeneratedAsset;

      switch (aiSubMode) {
        case 'text-to-image':
          asset = await backend.generateImage({ prompt: aiPrompt, model: aiModel });
          break;
        case 'image-to-image':
          if (!aiReferenceImage) throw new Error('Reference image required');
          asset = await backend.imageToImage({
            prompt: aiPrompt,
            imageBase64: aiReferenceImage,
            strength: aiStrength,
            model: aiModel,
          });
          break;
        case 'text-to-video':
          asset = await backend.generateVideo({
            prompt: aiPrompt,
            duration: aiDuration,
            resolution: aiResolution,
            model: aiModel,
          });
          break;
        case 'image-to-video':
          if (!aiReferenceImage) throw new Error('Reference image required');
          asset = await backend.generateVideo({
            prompt: aiPrompt,
            imageBase64: aiReferenceImage,
            duration: aiDuration,
            resolution: aiResolution,
            model: aiModel,
          });
          break;
        case 'text-to-audio':
          asset = await backend.generateAudio({
            prompt: aiPrompt,
            duration: aiDuration,
            model: aiModel,
          });
          break;
        default:
          throw new Error(`Unsupported mode: ${aiSubMode}`);
      }

      addAIResult({
        id: asset.id,
        src: asset.src,
        thumbnail: asset.src,
        type: aiMode,
      });
      addToast('Generated successfully', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setError(msg);
      addToast(msg, 'error');
    } finally {
      setIsGenerating(false);
    }
  }, [aiPrompt, aiSubMode, aiModel, aiReferenceImage, aiStrength, aiDuration, aiResolution, aiMode, backend, addAIResult, addToast]);

  const needsReference = aiSubMode === 'image-to-image' || aiSubMode === 'image-to-video';
  const needsDuration = aiMode === 'video' || aiMode === 'audio';
  const needsResolution = aiMode === 'video';

  return (
    <div className="flex flex-col gap-orbit-md p-orbit-md">
      {/* Top Tabs */}
      <div className="flex border-b border-orbit-border">
        {topTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTopTabChange(tab.id)}
            className={`
              flex-1 px-orbit-sm py-orbit-sm text-xs font-medium transition-colors
              ${topTab === tab.id ? 'text-orbit-accent border-b-2 border-orbit-accent' : 'text-orbit-text-secondary hover:text-orbit-text'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-1">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setAISubMode(tab.id as any)}
            className={`
              flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors
              ${aiSubMode === tab.id ? 'border-orbit-accent bg-orbit-accent-subtle text-orbit-accent' : 'border-orbit-border bg-orbit-panel text-orbit-text-secondary'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Prompt */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-orbit-text-tertiary">Prompt</label>
        <textarea
          value={aiPrompt}
          onChange={(e) => setAIPrompt(e.target.value)}
          placeholder={`Describe your ${aiMode}...`}
          rows={3}
          className="resize-none rounded-md border border-orbit-border bg-orbit-panel p-2 text-xs text-orbit-text placeholder:text-orbit-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-accent"
        />
      </div>

      {/* Reference Image */}
      {needsReference && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-orbit-text-tertiary">Reference Image</label>
          <div className="flex gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => setAIReferenceImage(ev.target?.result as string);
                  reader.readAsDataURL(file);
                }
              }}
              className="hidden"
              id="ai-ref-upload"
            />
            <label
              htmlFor="ai-ref-upload"
              className="flex-1 cursor-pointer rounded-md border border-orbit-border bg-orbit-panel px-3 py-2 text-center text-xs text-orbit-text-secondary hover:text-orbit-text transition-colors"
            >
              {aiReferenceImage ? 'Change Image' : 'Upload Image'}
            </label>
            {aiReferenceImage && (
              <button
                onClick={() => setAIReferenceImage(null)}
                className="rounded-md border border-orbit-border bg-orbit-panel px-3 py-2 text-xs text-orbit-danger hover:bg-orbit-danger-muted transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          {aiReferenceImage && (
            <img src={aiReferenceImage} alt="Reference" className="mt-1 h-20 w-full rounded-md object-cover" />
          )}
        </div>
      )}

      {/* Strength (for img→img) */}
      {aiSubMode === 'image-to-image' && (
        <OrbitSlider
          label="Strength"
          min={0}
          max={1}
          step={0.05}
          value={aiStrength}
          onChange={setAIStrength}
          valueFormatter={(v) => `${Math.round(v * 100)}%`}
        />
      )}

      {/* Duration */}
      {needsDuration && (
        <OrbitSlider
          label="Duration (s)"
          min={1}
          max={30}
          step={1}
          value={aiDuration}
          onChange={setAIDuration}
          valueFormatter={(v) => `${v}s`}
        />
      )}

      {/* Resolution */}
      {needsResolution && (
        <OrbitDropdown
          options={[
            { value: '720p', label: '720p' },
            { value: '1080p', label: '1080p' },
            { value: '4k', label: '4K' },
          ]}
          value={aiResolution}
          onChange={setAIResolution}
          placeholder="Resolution"
        />
      )}

      {/* Model */}
      <OrbitDropdown
        options={[
          { value: 'gpt-4o', label: 'GPT-4o' },
          { value: 'gemini-pro', label: 'Gemini Pro' },
          { value: 'flux-2-klein', label: 'Flux 2 Klein' },
          { value: 'flux-inpaint', label: 'Flux Inpaint' },
        ]}
        value={aiModel}
        onChange={setAIModel}
        placeholder="Model"
      />

      {/* Error */}
      {error && (
        <div className="rounded-md bg-orbit-danger-muted px-3 py-2 text-[11px] text-orbit-danger">
          {error}
        </div>
      )}

      {/* Generate */}
      <OrbitButton
        variant="primary"
        size="sm"
        className="w-full"
        onClick={handleGenerate}
        disabled={isGenerating || !aiPrompt.trim()}
      >
        {isGenerating ? 'Generating...' : 'Generate'}
      </OrbitButton>

      {/* Results */}
      {aiResults.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-orbit-text-secondary">Results</span>
            <button
              onClick={clearAIResults}
              className="text-[10px] text-orbit-text-tertiary hover:text-orbit-text"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {aiResults.map((r) => (
              <div key={r.id} className="aspect-square rounded-md bg-orbit-panel border border-orbit-border overflow-hidden">
                {r.src ? (
                  <img src={r.src} alt="AI result" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-orbit-text-tertiary">
                    No preview
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
