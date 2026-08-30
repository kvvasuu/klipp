import { Canvas, useFrame } from '@react-three/fiber';
import { Aim, Body, Klipp, VirtualCamera } from '@kvvasuu/klipp';
import { useRef, useState, type RefObject } from 'react';
import type { Group } from 'three';

type AimId = 'hardLookAt' | 'rotateWithFollowTarget' | 'rotationComposer';

const aimButtons: { id: AimId; label: string }[] = [
  { id: 'hardLookAt', label: 'HardLookAt' },
  { id: 'rotateWithFollowTarget', label: 'RotateWithFollowTarget' },
  { id: 'rotationComposer', label: 'RotationComposer (dead zone)' },
];

function TravelingCharacter({ groupRef }: { groupRef: RefObject<Group | null> }) {
  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.elapsedTime;
    const angle = t * 0.5;
    group.position.set(Math.sin(angle) * 6, 2, Math.cos(angle) * 6);
    group.rotation.y = angle - Math.PI / 2; // face tangent to the circular path
    group.rotation.z = Math.sin(t * 1.5) * 0.3; // bank into the turn — gives RotateWithFollowTarget a roll to copy
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[0.8, 1.4, 0.8]} />
        <meshStandardMaterial color="steelblue" />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color="orange" />
      </mesh>
    </group>
  );
}

function Scene({ activeAim }: { activeAim: AimId }) {
  const groupRef = useRef<Group>(null);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 3]} intensity={1.2} />
      <gridHelper args={[24, 24, '#444', '#222']} position={[0, 0.01, 0]} />

      <TravelingCharacter groupRef={groupRef} />

      <Klipp>
        <VirtualCamera name="hardLookAt" active={activeAim === 'hardLookAt'} priority={10}>
          <Body.Follow target={groupRef} offset={[0, 2, 6]} damping={0.3} bindingMode="lockToTargetWithWorldUp" />
          <Aim.HardLookAt target={groupRef} />
        </VirtualCamera>
        <VirtualCamera name="rotateWithFollowTarget" active={activeAim === 'rotateWithFollowTarget'} priority={20}>
          <Body.Follow target={groupRef} offset={[0, 2, 6]} damping={0.3} bindingMode="lockToTargetWithWorldUp" />
          <Aim.RotateWithFollowTarget target={groupRef} damping={0.3} />
        </VirtualCamera>
        <VirtualCamera name="rotationComposer" active={activeAim === 'rotationComposer'} priority={30}>
          <Body.Follow target={groupRef} offset={[0, 2, 6]} damping={0.3} bindingMode="lockToTargetWithWorldUp" />
          <Aim.RotationComposer target={groupRef} deadZone={[0.3, 0.3]} damping={0.3} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}

/**
 * Body and Aim are independent, swappable pieces — position (`Body.Follow`) never changes here, only
 * rotation does, as the Aim behind it cycles between rigid look-at, rotation-mirroring, and a
 * dead-zone-based composer.
 */
export function BodyAimDecoupling() {
  const [activeAim, setActiveAim] = useState<AimId>('hardLookAt');

  return (
    <>
      <Canvas camera={{ position: [0, 5, 10], fov: 50 }}>
        <Scene activeAim={activeAim} />
      </Canvas>
      <div className="overlay">
        {aimButtons.map(({ id, label }) => (
          <button key={id} data-active={activeAim === id} onClick={() => setActiveAim(id)}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
