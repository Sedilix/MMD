'use client';

/**
 * DesignStudio — entry point
 *
 * Re-exports the new Figma-class DesignStudioV2. Kept as a thin shim so
 * existing imports (`import DesignStudio from '.../DesignStudio'`) continue
 * to work while the entire workspace is implemented in
 * `./design/DesignStudioV2.tsx` and its `core/` modules.
 */
import dynamic from 'next/dynamic';
import type { DesignStudioProps } from './design/DesignStudioV2';

const DesignStudioV2 = dynamic(
  () => import('./design/DesignStudioV2').then((mod) => mod.default),
  { ssr: false }
);

export default function DesignStudio(props: DesignStudioProps) {
  return <DesignStudioV2 {...props} />;
}
