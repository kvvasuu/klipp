import { Aim, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import type { Mesh } from 'three';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 2.5, 9];

const targetAColor = '#21a9e0';
const targetASpeed = 0.7;
const targetARadius = 4;
const targetACenter: [number, number, number] = [0, 2.5, 0];

const targetBColor = '#ff6b4a';
const targetBSpeed = 1.1;
const targetBRadius = 2.2;
const targetBCenter: [number, number, number] = [0, 3, -3];

function OrbitingTarget({
  meshRef,
  center,
  radius,
  speed,
  vertical,
  color,
}: {
  meshRef: RefObject<Mesh | null>;
  center: [number, number, number];
  radius: number;
  speed: number;
  vertical: boolean;
  color: string;
}) {
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.elapsedTime * speed;
    if (vertical) {
      mesh.position.set(center[0], center[1] + Math.sin(t) * radius, center[2] + Math.cos(t) * radius);
    } else {
      mesh.position.set(center[0] + Math.cos(t) * radius, center[1], center[2] + Math.sin(t) * radius);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
    </mesh>
  );
}

/** The camera never moves (no Body at all - `initialState.position` is all it needs); `HardLookAt` re-aims
 *  at whichever target is active every single frame, so the orbiting target stays dead-center no matter
 *  how it moves, with zero damping - switching `activeTarget` snaps instantly, since HardLookAt has no
 *  damping prop to begin with. */
export function HardLookAt() {
  const targetARef = useRef<Mesh>(null);
  const targetBRef = useRef<Mesh>(null);

  const { activeTarget } = useControls('HardLookAt', {
    activeTarget: { value: 'A', options: ['A', 'B'] },
  });

  return (
    <>
      <OrbitingTarget
        meshRef={targetARef}
        center={targetACenter}
        radius={targetARadius}
        speed={targetASpeed}
        vertical={false}
        color={targetAColor}
      />
      <OrbitingTarget
        meshRef={targetBRef}
        center={targetBCenter}
        radius={targetBRadius}
        speed={targetBSpeed}
        vertical
        color={targetBColor}
      />

      <Klipp>
        <VirtualCamera name="hard-look-at-demo" priority={10} initialState={{ position: cameraPosition }}>
          <Aim.HardLookAt target={activeTarget === 'A' ? targetARef : targetBRef} />
          <SpectatorFrustum />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
