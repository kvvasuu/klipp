import { Aim, Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import { Euler, Mesh, Quaternion } from 'three';
import { GroundClutter } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const initialQuaternion = new Quaternion().setFromEuler(new Euler(0, 0, 0));

const orbitRadius = 5;
const orbitHeight = 2.5;
const orbitSpeed = 0.6;
// pushes the orbit ahead of the camera, so the subject stays roughly in frame without an Aim
const orbitForwardOffset = 12;

function OrbitAnchor({ meshRef }: { meshRef: RefObject<Mesh | null> }) {
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.elapsedTime * orbitSpeed;
    mesh.position.set(Math.cos(t) * orbitRadius, orbitHeight, Math.sin(t) * orbitRadius + orbitForwardOffset);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.2, 16, 16]} />
      <meshStandardMaterial color="#21a9e0" emissive="#21a9e0" emissiveIntensity={0.6} />
    </mesh>
  );
}

export function HardLockToTarget() {
  const anchorRef = useRef<Mesh>(null);
  const subjectRef = useRef<Mesh>(null);

  const { damping, lookAtSubject } = useControls('HardLockToTarget', {
    damping: { value: 0, min: 0, max: 3, step: 0.05 },
    lookAtSubject: false,
  });

  return (
    <>
      <mesh ref={subjectRef} position={[0, orbitHeight, 0]}>
        <icosahedronGeometry args={[0.8, 0]} />
        <meshStandardMaterial color="#ff6b4a" />
      </mesh>
      <OrbitAnchor meshRef={anchorRef} />
      <GroundClutter layout="standard" />

      <Klipp>
        <VirtualCamera name="hard-lock-to-target-demo" priority={10} initialState={{ quaternion: initialQuaternion }}>
          <Body.HardLockToTarget target={anchorRef} damping={damping} />
          {lookAtSubject && <Aim.HardLookAt target={subjectRef} />}
          <SpectatorFrustum />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
