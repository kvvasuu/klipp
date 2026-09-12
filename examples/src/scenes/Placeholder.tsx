import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

/** Stands in for every example not built yet - just enough to prove the Canvas actually mounted and is
 *  rendering, not a real demo. Swapped out per entry as TODO-examples.md scenes get built. */
export function Placeholder() {
  const meshRef = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.x += delta * 0.4;
    mesh.rotation.y += delta * 0.6;
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <mesh ref={meshRef}>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshStandardMaterial color="#7e14ff" wireframe />
      </mesh>
    </>
  );
}
