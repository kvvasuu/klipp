import type { GroupFramingFitMode } from '@kvvasuu/klipp';
import { Aim, Body, Extension, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import { Group, Mesh } from 'three';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraOffset: [number, number, number] = [0, 8, 16];
const memberRadius = 1;

const memberOrbits = [
  { radius: 2, speed: 0.3, phase: 0, height: 0, color: '#21a9e0' },
  { radius: 5, speed: 0.45, phase: 1.3, height: 1.2, color: '#ff6b4a' },
  { radius: 3.5, speed: -0.35, phase: 2.6, height: -0.8, color: '#7ed957' },
  { radius: 10, speed: 0.22, phase: 4.2, height: 0.6, color: '#ffd23f' },
] as const;

function OrbitingGroup({
  memberRefs,
  anchorRef,
}: {
  memberRefs: RefObject<Mesh | null>[];
  anchorRef: RefObject<Group | null>;
}) {
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let resolved = 0;

    memberOrbits.forEach((orbit, i) => {
      const mesh = memberRefs[i].current;
      if (!mesh) return;
      const angle = t * orbit.speed + orbit.phase;
      mesh.position.set(Math.cos(angle) * orbit.radius, orbit.height, Math.sin(angle) * orbit.radius);
      sumX += mesh.position.x;
      sumY += mesh.position.y;
      sumZ += mesh.position.z;
      resolved++;
    });

    // matches `positionMode: 'groupAverage'` below - the plain mean of member positions - so Aim looks
    // at exactly the point GroupFraming measures distance from
    const anchor = anchorRef.current;
    if (anchor && resolved > 0) anchor.position.set(sumX / resolved, sumY / resolved, sumZ / resolved);
  });

  return (
    <>
      {memberOrbits.map((orbit, i) => (
        <mesh key={orbit.color} ref={memberRefs[i]}>
          <sphereGeometry args={[memberRadius, 16, 16]} />
          <meshStandardMaterial color={orbit.color} emissive={orbit.color} emissiveIntensity={0.4} />
        </mesh>
      ))}
      <group ref={anchorRef} />
    </>
  );
}

/** Four spheres orbit independently, sometimes clustering and sometimes spreading wide. `Body.Follow` +
 *  `Aim.HardLookAt` give the camera a fixed establishing shot on the group's average position;
 *  `Extension.GroupFraming` then dollies along that same view axis to keep every sphere (plus `padding`)
 *  in frame - `fitMode` decides whether it can also dolly closer as the group shrinks. */
export function GroupFraming() {
  const memberRefs = [
    useRef<Mesh>(null),
    useRef<Mesh>(null),
    useRef<Mesh>(null),
    useRef<Mesh>(null),
  ] satisfies RefObject<Mesh | null>[];
  const anchorRef = useRef<Group>(null);

  const { padding, damping, screenPositionX, screenPositionY, fitMode, debug } = useControls('GroupFraming', {
    padding: { value: 1, min: 0, max: 10, step: 0.1 },
    damping: { value: 0.5, min: 0, max: 3, step: 0.05 },
    screenPositionX: { value: 0, min: -1, max: 1, step: 0.05 },
    screenPositionY: { value: 0, min: -1, max: 1, step: 0.05 },
    fitMode: { value: 'ceiling' as GroupFramingFitMode, options: ['ceiling', 'rigid'] as GroupFramingFitMode[] },
    debug: true,
  });

  return (
    <>
      <OrbitingGroup memberRefs={memberRefs} anchorRef={anchorRef} />

      <Klipp>
        <VirtualCamera name="group-framing-demo" priority={10}>
          <Body.HardLockToTarget target={[0, 8, 16]} />
          <Aim.HardLookAt target={anchorRef} />
          <Extension.GroupFraming
            members={memberRefs.map((target) => ({ target: target, radius: memberRadius }))}
            positionMode="groupAverage"
            padding={padding}
            damping={damping}
            screenPosition={[screenPositionX, screenPositionY]}
            fitMode={fitMode}
            debug={debug}
          />
          <SpectatorFrustum maxDistance={22} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
