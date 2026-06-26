'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { OrbitEditorProps } from '@orbit/react';

const OrbitEditorReact: ComponentType<OrbitEditorProps> = dynamic<OrbitEditorProps>(
  () => import('@orbit/react').then((mod) => mod.OrbitEditor),
  { ssr: false }
);

export { OrbitEditorReact as OrbitEditor };
