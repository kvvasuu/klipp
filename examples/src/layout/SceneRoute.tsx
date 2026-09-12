import { Canvas } from '@react-three/fiber';
import { useParams } from 'react-router';
import { findExample } from '../registry';

/** Resolves `:category/:slug` to a registry entry outside the Canvas, then mounts a fresh Canvas per
 *  scene - simpler than keeping one Canvas alive and bridging router context into its separate
 *  reconciler root, and switching examples is not a hot path. */
export function SceneRoute() {
  const { category, slug } = useParams();
  const example = findExample(category, slug);

  if (!example) {
    return (
      <div className="scene-missing">
        <p>No example at "{category}/{slug}".</p>
      </div>
    );
  }

  const { Scene } = example;
  return (
    <Canvas camera={{ position: [4, 3, 6], fov: 50 }}>
      <Scene />
    </Canvas>
  );
}
