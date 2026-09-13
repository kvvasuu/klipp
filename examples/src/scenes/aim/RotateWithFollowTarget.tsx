import { Aim, Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, useState, type RefObject } from 'react';
import { Euler, Group } from 'three';
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

const orbitRadius = 5;
const orbitHeight = 2;
const orbitSpeed = 0.25;
const spinSpeed = 0.5;
const spinWobbleAmount = 0.8;
const spinWobbleFreq = 0.5;
const tiltAmplitude = 0.35;
const tiltFreq = 0.8;
const cameraPosition: [number, number, number] = [0, orbitHeight, 0];
const seatOffset: [number, number, number] = [0, 1, 1];

const landmarkRadius = 13;
const landmarkColors = ['#21a9e0', '#ff6b4a', '#7ed957', '#c77dff', '#ffd23f', '#ff5d8f'];
const landmarks = landmarkColors.map((color, i) => {
  const angle = (i / landmarkColors.length) * Math.PI * 2;
  return { color, position: [Math.cos(angle) * landmarkRadius, 2, Math.sin(angle) * landmarkRadius] as const };
});

function Landmarks() {
  return (
    <>
      {landmarks.map(({ color, position }) => (
        <mesh key={color} position={position}>
          <cylinderGeometry args={[0.3, 0.3, 4, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
        </mesh>
      ))}
    </>
  );
}

function Gondola({ groupRef }: { groupRef: RefObject<Group | null> }) {
  const [scratch] = useState(() => new Euler(0, 0, 0, 'YXZ'));

  useFrame(({ clock }) => {
    const gondola = groupRef.current;
    if (!gondola) return;
    const t = clock.elapsedTime;

    const orbitAngle = t * orbitSpeed;
    gondola.position.set(Math.cos(orbitAngle) * orbitRadius, orbitHeight, Math.sin(orbitAngle) * orbitRadius);

    // spin runs at its own rate plus a wobble, independent of the orbit above - like a Tilt-A-Whirl car
    // spinning free of the platform carrying it
    const spinAngle = t * spinSpeed + Math.sin(t * spinWobbleFreq) * spinWobbleAmount;
    const tiltAngle = Math.sin(t * tiltFreq) * tiltAmplitude;
    scratch.set(tiltAngle, spinAngle, 0);
    gondola.quaternion.setFromEuler(scratch);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[1.2, 0.8, 1.2]} />
        <meshStandardMaterial color="#e3e3e3" />
      </mesh>
      <mesh position={[0, 0.1, -0.65]}>
        <boxGeometry args={[1.1, 0.9, 0.15]} />
        <meshStandardMaterial color="#ff6b4a" />
      </mesh>
    </group>
  );
}

/** `Aim.RotateWithFollowTarget` copies the gondola's rotation onto the camera 1:1, `damping` seconds
 *  behind - that's ALL it ever does, position included or not. `followPosition` toggles `Body.Follow` on
 *  and off to show that split directly: on, the camera rides along at `seatOffset` and the gondola stays
 *  centered in view; off, `Body.Follow` unmounts and the camera is simply left at wherever it last was,
 *  still spinning/tilting in place - same rotation, same Aim, no position tracking behind it anymore. */
export function RotateWithFollowTarget() {
  const gondolaRef = useRef<Group>(null);

  const { damping, followPosition } = useControls('RotateWithFollowTarget', {
    damping: { value: 0, min: 0, max: 3, step: 0.05 },
    followPosition: true,
  });

  return (
    <>
      <Landmarks />
      <Gondola groupRef={gondolaRef} />
      <GroundClutter boxes={groundBoxes} />

      <Klipp>
        <VirtualCamera name="rotate-with-follow-target-demo" priority={10} initialState={{ position: cameraPosition }}>
          {followPosition && <Body.Follow target={gondolaRef} offset={seatOffset} />}
          <Aim.RotateWithFollowTarget target={gondolaRef} damping={damping} />
          <SpectatorFrustum />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
