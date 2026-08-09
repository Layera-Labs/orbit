import * as React from 'react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useOrbitLayers } from '../../hooks/useOrbitEngine';
import type { OrbitEngine } from '@layera-labs/core';

interface LayersPanelProps {
  engine: OrbitEngine | null;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({ engine }) => {
  const { layers, selectedIds, selectLayer, moveLayer, updateLayer } = useOrbitLayers(engine);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== draggingId) {
      setDragOverId(id);
    }
  }, [draggingId]);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) {
      setDragOverId(null);
      setDraggingId(null);
      return;
    }

    const sourceIndex = layers.findIndex((l) => l.id === sourceId);
    const targetIndex = layers.findIndex((l) => l.id === targetId);
    if (sourceIndex !== -1 && targetIndex !== -1) {
      moveLayer(sourceId, targetIndex);
    }

    setDragOverId(null);
    setDraggingId(null);
  }, [layers, moveLayer]);

  const handleDragEnd = useCallback(() => {
    setDragOverId(null);
    setDraggingId(null);
  }, []);

  const startRename = (layerId: string, currentName: string) => {
    setEditingId(layerId);
    setEditName(currentName);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      updateLayer(editingId, { name: editName.trim() });
    }
    setEditingId(null);
  };

  const toggleVisibility = (layerId: string, current: boolean) => {
    updateLayer(layerId, { visible: !current });
  };

  const toggleLocked = (layerId: string, current: boolean) => {
    updateLayer(layerId, { locked: !current });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-orbit-md py-orbit-sm text-xs font-medium text-orbit-text-secondary uppercase tracking-wider border-b border-orbit-border">
        Layers
      </div>
      <div className="flex flex-1 flex-col gap-px overflow-auto py-1">
        {layers.length === 0 && (
          <div className="px-orbit-md py-orbit-sm text-xs text-orbit-text-tertiary">
            No layers
          </div>
        )}
        {layers.map((layer) => {
          const isSelected = selectedIds.includes(layer.id);
          const isDragging = draggingId === layer.id;
          const isDragOver = dragOverId === layer.id;
          const isEditing = editingId === layer.id;

          return (
            <div
              key={layer.id}
              draggable={!layer.locked}
              onDragStart={(e) => handleDragStart(e, layer.id)}
              onDragOver={(e) => handleDragOver(e, layer.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, layer.id)}
              onDragEnd={handleDragEnd}
              onClick={() => selectLayer(layer.id)}
              className={`
                flex items-center gap-2 px-orbit-md py-orbit-sm text-left text-sm transition-colors cursor-pointer select-none
                ${isSelected ? 'bg-orbit-selected text-orbit-text' : 'text-orbit-text-secondary hover:bg-orbit-hover'}
                ${isDragging ? 'opacity-50' : ''}
                ${isDragOver ? 'border-t-2 border-orbit-accent' : ''}
                ${!layer.visible ? 'opacity-40' : ''}
              `}
            >
              <span className="text-xs uppercase tracking-wide opacity-60 w-8 shrink-0">
                {layer.type.slice(0, 3)}
              </span>

              {isEditing ? (
                <input
                  ref={inputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 rounded border border-orbit-accent bg-orbit-panel px-1 py-0.5 text-xs text-orbit-text focus-visible:outline-none"
                />
              ) : (
                <span
                  className="flex-1 truncate"
                  onDoubleClick={() => startRename(layer.id, layer.name)}
                >
                  {layer.name}
                </span>
              )}

              {/* Visibility toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVisibility(layer.id, layer.visible);
                }}
                className={`shrink-0 rounded p-0.5 transition-colors ${layer.visible ? 'text-orbit-text-secondary hover:text-orbit-text' : 'text-orbit-text-tertiary hover:text-orbit-text'}`}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
              >
                {layer.visible ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                )}
              </button>

              {/* Lock toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLocked(layer.id, layer.locked);
                }}
                className={`shrink-0 rounded p-0.5 transition-colors ${layer.locked ? 'text-orbit-accent' : 'text-orbit-text-secondary hover:text-orbit-text'}`}
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
              >
                {layer.locked ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
