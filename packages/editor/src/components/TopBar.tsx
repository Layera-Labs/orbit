import { useState, type MutableRefObject } from 'react';
import type Konva from 'konva';
import { Icon } from './Icon';
import { ExportMenu } from './ExportMenu';
import { ThemeToggle } from './ThemeToggle';

export function TopBar({ stageRef }: { stageRef: MutableRefObject<Konva.Stage | null> }) {
  const [title, setTitle] = useState('Untitled');
  return (
    <div className="o-topbar">
      <button className="o-home" title="Home">
        <Icon name="home" size={18} />
      </button>
      <input
        className="o-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        spellCheck={false}
      />
      <div className="o-spacer" />
      <ThemeToggle />
      <ExportMenu stageRef={stageRef} />
    </div>
  );
}
