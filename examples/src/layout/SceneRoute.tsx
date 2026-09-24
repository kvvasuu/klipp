import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { useParams } from 'react-router';
import { findExample } from '../registry';
import { BaseScene } from '../scene/BaseScene';
import { SceneInfo } from './SceneInfo';

/** Mounts a fresh Canvas per scene. `key` is needed since react-router reuses this component across
 *  param changes, which would otherwise keep the previous scene's one-time state. */
export function SceneRoute() {
  const { category, slug } = useParams();
  const example = findExample(category, slug);
  const [insetElement, setInsetElement] = useState<HTMLDivElement | null>(null);

  if (!example) {
    return (
      <div className="scene-missing">
        <p>
          No example at "{category}/{slug}".
        </p>
      </div>
    );
  }

  const { Scene } = example;
  return (
    <>
      <Canvas camera={{ position: [4, 3, 6], fov: 50 }}>
        <BaseScene
          insetElement={insetElement}
          spectatorPosition={example.spectatorPosition}
          spectatorTarget={example.spectatorTarget}
          key={`${category}/${slug}`}>
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
