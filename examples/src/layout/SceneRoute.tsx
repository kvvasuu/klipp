import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useParams } from 'react-router';
import { findExample } from '../registry';
import { BaseScene } from '../scene/BaseScene';
import { SceneInfo } from './SceneInfo';

/** Resolves `:category/:slug` to a registry entry outside the Canvas, then mounts a fresh Canvas per
 *  scene - simpler than keeping one Canvas alive and bridging router context into its separate
 *  reconciler root, and switching examples is not a hot path. */
export function SceneRoute() {
  const { category, slug } = useParams();
  const example = findExample(category, slug);
  const [insetElement, setInsetElement] = useState<HTMLDivElement | null>(null);

  if (!example) {
    return (
      <div className="scene-missing">
        <p>No example at "{category}/{slug}".</p>
      </div>
    );
  }

  const { Scene } = example;
  return (
    <>
      <Canvas camera={{ position: [4, 3, 6], fov: 50 }}>
        <BaseScene insetElement={insetElement}>
          <Scene />
        </BaseScene>
      </Canvas>
      {example.description && <SceneInfo title={example.title} description={example.description} />}
      <div ref={setInsetElement} className="spectator-inset">
        <span className="spectator-inset-label">Spectator view</span>
      </div>
    </>
  );
}
