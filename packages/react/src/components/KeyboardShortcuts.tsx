import * as React from 'react';
import { useEffect } from 'react';
import type { OrbitEngine } from '@orbit/core';

interface KeyboardShortcutsProps {
  engine: OrbitEngine | null;
}

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({ engine }) => {
  useEffect(() => {
    if (!engine) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Undo: Ctrl/Cmd + Z
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        engine.undo();
        return;
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if ((isMeta && e.key === 'z' && e.shiftKey) || (isMeta && e.key === 'y')) {
        e.preventDefault();
        engine.redo();
        return;
      }

      // Duplicate: Ctrl/Cmd + D
      if (isMeta && e.key === 'd') {
        e.preventDefault();
        const selected = engine.getSelectedLayers();
        selected.forEach((id) => {
          const newId = engine.duplicateLayer(id);
          if (newId) engine.selectLayer(newId);
        });
        return;
      }

      // Copy: Ctrl/Cmd + C
      if (isMeta && e.key === 'c') {
        e.preventDefault();
        engine.copy();
        return;
      }

      // Paste: Ctrl/Cmd + V
      if (isMeta && e.key === 'v') {
        e.preventDefault();
        engine.paste();
        return;
      }

      // Delete selected layers
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isMeta) {
        const selected = engine.getSelectedLayers();
        selected.forEach((id) => engine.removeLayer(id));
        return;
      }

      // Bring forward: Ctrl/Cmd + ]
      if (isMeta && e.key === ']' && !e.shiftKey) {
        e.preventDefault();
        const selected = engine.getSelectedLayers();
        selected.forEach((id) => engine.bringForward(id));
        return;
      }

      // Bring to front: Ctrl/Cmd + Shift + ]
      if (isMeta && e.shiftKey && e.key === ']') {
        e.preventDefault();
        const selected = engine.getSelectedLayers();
        selected.forEach((id) => engine.bringToFront(id));
        return;
      }

      // Send backward: Ctrl/Cmd + [
      if (isMeta && e.key === '[' && !e.shiftKey) {
        e.preventDefault();
        const selected = engine.getSelectedLayers();
        selected.forEach((id) => engine.sendBackward(id));
        return;
      }

      // Send to back: Ctrl/Cmd + Shift + [
      if (isMeta && e.shiftKey && e.key === '[') {
        e.preventDefault();
        const selected = engine.getSelectedLayers();
        selected.forEach((id) => engine.sendToBack(id));
        return;
      }

      // Group: Ctrl/Cmd + G
      if (isMeta && e.key === 'g' && !e.shiftKey) {
        e.preventDefault();
        const selected = engine.getSelectedLayers();
        if (selected.length >= 2) {
          engine.groupLayers(selected);
        }
        return;
      }

      // Ungroup: Ctrl/Cmd + Shift + G
      if (isMeta && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        const selected = engine.getSelectedLayers();
        selected.forEach((id) => engine.ungroupLayer(id));
        return;
      }

      // Tool shortcuts
      if (!isMeta) {
        switch (e.key.toLowerCase()) {
          case 'v':
            engine.setTool('select');
            break;
          case 'b':
            engine.setTool('brush');
            break;
          case 't':
            engine.setTool('text');
            break;
          case 'r':
            engine.setTool('shape');
            break;
          case 'p':
            engine.setTool('vector');
            break;
          case 'e':
            {
              const selected = engine.getSelectedLayers();
              if (selected.length === 1) {
                if (engine.isPathEditing()) {
                  engine.stopPathEdit();
                } else {
                  engine.startPathEdit(selected[0]);
                }
              }
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine]);

  return null;
};
