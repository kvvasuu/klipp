import { Aim, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import { Vector3, type Group } from 'three';
import { GroundClutter } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 2, 10];
const bodyHeight = 2;
const wanderRangeX = 3;
const wanderRangeZ = 2;
const wanderSpeedX = 0.25;
const wanderSpeedZ = 0.18;
const tumbleSpeedX = 0.4;
const tumbleSpeedZ = 0.25;

const arrowOrigin = new Vector3(0, 0, 0);

function OffsetMarker({ offset }: { offset: [number, number, number] }) {
  const offsetVector = new Vector3(...offset);
  const length = offsetVector.length();
  if (length < 1e-3) return null;

  return <arrowHelper args={[offsetVector.clone().normalize(), arrowOrigin, length, '#ffd23f']} />;
}

function TumblingBody({ groupRef, offset }: { groupRef: RefObject<Group | null>; offset: [number, number, number] }) {
  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.elapsedTime;
    group.position.set(
      Math.sin(t * wanderSpeedX) * wanderRangeX,
      bodyHeight,
      Math.sin(t * wanderSpeedZ + 0.9) * wanderRangeZ,
    );
    group.rotation.set(t * tumbleSpeedX, 0, t * tumbleSpeedZ);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[1.2, 1.2, 1]} />
        <meshStandardMaterial color="#21a9e0" />
      </mesh>
      <OffsetMarker offset={offset} />
    </group>
  );
}

export function RotationComposerTargetOffset() {
  const groupRef = useRef<Group>(null);

  const { offsetX, offsetY, offsetZ, damping, debug } = useControls('RotationComposer: Target Offset', {
    offsetX: { value: 1, min: -1, max: 2, step: 0.05 },
    offsetY: { value: 1, min: -1, max: 2, step: 0.05 },
    offsetZ: { value: 1, min: -1, max: 2, step: 0.05 },
    damping: { value: 0, min: 0, max: 2, step: 0.05 },
    debug: true,
  });

  const offset: [number, number, number] = [offsetX, offsetY, offsetZ];

  return (
    <>
      <GroundClutter layout="wanderInFront" />
      <TumblingBody groupRef={groupRef} offset={offset} />

      <Klipp>
        <VirtualCamera
          name="rotation-composer-target-offset-demo"
          priority={10}
          initialState={{ position: cameraPosition }}>
          <Aim.RotationComposer target={groupRef} targetOffset={offset} damping={damping} debug={debug} />
          <SpectatorFrustum />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
