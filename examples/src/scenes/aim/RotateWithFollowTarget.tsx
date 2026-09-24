import { Aim, Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, useState, type RefObject } from 'react';
import { Euler, Group } from 'three';
import { GroundClutter } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

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

    // spins independently of the orbit, like a Tilt-A-Whirl car
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
      <GroundClutter layout="standard" />

      <Klipp>
        <VirtualCamera name="ride-along" priority={10} active={followPosition}>
          <Body.Follow target={gondolaRef} offset={seatOffset} />
          <Aim.RotateWithFollowTarget target={gondolaRef} damping={damping} />
          {followPosition && <SpectatorFrustum />}
        </VirtualCamera>

        <VirtualCamera
          name="fixed-position"
          priority={10}
          active={!followPosition}
          initialState={{ position: cameraPosition }}>
          <Aim.RotateWithFollowTarget target={gondolaRef} damping={damping} />
          {!followPosition && <SpectatorFrustum />}
        </VirtualCamera>
      </Klipp>
    </>
  );
}
