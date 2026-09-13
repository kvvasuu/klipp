import { Aim, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import type { Mesh } from 'three';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const groundBoxes: GroundBox[] = [
  { x: 2, z: 2, width: 0.7, height: 0.12, depth: 0.7 },
  { x: -3, z: 4, width: 0.6, height: 0.15, depth: 0.8 },
  { x: 5, z: -3, width: 0.8, height: 0.1, depth: 0.6, color: '#9a9aa8' },
  { x: -6, z: -2, width: 0.7, height: 0.12, depth: 0.7 },
  { x: 0, z: -6, width: 0.6, height: 0.1, depth: 0.9 },
  { x: 4, z: 5, width: 0.8, height: 0.15, depth: 0.6, color: '#9a9aa8' },
  { x: -5, z: 4, width: 0.7, height: 0.1, depth: 0.7 },
  { x: 7, z: 2, width: 0.6, height: 0.13, depth: 0.8 },
  { x: -2, z: -6, width: 0.8, height: 0.1, depth: 0.6, color: '#9a9aa8' },
  { x: 3, z: -6, width: 0.7, height: 0.12, depth: 0.7 },
  { x: 10, z: 2, width: 0.6, height: 1.8, depth: 0.6 },
  { x: 7, z: 8, width: 0.5, height: 2.4, depth: 0.5, color: '#9a9aa8' },
  { x: 2, z: 11, width: 0.7, height: 3, depth: 0.7 },
  { x: -4, z: 10.5, width: 0.6, height: 2, depth: 0.6, color: '#c7c7cf' },
  { x: -9, z: 6, width: 0.8, height: 2.8, depth: 0.8 },
  { x: -11, z: -1, width: 0.5, height: 1.6, depth: 0.5, color: '#9a9aa8' },
  { x: -8, z: -7, width: 0.6, height: 3.2, depth: 0.6 },
  { x: -3, z: -11, width: 0.7, height: 2.2, depth: 0.7, color: '#c7c7cf' },
  { x: 3, z: -11, width: 0.5, height: 2.6, depth: 0.5 },
  { x: 9, z: -6, width: 0.6, height: 1.9, depth: 0.6, color: '#9a9aa8' },
  { x: 12, z: -2, width: 0.7, height: 3, depth: 0.7 },
  { x: -12, z: 3, width: 0.5, height: 2.1, depth: 0.5, color: '#c7c7cf' },
];

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
      <GroundClutter boxes={groundBoxes} />

      <Klipp>
        <VirtualCamera name="hard-look-at-demo" priority={10} initialState={{ position: cameraPosition }}>
          <Aim.HardLookAt target={activeTarget === 'A' ? targetARef : targetBRef} />
          <SpectatorFrustum />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
