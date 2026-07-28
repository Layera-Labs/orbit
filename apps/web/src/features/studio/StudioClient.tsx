'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { VideoProject } from '@orbit/video/browser';
import { createNewProject, saveProject } from '@/db/projects';
import { mediaSrc, type MediaRow } from '@/db/schema';
import { appendAudio, appendVisual } from '@/store/videoStore';
import { GraduatedRule } from '@/features/shell/GraduatedRule';
import { AiPanel } from '@/features/design/panels/AiPanel';
import styles from './Studio.module.css';

/**
 * Generation without a document open.
 *
 * The panel is the SAME component the editor's Generate dock renders — only what
 * happens to a result differs. In the editor a result is inserted into what you
 * are working on; here there is nothing to insert into, so it starts a new
 * project. One implementation, two destinations.
 */
export function StudioClient() {
  const router = useRouter();

  const start = useCallback(
    async (row: MediaRow) => {
      const src = mediaSrc(row.id);
      const isAudio = row.mime.startsWith('audio/');
      const isVideo = row.mime.startsWith('video/');
      const name = row.prompt?.slice(0, 40) ?? row.name;

      if (isAudio || isVideo) {
        const project = await createNewProject({ kind: 'video', name });
        const base = project.data as VideoProject;
        const data = isAudio
          ? appendAudio(base, src, row.duration ?? 8)
          : appendVisual(base, {
              type: 'video',
              src,
              duration: row.duration ?? 4,
              note: name,
            });
        await saveProject({ id: project.id, kind: 'video', name: project.name, data });
        router.push(`/design/${project.id}`);
        return;
      }

      const project = await createNewProject({
        kind: 'image',
        name,
        width: row.width ?? 1080,
        height: row.height ?? 1080,
      });
      const doc = project.data as {
        width: number;
        height: number;
        pages: { children: unknown[] }[];
      };
      doc.pages[0].children.push({
        id: `el_${Date.now()}`,
        type: 'image',
        name,
        src,
        x: 0,
        y: 0,
        width: doc.width,
        height: doc.height,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        blendMode: 'normal',
      });
      await saveProject({
        id: project.id,
        kind: 'image',
        name: project.name,
        data: project.data,
      });
      router.push(`/design/${project.id}`);
    },
    [router],
  );

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Generate</h1>
        <p className={styles.blurb}>
          Stills, motion and speech through your own render service. A result opens as a new
          project; inside the editor the same panel adds it to what you already have.
        </p>
      </header>
      <GraduatedRule className={styles.rule} />
      <div className={styles.console}>
        <AiPanel onInsert={(row) => void start(row)} />
      </div>
    </div>
  );
}
