import { Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { folder, useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import { Euler, Mesh, Quaternion } from 'three';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 14, 0];
const cameraQuaternion = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));

const wanderRangeX = 7;
const wanderRangeZ = 5;
const wanderSpeedX = 0.25;
const wanderSpeedZ = 0.35;
const unitHeight = 0.7;
const unitRadius = 0.5;
// unitHeight - unitRadius is the unit's own underside; clutter under its wander area stays well below
// that, so it's never visually buried under one
const groundBoxes: GroundBox[] = [
  { x: -5, z: -3, width: 0.8, height: 0.12, depth: 0.8 },
  { x: -2, z: -4, width: 1, height: 0.1, depth: 0.6 },
  { x: 1, z: -3.5, width: 0.7, height: 0.15, depth: 0.9 },
  { x: 4, z: -2, width: 0.9, height: 0.1, depth: 0.7, color: '#9a9aa8' },
  { x: 6, z: -4, width: 0.6, height: 0.13, depth: 0.6 },
  { x: -6, z: 1, width: 0.8, height: 0.1, depth: 1, color: '#9a9aa8' },
  { x: -3, z: 2, width: 1, height: 0.15, depth: 0.6 },
  { x: 3, z: 3, width: 0.7, height: 0.1, depth: 0.8 },
  { x: 5.5, z: 1, width: 0.9, height: 0.12, depth: 0.7, color: '#9a9aa8' },
  { x: -4, z: 4, width: 0.6, height: 0.1, depth: 0.9 },
  { x: 2, z: 4.5, width: 0.8, height: 0.15, depth: 0.6 },
  { x: 6.5, z: 3, width: 0.7, height: 0.1, depth: 0.7 },
  { x: -7, z: -1, width: 0.8, height: 0.1, depth: 0.7 },
  { x: 7, z: 1.5, width: 0.7, height: 0.13, depth: 0.8, color: '#9a9aa8' },
  { x: -1, z: -4.8, width: 0.9, height: 0.1, depth: 0.6 },
  { x: 0.5, z: 4.8, width: 0.8, height: 0.12, depth: 0.7, color: '#9a9aa8' },
  { x: -6.8, z: 4.5, width: 0.6, height: 0.15, depth: 0.8 },
  { x: 7, z: -4.5, width: 0.7, height: 0.1, depth: 0.6, color: '#9a9aa8' },
  // tall ones clear the unit's own reach with margin, without chasing the camera's own worst-case
  // deadZone/hardLimit lag all the way out - that edge case may occasionally bring one into frame
  { x: -11, z: 0, width: 0.7, height: 2.4, depth: 0.7, color: '#9a9aa8' },
  { x: 11, z: -3, width: 0.6, height: 3, depth: 0.6 },
  { x: -10, z: 6, width: 0.8, height: 1.8, depth: 0.8, color: '#c7c7cf' },
  { x: 10, z: 7, width: 0.6, height: 2.6, depth: 0.6 },
  { x: 0, z: -10, width: 0.9, height: 2, depth: 0.9, color: '#9a9aa8' },
  { x: -6, z: -10, width: 0.6, height: 2.8, depth: 0.6 },
  { x: 7, z: -9, width: 0.7, height: 1.6, depth: 0.7, color: '#c7c7cf' },
  { x: 0, z: 10, width: 0.6, height: 3, depth: 0.6 },
  { x: -11, z: -5, width: 0.5, height: 2.2, depth: 0.5, color: '#9a9aa8' },
  { x: 11, z: 4, width: 0.7, height: 1.9, depth: 0.7 },
  { x: -5, z: 10, width: 0.5, height: 2.5, depth: 0.5, color: '#c7c7cf' },
  { x: 6, z: -10, width: 0.6, height: 2.1, depth: 0.6 },
];

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

/** A unit wanders a ground plane while a straight-down, fixed-rotation camera holds it framed - `Body.
 *  PositionComposer` shifts sideways whenever it steps past `deadZone`, clamped at `hardLimit`. The unit's
 *  own height never changes, so the dolly stage never engages here; see the companion Dolly scene for that
 *  half. Turn `autoMove` off to drive the unit by hand and walk it through each zone's edge yourself. */
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
      <GroundClutter boxes={groundBoxes} />
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
