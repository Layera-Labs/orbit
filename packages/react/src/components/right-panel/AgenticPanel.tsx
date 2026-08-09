import * as React from 'react';
import { useCallback, useState } from 'react';
import { OrbitButton, OrbitDropdown } from '@orbit/ui';
import type { OrbitEngine } from '@orbit/core';
import type { GeneratedAsset, Layer } from '@orbit/shared';
import type { AgenticTool } from '../../hooks/useOrbitAgentic';
import type { AiBackend } from '../../backends/types';
import { useOrbitAgentic } from '../../hooks/useOrbitAgentic';
import { addLayerAndSelect, createImageLayer } from '../../utils/layerPlacement';
import { createFallbackActionsFromPrompt, executeAgenticActions } from '../../agentic/actions';
import { useToast } from '../ToastProvider';

interface AgenticPanelProps {
  engine: OrbitEngine | null;
  /** Required for the same reason `useOrbitAgentic`'s is: this panel is only calls into it. */
  backend: AiBackend;
}

type Workflow = 'canvas-agent' | AgenticTool;

const WORKFLOWS: { id: Workflow; label: string; description: string; needsCanvas: boolean }[] = [
  { id: 'canvas-agent', label: 'Canvas Agent', description: 'Add or update layers', needsCanvas: false },
  { id: 'generate', label: 'Generate Image', description: 'Create a new asset', needsCanvas: false },
  { id: 'edit', label: 'Edit Image', description: 'Use selected image', needsCanvas: true },
  { id: 'inpaint', label: 'Change Region', description: 'Use canvas context', needsCanvas: true },
  { id: 'outpaint', label: 'Expand Image', description: 'Extend composition', needsCanvas: true },
  { id: 'lighting', label: 'Lighting', description: 'Relight image layer', needsCanvas: true },
];

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getSelectedImageBase64(engine: OrbitEngine | null): string | null {
  if (!engine) return null;
  const selectedIds = engine.getSelectedLayers();
  if (selectedIds.length !== 1) return null;
  const layer = engine.scene.getLayer(selectedIds[0]);
  if (!layer || layer.type !== 'image') return null;
  const content = layer.content as Layer['content'] & { src: string };
  return content.src || null;
}

export const AgenticPanel: React.FC<AgenticPanelProps> = ({ engine, backend }) => {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [workflow, setWorkflow] = useState<Workflow>('canvas-agent');
  const [useCanvas, setUseCanvas] = useState(false);
  const [useSelection, setUseSelection] = useState(true);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [lastActions, setLastActions] = useState<string[]>([]);
  const { addToast } = useToast();

  const { isGenerating, error, generate, runCanvasAgent, clearResults, results } = useOrbitAgentic({
    engine,
    backend,
  });

  const activeWorkflow = WORKFLOWS.find((item) => item.id === workflow) ?? WORKFLOWS[0];

  const captureContextImage = useCallback(async () => {
    if (!engine || (!useCanvas && !useSelection)) return null;
    if (useSelection) return getSelectedImageBase64(engine);
    const blob = await engine.export({ format: 'png', quality: 1 });
    return blobToBase64(blob);
  }, [engine, useCanvas, useSelection]);

  const handleCanvasAgent = useCallback(async () => {
    if (!engine || !prompt.trim()) return;
    setLastMessage(null);
    setLastActions([]);

    let imageBase64: string | null = null;
    try {
      imageBase64 = await captureContextImage();
    } catch {
      addToast('Failed to capture canvas context', 'error');
      return;
    }

    const selectedLayerIds = engine.getSelectedLayers();
    const response = await runCanvasAgent({
      prompt,
      scene: engine.scene.getState(),
      selectedLayerIds,
      model,
      imageBase64: useCanvas ? imageBase64 : null,
      selectionImageBase64: useSelection ? imageBase64 : null,
    });

    let actions = response?.actions ?? [];
    if (actions.length === 0) {
      clearResults();
      actions = createFallbackActionsFromPrompt(prompt, selectedLayerIds);
    }

    if (actions.length === 0) {
      addToast('No canvas actions were returned', 'error');
      return;
    }

    const touchedIds = executeAgenticActions(engine, actions);
    setLastActions(actions.map((action) => action.type));
    setLastMessage(response?.message ?? `${actions.length} action${actions.length === 1 ? '' : 's'} applied`);
    addToast(touchedIds.length > 0 ? 'Canvas updated' : 'Agent action completed', 'success');
  }, [engine, prompt, captureContextImage, runCanvasAgent, model, useCanvas, useSelection, clearResults, addToast]);

  const handleGenerate = useCallback(async () => {
    if (!engine || !prompt.trim() || workflow === 'canvas-agent') return;

    let imageBase64: string | null = null;
    if (activeWorkflow.needsCanvas) {
      try {
        imageBase64 = await captureContextImage();
      } catch {
        addToast('Failed to capture canvas context', 'error');
        return;
      }
      if (!imageBase64) {
        addToast('Select an image layer or enable full canvas context', 'error');
        return;
      }
    }

    setLastMessage(null);
    setLastActions([]);
    clearResults();
    const asset = await generate({
      prompt,
      tool: workflow,
      imageBase64,
      model,
    });

    if (asset) {
      setLastMessage(`${activeWorkflow.label} complete`);
      addToast(`${activeWorkflow.label} complete`, 'success');
    }
  }, [engine, prompt, workflow, activeWorkflow, captureContextImage, clearResults, generate, model, addToast]);

  const handleRun = useCallback(() => {
    if (workflow === 'canvas-agent') {
      void handleCanvasAgent();
    } else {
      void handleGenerate();
    }
  }, [workflow, handleCanvasAgent, handleGenerate]);

  const handleAddGeneratedAsset = useCallback(
    (asset: GeneratedAsset) => {
      if (!engine) return;
      const layer = createImageLayer(engine, asset.src, asset.width, asset.height, undefined, 'AI Image');
      const id = addLayerAndSelect(engine, layer);
      if (id) addToast('Generated image added', 'success');
    },
    [engine, addToast]
  );

  const models = [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gemini-pro', label: 'Gemini Pro' },
    { id: 'flux-2-klein', label: 'Flux 2 Klein' },
    { id: 'flux-inpaint', label: 'Flux Inpaint' },
  ];

  return (
    <div className="flex min-h-full flex-col gap-4 p-5">
      <OrbitDropdown
        options={models.map((item) => ({ value: item.id, label: item.label }))}
        value={model}
        onChange={setModel}
        placeholder="Model"
      />

      <div className="grid grid-cols-2 gap-2">
        {WORKFLOWS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setWorkflow(item.id);
              if (!item.needsCanvas && item.id !== 'canvas-agent') {
                setUseCanvas(false);
                setUseSelection(false);
              }
            }}
            className={`
              flex min-h-[74px] flex-col justify-between rounded-2xl border p-3 text-left shadow-sm transition active:scale-[0.98]
              ${workflow === item.id
                ? 'border-blue-300 bg-blue-50 text-blue-800'
                : 'border-slate-200/80 bg-white/75 text-slate-700 hover:border-slate-300 hover:bg-white'}
            `}
          >
            <span className="text-xs font-semibold">{item.label}</span>
            <span className="text-[11px] leading-snug text-slate-500">{item.description}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-3 shadow-sm">
        <span className="text-xs font-semibold text-slate-700">Context</span>
        <div className="mt-3 flex flex-col gap-2">
          <label className="flex items-center justify-between gap-3 text-xs text-slate-600">
            Use selected layer
            <input
              type="checkbox"
              checked={useSelection}
              onChange={(event) => {
                setUseSelection(event.target.checked);
                if (event.target.checked) setUseCanvas(false);
              }}
              className="h-4 w-4 accent-blue-600"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-xs text-slate-600">
            Use full canvas
            <input
              type="checkbox"
              checked={useCanvas}
              onChange={(event) => {
                setUseCanvas(event.target.checked);
                if (event.target.checked) setUseSelection(false);
              }}
              className="h-4 w-4 accent-blue-600"
            />
          </label>
        </div>
      </div>

      <label className="flex flex-col gap-2 text-xs font-semibold text-slate-700">
        Prompt
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Add a heading that says Fresh Summer Sale, make it blue, and center it."
          rows={6}
          className="min-h-[150px] resize-none rounded-2xl border border-slate-200/80 bg-white/80 p-3 text-sm font-normal leading-relaxed text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {lastMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {lastMessage}
          {lastActions.length > 0 && (
            <span className="mt-1 block text-[11px] text-emerald-600">
              {lastActions.join(', ')}
            </span>
          )}
        </div>
      )}

      <OrbitButton
        variant="primary"
        size="sm"
        onClick={handleRun}
        disabled={isGenerating || !prompt.trim()}
        className="w-full"
      >
        {isGenerating ? 'Working...' : workflow === 'canvas-agent' ? 'Apply to Canvas' : activeWorkflow.label}
      </OrbitButton>

      {results.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Generated asset</span>
            <button type="button" onClick={clearResults} className="text-[11px] font-medium text-slate-500 hover:text-slate-800">
              Clear
            </button>
          </div>
          <div className="aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <img src={results[0].src} alt="" className="h-full w-full object-contain" />
          </div>
          <OrbitButton variant="secondary" size="sm" onClick={() => handleAddGeneratedAsset(results[0])}>
            Add as Layer
          </OrbitButton>
        </div>
      )}
    </div>
  );
};
