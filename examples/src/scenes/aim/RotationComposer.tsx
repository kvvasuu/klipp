import { Aim, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { folder, useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import type { Mesh } from 'three';
import { GroundClutter } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 5, 11];

const wanderRangeX = 7.5;
const wanderRangeY = 6;
const wanderSpeedX = 0.3;
const wanderSpeedY = 0.4;
const targetRadius = 0.5;

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
      <GroundClutter layout="wanderInFront" />
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
