import { BindingModes, type BindingMode } from '@kvvasuu/klipp';
import { Aim, Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, useState, type RefObject } from 'react';
import { Group, Matrix4, Quaternion, Vector3 } from 'three';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const figureEightRadius = 6;
const flightHeight = 3;
const flightSpeed = 0.4;
const verticalAmplitude = 1.5;
// flightHeight - verticalAmplitude is the plane's lowest point; clutter under its figure-eight stays
// well below that, so a roll/pitch never brings it into visible contact
const groundBoxes: GroundBox[] = [
  { x: -4, z: 0, width: 1, height: 0.6, depth: 1 },
  { x: 0, z: 1.5, width: 1.4, height: 0.5, depth: 0.8, color: '#9a9aa8' },
  { x: 4, z: -1, width: 0.8, height: 0.8, depth: 0.8 },
  { x: -2, z: -2, width: 1.2, height: 0.4, depth: 1.2, color: '#9a9aa8' },
  { x: 2, z: 2, width: 1, height: 0.7, depth: 1 },
  { x: -9, z: 5, width: 1.5, height: 2.5, depth: 1.5, color: '#9a9aa8' },
  { x: 9, z: -4, width: 1.2, height: 3, depth: 1.2 },
  { x: -8, z: -6, width: 1.8, height: 2, depth: 1.8, color: '#c7c7cf' },
  { x: 8, z: 6, width: 1.4, height: 2.8, depth: 1.4 },
  { x: 0, z: -8, width: 2, height: 2.2, depth: 2, color: '#9a9aa8' },
  { x: -6, z: 8, width: 1.3, height: 1.8, depth: 1.3 },
  { x: 6, z: -8, width: 1.6, height: 2.4, depth: 1.6, color: '#c7c7cf' },
  { x: -11, z: 0, width: 0.6, height: 2.2, depth: 0.6, color: '#9a9aa8' },
  { x: 11, z: 2, width: 0.5, height: 2.8, depth: 0.5 },
  { x: -10, z: -8, width: 0.6, height: 1.6, depth: 0.6, color: '#c7c7cf' },
  { x: 10, z: 9, width: 0.5, height: 2.4, depth: 0.5 },
  { x: 0, z: -10, width: 0.6, height: 2, depth: 0.6, color: '#9a9aa8' },
];
const verticalFrequency = 0.9;
const bankGain = 0.45;
const maxBankAngle = 0.8;
const headingEpsilon = 0.05;

const worldUp = new Vector3(0, 1, 0);
const zAxis = new Vector3(0, 0, 1);

/** A figure-eight (lemniscate of Gerono) in the XZ plane, plus an independent vertical sine wave. */
function positionAt(t: number, out: Vector3): Vector3 {
  return out.set(
    Math.sin(t) * figureEightRadius,
    flightHeight + Math.sin(t * verticalFrequency) * verticalAmplitude,
    Math.sin(t) * Math.cos(t) * figureEightRadius,
  );
}

function Airplane({ groupRef }: { groupRef: RefObject<Group | null> }) {
  const [scratch] = useState(() => ({
    position: new Vector3(),
    ahead: new Vector3(),
    matrix: new Matrix4(),
    roll: new Quaternion(),
  }));

  useFrame(({ clock }) => {
    const plane = groupRef.current;
    if (!plane) return;
    const t = clock.elapsedTime * flightSpeed;

    positionAt(t, scratch.position);
    positionAt(t + headingEpsilon, scratch.ahead);
    plane.position.copy(scratch.position);

    // orient to face the direction of travel - Matrix4.lookAt (not Object3D.lookAt, which uses the
    // opposite eye/target convention for non-camera objects) so -Z matches the nose, as built below
    scratch.matrix.lookAt(scratch.position, scratch.ahead, worldUp);
    plane.quaternion.setFromRotationMatrix(scratch.matrix);

    // bank into turns: heading change per unit t between two forward samples, clamped since the
    // figure-eight's curvature isn't uniform and spikes hard near its crossing point
    const heading0 = Math.atan2(scratch.ahead.x - scratch.position.x, scratch.ahead.z - scratch.position.z);
    positionAt(t + headingEpsilon * 2, scratch.ahead);
    const heading1 = Math.atan2(scratch.ahead.x - scratch.position.x, scratch.ahead.z - scratch.position.z);
    const turnRate = Math.atan2(Math.sin(heading1 - heading0), Math.cos(heading1 - heading0)) / headingEpsilon;
    const rollAngle = Math.max(-maxBankAngle, Math.min(maxBankAngle, turnRate * bankGain));

    scratch.roll.setFromAxisAngle(zAxis, rollAngle);
    plane.quaternion.multiply(scratch.roll);
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[0.4, 0.4, 1.8]} />
        <meshStandardMaterial color="#e3e3e3" />
      </mesh>
      <mesh>
        <boxGeometry args={[2.2, 0.08, 0.5]} />
        <meshStandardMaterial color="#21a9e0" />
      </mesh>
      <mesh position={[0, 0.25, 0.7]}>
        <boxGeometry args={[0.08, 0.5, 0.42]} />
        <meshStandardMaterial color="#ff6b4a" />
      </mesh>
    </group>
  );
}

/** The plane flies a figure-eight with an independent vertical bob, always oriented to face its actual
 *  direction of travel plus a bank into turns. `Body` never touches rotation - `Aim.HardLookAt` pans/tilts
 *  the camera every frame to keep the plane centered, never rolling with it regardless of `bindingMode`.
 *  What `bindingMode` changes is only where the camera SITS: `worldSpace` never rotates the offset,
 *  `lockToTarget` swings it with the plane's full roll+pitch+yaw, `lockToTargetWithWorldUp`/
 *  `lockToTargetNoRoll` filter out roll (and pitch, for the former), `lockToTargetOnAssign` freezes
 *  whatever was captured at mount - watch the spectator inset, not the main view, for the difference. */
export function Follow() {
  const planeRef = useRef<Group>(null);

  const { offset, damping, bindingMode } = useControls('Follow', {
    offset: { x: 0, y: 0.5, z: 5 },
    damping: { value: 0, min: 0, max: 2, step: 0.05 },
    bindingMode: { value: BindingModes.lockToTarget as BindingMode, options: Object.values(BindingModes) },
  });

  return (
    <>
      <GroundClutter boxes={groundBoxes} />
      <Airplane groupRef={planeRef} />

      <Klipp>
        <VirtualCamera name="follow-demo" priority={10}>
          <Body.Follow
            target={planeRef}
            offset={[offset.x, offset.y, offset.z]}
            damping={damping}
            bindingMode={bindingMode}
          />
          <Aim.HardLookAt target={planeRef} />
          <SpectatorFrustum />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
