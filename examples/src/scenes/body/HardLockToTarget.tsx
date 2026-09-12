import { Aim, Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import { Euler, Mesh, Quaternion } from 'three';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const initialQuaternion = new Quaternion().setFromEuler(new Euler(0, 0, 0));

const orbitRadius = 5;
const orbitHeight = 2.5;
const orbitSpeed = 0.6;
// shifts the whole orbit toward the camera's fixed forward direction - the further the orbit sits from
// the subject relative to its own radius, the less its look direction has to swing to keep the subject
// in frame around the full loop (never perfectly, since the camera itself never rotates)
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

/** Main view is this camera's own POV (drives the real camera directly); the spectator inset (see
 *  `BaseScene`) shows the anchor orbiting and the frustum lagging behind it - entirely HardLockToTarget's
 *  own `damping`. `lookAtSubject` is off by default: Aim is a fully separate, optional piece - toggling
 *  it on/off never changes Body's position behavior. Since there's no Aim by default, `initialState`
 *  points the camera at the subject once, from the orbit's starting position - it then stays fixed there
 *  for the rest of the orbit. */
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
