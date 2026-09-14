import { Aim, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { folder, useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import type { Mesh } from 'three';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 5, 11];

const wanderRangeX = 7.5;
const wanderRangeY = 6;
const wanderSpeedX = 0.3;
const wanderSpeedY = 0.4;
const targetRadius = 0.5;

const groundBoxes: GroundBox[] = [
  { x: -10, z: -3, width: 1.4, height: 2.6, depth: 1.4, color: '#9a9aa8' },
  { x: 10, z: -4, width: 1.2, height: 3.2, depth: 1.2 },
  { x: -9, z: -8, width: 1.6, height: 2, depth: 1.6, color: '#c7c7cf' },
  { x: 9, z: -9, width: 1.3, height: 2.8, depth: 1.3 },
  { x: -11, z: -6, width: 0.7, height: 3.4, depth: 0.7, color: '#9a9aa8' },
  { x: 11, z: -6, width: 0.6, height: 2.4, depth: 0.6 },
  { x: 0, z: -11, width: 1.8, height: 2.2, depth: 1.8, color: '#c7c7cf' },
];

function Target({
  meshRef,
  autoMove,
  manualX,
  manualY,
}: {
  meshRef: RefObject<Mesh | null>;
  autoMove: boolean;
  manualX: number;
  manualY: number;
}) {
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (autoMove) {
      const t = clock.elapsedTime;
      mesh.position.set(
        Math.sin(t * wanderSpeedX) * wanderRangeX,
        2 + Math.sin(t * wanderSpeedY + 1.3) * wanderRangeY,
        0,
      );
    } else {
      mesh.position.set(manualX, 2 + manualY, 0);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[targetRadius, 16, 16]} />
      <meshStandardMaterial color="#21a9e0" emissive="#21a9e0" emissiveIntensity={0.4} />
    </mesh>
  );
}

/** The camera never moves (no Body at all) while a target wanders in front of it - `Aim.RotationComposer`
 *  only rotates once the target steps past `deadZone`, clamped at `hardLimit`, instead of re-centering it
 *  every frame like `HardLookAt`. Turn `autoMove` off to drive the target by hand and walk it through each
 *  zone's edge yourself. */
export function RotationComposer() {
  const targetRef = useRef<Mesh>(null);

  const {
    autoMove,
    manualX,
    manualY,
    screenPositionX,
    screenPositionY,
    deadZoneX,
    deadZoneY,
    hardLimitX,
    hardLimitY,
    damping,
    debug,
  } = useControls('RotationComposer', {
    Motion: folder({
      autoMove: true,
      manualX: { value: 0, min: -wanderRangeX, max: wanderRangeX, step: 0.1 },
      manualY: { value: 0, min: -wanderRangeY, max: wanderRangeY, step: 0.1 },
    }),
    screenPositionX: { value: 0, min: -1, max: 1, step: 0.05 },
    screenPositionY: { value: 0, min: -1, max: 1, step: 0.05 },
    deadZoneX: { value: 0.3, min: 0, max: 1, step: 0.05 },
    deadZoneY: { value: 0.3, min: 0, max: 1, step: 0.05 },
    hardLimitX: { value: 0.5, min: 0, max: 1, step: 0.05 },
    hardLimitY: { value: 0.5, min: 0, max: 1, step: 0.05 },
    damping: { value: 1, min: 0, max: 3, step: 0.05 },
    debug: true,
  });

  return (
    <>
      <GroundClutter boxes={groundBoxes} />
      <Target meshRef={targetRef} autoMove={autoMove} manualX={manualX} manualY={manualY} />

      <Klipp>
        <VirtualCamera name="rotation-composer-demo" priority={10} initialState={{ position: cameraPosition }}>
          <Aim.RotationComposer
            target={targetRef}
            radius={targetRadius}
            screenPosition={[screenPositionX, screenPositionY]}
            deadZone={[deadZoneX, deadZoneY]}
            hardLimit={[hardLimitX, hardLimitY]}
            damping={damping}
            debug={debug}
          />
          <SpectatorFrustum />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
