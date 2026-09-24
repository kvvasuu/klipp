import type { GroupFramingFitMode, GroupFramingMode } from '@kvvasuu/klipp';
import { Aim, Body, Extension, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { createRef, useRef, useState, type RefObject } from 'react';
import { Group, Mesh } from 'three';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const memberRadius = 1;

const memberOrbits = [
  { radius: 4, speed: 0.3, phase: 0, height: 0, color: '#21a9e0' },
  { radius: 9, speed: 0.45, phase: 1.3, height: 1.2, color: '#ff6b4a' },
  { radius: 6.5, speed: -0.35, phase: 2.6, height: -0.8, color: '#7ed957' },
  { radius: 18, speed: 0.22, phase: 4.2, height: 0.6, color: '#ffd23f' },
] as const;

type Member = { target: RefObject<Mesh | null>; radius: number };

function OrbitingGroup({ members, anchorRef }: { members: Member[]; anchorRef: RefObject<Group | null> }) {
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let resolved = 0;

    memberOrbits.forEach((orbit, i) => {
      const mesh = members[i].target.current;
      if (!mesh) return;
      const angle = t * orbit.speed + orbit.phase;
      mesh.position.set(Math.cos(angle) * orbit.radius, orbit.height, Math.sin(angle) * orbit.radius);
      sumX += mesh.position.x;
      sumY += mesh.position.y;
      sumZ += mesh.position.z;
      resolved++;
    });

    // plain mean, matching `positionMode: 'groupAverage'`, so Aim looks at the point GroupFraming frames
    const anchor = anchorRef.current;
    if (anchor && resolved > 0) anchor.position.set(sumX / resolved, sumY / resolved, sumZ / resolved);
  });

  return (
    <>
      {memberOrbits.map((orbit, i) => (
        <mesh key={orbit.color} ref={members[i].target}>
          <sphereGeometry args={[memberRadius, 16, 16]} />
          <meshStandardMaterial color={orbit.color} emissive={orbit.color} emissiveIntensity={0.4} />
        </mesh>
      ))}
      <group ref={anchorRef} />
    </>
  );
}

export function GroupFraming() {
  const [members] = useState<Member[]>(() =>
    memberOrbits.map(() => ({ target: createRef<Mesh>(), radius: memberRadius })),
  );
  const anchorRef = useRef<Group>(null);

  const { padding, damping, screenPositionX, screenPositionY, fitMode, minDistance, maxDistance, framingMode, debug } =
    useControls('GroupFraming', {
      padding: { value: 1, min: 0, max: 10, step: 0.1 },
      damping: { value: 0, min: 0, max: 3, step: 0.05 },
      screenPositionX: { value: 0, min: -1, max: 1, step: 0.05 },
      screenPositionY: { value: 0, min: -1, max: 1, step: 0.05 },
      fitMode: { value: 'rigid' as GroupFramingFitMode, options: ['ceiling', 'rigid'] as GroupFramingFitMode[] },
      minDistance: { value: 0, min: 0, max: 50, step: 0.5 },
      maxDistance: { value: 200, min: 10, max: 200, step: 0.5 },
      framingMode: {
        value: 'horizontalAndVertical' as GroupFramingMode,
        options: ['horizontal', 'vertical', 'horizontalAndVertical'] as GroupFramingMode[],
      },
      debug: true,
    });

  return (
    <>
      <OrbitingGroup members={members} anchorRef={anchorRef} />

      <Klipp>
        <VirtualCamera name="group-framing-demo" priority={10}>
          <Body.HardLockToTarget target={[0, 8, 16]} />
          <Aim.HardLookAt target={anchorRef} />
          <Extension.GroupFraming
            members={members}
            positionMode="groupAverage"
            padding={padding}
            damping={damping}
            screenPosition={[screenPositionX, screenPositionY]}
            fitMode={fitMode}
            minDistance={minDistance}
            maxDistance={maxDistance}
            framingMode={framingMode}
            debug={debug}
          />
          <SpectatorFrustum maxDistance={40} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
