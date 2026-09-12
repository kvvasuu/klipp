import { BindingModes, type BindingMode } from '@kvvasuu/klipp';
import { Aim, Body, Klipp, VirtualCamera } from '@kvvasuu/klipp/react';
import { useFrame } from '@react-three/fiber';
import { useControls } from 'leva';
import { useRef, useState, type RefObject } from 'react';
import { Group, Matrix4, Quaternion, Vector3 } from 'three';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const figureEightRadius = 6;
const flightHeight = 3;
const flightSpeed = 0.4;
const verticalAmplitude = 1.5;
const verticalFrequency = 0.9;
const bankGain = 0.2;
const maxBankAngle = 0.6;
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
 *  direction of travel plus a bank into turns. `Body` never touches rotation - the camera's own view
 *  stays level regardless of `bindingMode` (that's `Aim.HardLookAt`'s doing). What `bindingMode` changes
 *  is only where the camera SITS: `worldSpace` never rotates the offset, `lockToTarget` swings it with
 *  the plane's full roll+pitch+yaw, `lockToTargetWithWorldUp`/`lockToTargetNoRoll` filter out roll (and
 *  pitch, for the former), and `lockToTargetOnAssign` freezes whatever direction was captured at mount -
 *  watch the spectator inset, not the main view, to see the difference. */
export function Follow() {
  const planeRef = useRef<Group>(null);

  const { offset, damping, bindingMode } = useControls('Follow', {
    offset: { x: 0, y: 0, z: 5 },
    damping: { value: 0.1, min: 0, max: 2, step: 0.05 },
    bindingMode: { value: BindingModes.lockToTarget as BindingMode, options: Object.values(BindingModes) },
  });

  return (
    <>
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
