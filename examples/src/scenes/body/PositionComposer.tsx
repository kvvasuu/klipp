import { Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { folder, useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import { Euler, Mesh, Quaternion } from 'three';
import { GroundClutter } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 14, 0];
const cameraQuaternion = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));

const wanderRangeX = 7;
const wanderRangeZ = 5;
const wanderSpeedX = 0.25;
const wanderSpeedZ = 0.35;
const unitHeight = 0.7;
const unitRadius = 0.5;
function Unit({
  meshRef,
  autoMove,
  manualX,
  manualZ,
}: {
  meshRef: RefObject<Mesh | null>;
  autoMove: boolean;
  manualX: number;
  manualZ: number;
}) {
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (autoMove) {
      const t = clock.elapsedTime;
      mesh.position.set(
        Math.sin(t * wanderSpeedX) * wanderRangeX,
        unitHeight,
        Math.sin(t * wanderSpeedZ + 1.3) * wanderRangeZ,
      );
    } else {
      mesh.position.set(manualX, unitHeight, manualZ);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[unitRadius, 16, 16]} />
      <meshStandardMaterial color="#21a9e0" emissive="#21a9e0" emissiveIntensity={0.4} />
    </mesh>
  );
}

export function PositionComposer() {
  const unitRef = useRef<Mesh>(null);

  const {
    autoMove,
    manualX,
    manualZ,
    cameraDistance,
    screenPositionX,
    screenPositionY,
    deadZoneX,
    deadZoneY,
    hardLimitX,
    hardLimitY,
    damping,
    debug,
  } = useControls('PositionComposer', {
    Motion: folder({
      autoMove: true,
      manualX: { value: 0, min: -wanderRangeX, max: wanderRangeX, step: 0.1 },
      manualZ: { value: 0, min: -wanderRangeZ, max: wanderRangeZ, step: 0.1 },
    }),
    cameraDistance: { value: 14, min: 8, max: 20, step: 0.5 },
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
      <GroundClutter layout="topDown" />
      <Unit meshRef={unitRef} autoMove={autoMove} manualX={manualX} manualZ={manualZ} />

      <Klipp>
        <VirtualCamera
          name="position-composer-demo"
          priority={10}
          initialState={{ position: cameraPosition, quaternion: cameraQuaternion }}>
          <Body.PositionComposer
            target={unitRef}
            radius={unitRadius}
            cameraDistance={cameraDistance}
            screenPosition={[screenPositionX, screenPositionY]}
            deadZone={[deadZoneX, deadZoneY]}
            hardLimit={[hardLimitX, hardLimitY]}
            damping={damping}
            debug={debug}
          />
          <SpectatorFrustum maxDistance={cameraDistance + 6} />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
