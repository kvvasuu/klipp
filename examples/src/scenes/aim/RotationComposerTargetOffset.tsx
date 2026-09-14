import { Aim, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, type RefObject } from 'react';
import { Vector3, type Group } from 'three';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const cameraPosition: [number, number, number] = [0, 2, 10];
const bodyHeight = 2;
const wanderRangeX = 3;
const wanderRangeZ = 2;
const wanderSpeedX = 0.25;
const wanderSpeedZ = 0.18;
const tumbleSpeedX = 0.4;
const tumbleSpeedZ = 0.25;

const groundBoxes: GroundBox[] = [
  { x: -10, z: -3, width: 1.4, height: 2.6, depth: 1.4, color: '#9a9aa8' },
  { x: 10, z: -4, width: 1.2, height: 3.2, depth: 1.2 },
  { x: -9, z: -8, width: 1.6, height: 2, depth: 1.6, color: '#c7c7cf' },
  { x: 9, z: -9, width: 1.3, height: 2.8, depth: 1.3 },
  { x: -11, z: -6, width: 0.7, height: 3.4, depth: 0.7, color: '#9a9aa8' },
  { x: 11, z: -6, width: 0.6, height: 2.4, depth: 0.6 },
  { x: 0, z: -11, width: 1.8, height: 2.2, depth: 1.8, color: '#c7c7cf' },
];

const arrowOrigin = new Vector3(0, 0, 0);

/** `ArrowHelper` (three.js's own unlit, always-on-top debug primitive) from the box's own origin out to
 *  `offset` - reads as an annotation, not a prop in the scene, the way a solid mesh at the same spot would. */
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

/** A box wanders side to side and in/out while tumbling continuously on two axes - the yellow arrow marks
 *  `targetOffset`, tracking both the box's position and its rotation instead of staying fixed in world
 *  space. With `deadZone`/`damping` both at their hard default, the arrow's tip sits pinned to the center
 *  crosshair through all of it - a world-space offset couldn't do that, since the box moves and rotates
 *  out from under a fixed point. */
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
      <GroundClutter boxes={groundBoxes} />
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
