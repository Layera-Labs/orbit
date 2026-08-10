'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/brand/Icon';
import { addMedia, listMedia } from '@/db/media';
import { createNewProject, deleteProject, listProjects, saveProject } from '@/db/projects';
import { syncDelete } from '@/db/sync';
import { mediaSrc, type MediaRow, type ProjectKind, type ProjectRow } from '@/db/schema';
import { appendAudio, appendVisual } from '@/store/videoStore';
import { probe } from '@/features/design/panels/MediaPanel';
import type { VideoProject } from '@layera-labs/orbit-video/browser';
import styles from './Home.module.css';

interface Start {
  label: string;
  kind: ProjectKind;
  w: number;
  h: number;
  /** Extra air before this one — the still/motion break. */
  breakBefore?: boolean;
}

/*
 * The formats, in the order they stand on the bench: the three stills, then the
 * three motion cuts. Grouping them that way puts every disc — the mark that
 * says a format moves — in the right-hand half, so the row reads as two
 * families rather than six unrelated shapes.
 */
const STARTS: Start[] = [
  { label: 'Square post', kind: 'image', w: 1080, h: 1080 },
  { label: 'Story', kind: 'image', w: 1080, h: 1920 },
  { label: 'Presentation', kind: 'image', w: 1920, h: 1080 },
  { label: 'Reel', kind: 'video', w: 1080, h: 1920, breakBefore: true },
  { label: 'Wide film', kind: 'video', w: 1920, h: 1080 },
  { label: 'Square film', kind: 'video', w: 1080, h: 1080 },
];

/*
 * The bench's scale lives in `Home.module.css` as `--bench-h`, against a 1920
 * long edge. ONE divisor for the whole row is the entire point: a Story really
 * is twice a Presentation's height, and drawing each mark to its own cap —
 * which is what a row of equal buttons does — throws away the only information
 * the shapes carry.
 */

type Filter = 'all' | 'image' | 'video';

export function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
    listMedia()
      .then(setMedia)
      .catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  const open = useCallback(
    async (start: Start) => {
      const project = await createNewProject({
        kind: start.kind,
        width: start.w,
        height: start.h,
      });
      router.push(`/design/${project.id}`);
    },
    [router],
  );

  /**
   * Upload straight into a new document.
   *
   * The file lands in the media store and the project opens with it already
   * placed — dropping the user on an empty canvas next to a file they just
   * chose would make them do the placing twice.
   */
  const openWithFile = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const kind = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'image';
      const meta = await probe(file, kind);
      const stored = await addMedia({
        blob: file,
        name: file.name,
        origin: 'upload',
        mime: file.type,
        ...meta,
      });

      if (kind === 'image') {
        const project = await createNewProject({
          kind: 'image',
          name: file.name,
          width: meta.width ?? 1080,
          height: meta.height ?? 1080,
        });
        const doc = project.data as {
          width: number;
          height: number;
          pages: { children: unknown[] }[];
        };
        doc.pages[0].children.push({
          id: `el_${Date.now()}`,
          type: 'image',
          name: file.name,
          src: stored.src,
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
        return;
      }

      const project = await createNewProject({
        kind: 'video',
        name: file.name,
        width: meta.width ?? 1080,
        height: meta.height ?? 1920,
      });
      const base = project.data as VideoProject;
      const data =
        kind === 'audio'
          ? appendAudio(base, stored.src, meta.duration ?? 10)
          : appendVisual(base, {
              type: 'video',
              src: stored.src,
              duration: meta.duration ?? 4,
              note: file.name,
            });
      await saveProject({ id: project.id, kind: 'video', name: project.name, data });
      router.push(`/design/${project.id}`);
    },
    [router],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects ?? []).filter(
      (p) =>
        (filter === 'all' || p.kind === filter) && (!q || p.name.toLowerCase().includes(q)),
    );
  }, [projects, query, filter]);

  // Search reaches media too — a prompt you half-remember is often the fastest
  // way back to the thing you made from it.
  const matchedMedia = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return media
      .filter((m) => (m.prompt ?? m.name).toLowerCase().includes(q))
      .slice(0, 12);
  }, [media, query]);

  return (
    <div className={styles.page}>
      {/*
       * The bench.
       *
       * Not a headline stacked over a row of shortcut tiles — the formats ARE
       * the composition. Every one is drawn to a single scale and stands on one
       * rule, so the row is a true proportion chart: a Story is literally twice
       * a Presentation's height, and the discs mark the three that move. It is
       * the only thing on the page that could not be lifted onto some other
       * product, and it is a working control rather than an illustration.
       */}
      <header className={styles.hero}>
        <h1 className={styles.heroLine}>Stills and motion, one bench.</h1>

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>
            <Icon name="search" size={17} />
          </span>
          <input
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your work"
            aria-label="Search your work"
            type="search"
          />
        </div>

        <div className={styles.bench} role="group" aria-label="Start something">
          {STARTS.map((s) => (
            <button
              key={s.label}
              className={styles.start}
              data-break={s.breakBefore || undefined}
              onClick={() => void open(s)}
            >
              {/* The proportions travel as numbers and the SCALE lives in CSS,
                  so a media query that shrinks the bench shrinks the frames
                  with it — a height computed here would leave them standing
                  through the rule at the first breakpoint. */}
              <span
                className={styles.startFrame}
                style={{ '--fw': s.w, '--fh': s.h } as CSSProperties}
                aria-hidden="true"
              >
                {s.kind === 'video' && <span className={styles.startDot} />}
              </span>
              <span className={styles.startLabel}>{s.label}</span>
              <span className={`${styles.startSize} w-data`}>
                {s.w} × {s.h}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.benchFoot}>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,image/*,audio/*"
            hidden
            onChange={(e) => {
              void openWithFile(e.target.files);
              e.target.value = '';
            }}
          />
          <button className={styles.fromFile} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={15} />
            Start from a file
          </button>
          <CustomSize onOpen={open} />
        </div>
      </header>

      <section className={styles.section} aria-label="Your work">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{query ? 'Matches' : 'Recent work'}</h2>
          <span className={`${styles.count} w-data`}>{visible.length}</span>
          <div className={styles.filters}>
            {(['all', 'image', 'video'] as Filter[]).map((f) => (
              <button
                key={f}
                className={styles.filter}
                data-on={filter === f}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'image' ? 'Stills' : 'Motion'}
              </button>
            ))}
          </div>
        </div>

        {projects === null ? null : visible.length === 0 ? (
          <p className={styles.empty}>
            {query
              ? 'Nothing here matches that.'
              : 'Nothing yet. Pick a format above and it opens straight into the editor. Everything is stored in this browser.'}
          </p>
        ) : (
          <div className={styles.grid}>
            {visible.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={() => router.push(`/design/${project.id}`)}
                onDelete={async () => {
                  await deleteProject(project.id);
                  // Tell the cloud too, or the next pull helpfully restores it.
                  void syncDelete(project.id);
                  refresh();
                }}
              />
            ))}
          </div>
        )}
      </section>

      {matchedMedia.length > 0 && (
        <section className={styles.section} aria-label="Matching media">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Media</h2>
            <span className={`${styles.count} w-data`}>{matchedMedia.length}</span>
          </div>
          <div className={styles.grid}>
            {matchedMedia.map((row) => (
              <MediaCard key={row.id} row={row} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CustomSize({ onOpen }: { onOpen(start: Start): void }) {
  const [kind, setKind] = useState<ProjectKind>('image');
  const [w, setW] = useState(1080);
  const [h, setH] = useState(1080);
  const valid = w >= 16 && h >= 16 && w <= 8192 && h <= 8192;

  return (
    <div className={styles.custom}>
      <div className={styles.customKind}>
        {(['image', 'video'] as ProjectKind[]).map((k) => (
          <button
            key={k}
            className={styles.customKindOption}
            data-on={kind === k}
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
          >
            {k === 'image' ? 'Still' : 'Motion'}
          </button>
        ))}
      </div>
      <label className={styles.customField}>
        <span className={styles.customLabel}>Width</span>
        <input
          className={styles.customInput}
          type="number"
          value={w}
          min={16}
          max={8192}
          onChange={(e) => setW(Number(e.target.value) || 0)}
        />
      </label>
      <label className={styles.customField}>
        <span className={styles.customLabel}>Height</span>
        <input
          className={styles.customInput}
          type="number"
          value={h}
          min={16}
          max={8192}
          onChange={(e) => setH(Number(e.target.value) || 0)}
        />
      </label>
      <button
        className={styles.make}
        disabled={!valid}
        onClick={() => onOpen({ label: 'Custom', kind, w, h })}
      >
        Make it
      </button>
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: ProjectRow;
  onOpen(): void;
  onDelete(): void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!project.thumbnail) return;
    const next = URL.createObjectURL(project.thumbnail);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [project.thumbnail]);

  return (
    <article className={styles.card}>
      <button className={styles.thumb} onClick={onOpen} aria-label={`Open ${project.name}`}>
        {url ? (
          <img src={url} alt="" />
        ) : (
          <Icon name={project.kind === 'video' ? 'video' : 'image'} size={22} />
        )}
      </button>
      <button className={styles.cardName} onClick={onOpen}>
        {project.name}
      </button>
      <span className={`${styles.cardMeta} w-data`}>
        {project.kind === 'video' ? 'Motion' : 'Still'} · {shortDate(project.updatedAt)}
      </span>
      <button className={styles.delete} onClick={onDelete} aria-label={`Delete ${project.name}`}>
        <Icon name="trash" size={14} />
      </button>
    </article>
  );
}

function MediaCard({ row }: { row: MediaRow }) {
  const url = useMemo(() => URL.createObjectURL(row.blob), [row.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const isVideo = row.mime.startsWith('video/');
  const isAudio = row.mime.startsWith('audio/');

  return (
    <article className={styles.card}>
      <span className={styles.thumb}>
        {isVideo ? (
          <video src={`${url}#t=0.1`} muted playsInline preload="metadata" />
        ) : isAudio ? (
          <Icon name="music" size={22} />
        ) : (
          <img src={url} alt="" />
        )}
      </span>
      <span className={styles.cardName}>{row.prompt ?? row.name}</span>
      <span className={styles.cardMeta}>{row.origin === 'ai' ? 'Generated' : row.origin === 'stock' ? 'Stock' : 'Upload'}</span>
    </article>
  );
}

function shortDate(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
