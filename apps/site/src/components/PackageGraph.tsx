'use client';

/**
 * The SDK, drawn as what it is.
 *
 * A row of feature cards would say nothing here — the interesting fact about
 * Orbit's packages is their SHAPE: the engine depends on nothing, which is
 * exactly why both previews and the encoder can agree through it; the v2 half
 * fans out of one document model; the v1 half is a longer chain and is in
 * maintenance. That is a graph, so it is drawn as a graph, from the real
 * manifests (`packages.ts`, checked by `__tests__/packages.test.ts`).
 *
 * A node is a RULE with its name above it and a connector to each thing it
 * depends on. Not a box: a box grid is the card wall this section exists to
 * avoid, and a rule with rounded caps is the house's own geometry.
 *
 * ## Interaction
 *
 * Hovering or focusing a package lights its own connectors and dims the rest,
 * and writes its one-line role into a slot below whose height is RESERVED — so
 * nothing on the page moves as the reader sweeps across the graph. Everything
 * is legible before any of that happens; the highlight adds emphasis and never
 * reveals content that was hidden.
 */
import { useState } from 'react';
import { COL_X, EDGES, NODE_W, PACKAGES, VIEW_H, VIEW_W, type Pkg } from './packages';
import styles from './PackageGraph.module.css';

const BY_ID = new Map(PACKAGES.map((p) => [p.id, p]));

/** Right end of a node's rule — where its dependents connect from. */
const rightOf = (p: Pkg) => [COL_X[p.col] + NODE_W, p.y] as const;
/** Left end — where this node's own dependencies arrive. */
const leftOf = (p: Pkg) => [COL_X[p.col], p.y] as const;

/**
 * A connector, as a cubic with horizontal tangents at both ends, so it leaves
 * and arrives along the rule it joins rather than stabbing into it at an angle.
 */
function connector(from: Pkg, to: Pkg): string {
  const [x1, y1] = rightOf(to);
  const [x2, y2] = leftOf(from);
  const bow = Math.max(28, (x2 - x1) * 0.55);
  return `M ${x1} ${y1} C ${x1 + bow} ${y1}, ${x2 - bow} ${y2}, ${x2} ${y2}`;
}

export function PackageGraph() {
  const [active, setActive] = useState<string | null>(null);

  const touches = (id: string) =>
    active === null || active === id || EDGES.some(([f, t]) => (f === active && t === id) || (t === active && f === id));
  const edgeLit = (f: string, t: string) => active === null || active === f || active === t;

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className={styles.svg}
        role="img"
        aria-label="Dependency graph of the twelve published Orbit packages. orbit-video depends on nothing. orbit-model is the root of the v2 half, feeding orbit-render and orbit-providers, which together feed orbit-editor. The v1 half runs from orbit-shared through orbit-ui, orbit-effects, orbit-agentic and orbit-core into orbit-react and then orbit-next."
      >
        {/*
          The three bands, named once each. Without these the graph is twelve
          equal things; the whole point is that it is an engine, a current SDK
          and a maintained older one, and a reader should not have to infer
          that from the edges.
        */}
        {[
          { y: 22, text: 'the engine — no dependencies, which is what lets both renderers agree through it' },
          { y: 96, text: 'v2 — the current web SDK' },
          { y: 226, text: 'v1 — feature-complete, documented, maintained' },
        ].map((band) => (
          <text key={band.y} x={COL_X[0]} y={band.y} className={styles.band}>
            {band.text}
          </text>
        ))}

        {/* Connectors first: they pass under the rules and the names. */}
        <g fill="none" strokeLinecap="round">
          {EDGES.map(([f, t]) => {
            const from = BY_ID.get(f)!;
            const to = BY_ID.get(t)!;
            return (
              <path
                key={`${f}-${t}`}
                d={connector(from, to)}
                className={`${styles.edge} ${from.tier === 'v1' ? styles.edgeQuiet : ''} ${
                  edgeLit(f, t) ? '' : styles.dim
                } ${active !== null && (f === active || t === active) ? styles.edgeLive : ''}`}
              />
            );
          })}
        </g>

        {PACKAGES.map((p) => {
          const [x] = leftOf(p);
          const lit = touches(p.id);
          return (
            <g
              key={p.id}
              className={`${styles.node} ${p.tier === 'v1' ? styles.quiet : ''} ${lit ? '' : styles.dim} ${
                active === p.id ? styles.active : ''
              }`}
              tabIndex={0}
              role="button"
              aria-label={`${p.id}: ${p.role}`}
              onMouseEnter={() => setActive(p.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(p.id)}
              onBlur={() => setActive(null)}
            >
              {/* A generous invisible target: the rule itself is 2px tall and
                  nobody should have to hit that with a pointer. */}
              <rect x={x - 6} y={p.y - 26} width={NODE_W + 12} height={38} fill="transparent" />
              <text x={x} y={p.y - 9} className={styles.name}>
                {p.id}
              </text>
              <rect x={x} y={p.y - 1} width={NODE_W} height={2} rx={1} className={styles.rule} />
              {/* The house disc, at the end of the rule where the value is read. */}
              <circle cx={x + NODE_W} cy={p.y} r={3.5} className={styles.disc} />
            </g>
          );
        })}
      </svg>

      {/*
        Reserved height. The role line changes as the reader moves across the
        graph, and a slot that grows and collapses would make the whole page
        twitch under the pointer.
      */}
      <p className={styles.role} aria-live="polite">
        {active ? (
          <>
            <span className={styles.roleName}>@layera-labs/orbit-{active}</span>
            <span>{BY_ID.get(active)!.role}</span>
          </>
        ) : (
          <span className={styles.roleIdle}>
            Twelve packages, published. Point at one to see what it is — every line is a
            real dependency, read off the manifests.
          </span>
        )}
      </p>
    </div>
  );
}
