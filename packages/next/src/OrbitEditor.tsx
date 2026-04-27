'use client';

import dynamic from 'next/dynamic';

const OrbitEditorReact = dynamic(
  () => import('@orbit/react').then((mod) => mod.OrbitEditor),
  { ssr: false }
);

export { OrbitEditorReact as OrbitEditor };
