import { useFrame } from '@react-three/fiber';
import { useState, type RefObject } from 'react';
import { Group, Matrix4, Quaternion, Vector3 } from 'three';

const figureEightRadius = 6;
const flightHeight = 3;
const flightSpeed = 0.4;
const verticalAmplitude = 1.5;
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

/** Flies a figure-eight with a vertical bob, facing its direction of travel and banking into turns. */
export function Airplane({ ref }: { ref: RefObject<Group | null> }) {
  const [scratch] = useState(() => ({
    position: new Vector3(),
    ahead: new Vector3(),
    matrix: new Matrix4(),
    roll: new Quaternion(),
  }));

  useFrame(({ clock }) => {
    const plane = ref.current;
    if (!plane) return;
    const t = clock.elapsedTime * flightSpeed;

    positionAt(t, scratch.position);
    positionAt(t + headingEpsilon, scratch.ahead);
    plane.position.copy(scratch.position);

    // Matrix4.lookAt, not Object3D.lookAt, which flips eye/target for non-camera objects
    scratch.matrix.lookAt(scratch.position, scratch.ahead, worldUp);
    plane.quaternion.setFromRotationMatrix(scratch.matrix);

    // clamped, since the figure-eight's curvature spikes near its crossing point
    const heading0 = Math.atan2(scratch.ahead.x - scratch.position.x, scratch.ahead.z - scratch.position.z);
    positionAt(t + headingEpsilon * 2, scratch.ahead);
    const heading1 = Math.atan2(scratch.ahead.x - scratch.position.x, scratch.ahead.z - scratch.position.z);
    const turnRate = Math.atan2(Math.sin(heading1 - heading0), Math.cos(heading1 - heading0)) / headingEpsilon;
    const rollAngle = Math.max(-maxBankAngle, Math.min(maxBankAngle, turnRate * bankGain));

    scratch.roll.setFromAxisAngle(zAxis, rollAngle);
    plane.quaternion.multiply(scratch.roll);
  });

  return (
    <group ref={ref}>
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
