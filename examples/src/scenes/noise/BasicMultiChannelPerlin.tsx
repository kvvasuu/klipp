import { Klipp, Noise, VirtualCamera } from '@kvvasuu/klipp/react';
import { CameraControls } from '@kvvasuu/klipp/react/camera-controls';
import { folder, useControls } from 'leva';
import { GroundClutter, type GroundBox } from '../../scene/GroundClutter';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const subjectPosition: [number, number, number] = [0, 2, 0];

const groundBoxes: GroundBox[] = [
  { x: 2, z: 2, width: 0.7, height: 0.12, depth: 0.7 },
  { x: -3, z: 4, width: 0.6, height: 0.15, depth: 0.8 },
  { x: 5, z: -3, width: 0.8, height: 0.1, depth: 0.6, color: '#9a9aa8' },
  { x: -6, z: -2, width: 0.7, height: 0.12, depth: 0.7 },
  { x: 0, z: -6, width: 0.6, height: 0.1, depth: 0.9 },
  { x: 4, z: 5, width: 0.8, height: 0.15, depth: 0.6, color: '#9a9aa8' },
  { x: -5, z: 4, width: 0.7, height: 0.1, depth: 0.7 },
  { x: 7, z: 2, width: 0.6, height: 0.13, depth: 0.8 },
  { x: -2, z: -6, width: 0.8, height: 0.1, depth: 0.6, color: '#9a9aa8' },
  { x: 3, z: -6, width: 0.7, height: 0.12, depth: 0.7 },
  { x: 10, z: 2, width: 0.6, height: 1.8, depth: 0.6 },
  { x: 7, z: 8, width: 0.5, height: 2.4, depth: 0.5, color: '#9a9aa8' },
  { x: 2, z: 11, width: 0.7, height: 3, depth: 0.7 },
  { x: -4, z: 10.5, width: 0.6, height: 2, depth: 0.6, color: '#c7c7cf' },
  { x: -9, z: 6, width: 0.8, height: 2.8, depth: 0.8 },
  { x: -11, z: -1, width: 0.5, height: 1.6, depth: 0.5, color: '#9a9aa8' },
  { x: -8, z: -7, width: 0.6, height: 3.2, depth: 0.6 },
  { x: -3, z: -11, width: 0.7, height: 2.2, depth: 0.7, color: '#c7c7cf' },
  { x: 3, z: -11, width: 0.5, height: 2.6, depth: 0.5 },
  { x: 9, z: -6, width: 0.6, height: 1.9, depth: 0.6, color: '#9a9aa8' },
  { x: 12, z: -2, width: 0.7, height: 3, depth: 0.7 },
  { x: -12, z: 3, width: 0.5, height: 2.1, depth: 0.5, color: '#c7c7cf' },
];

/** `CameraControls` drives the camera's base position/rotation (drag to orbit, scroll to dolly around the
 *  subject), and `Noise.BasicMultiChannelPerlin` shakes on top of whatever that base state is. Every
 *  noise parameter is live in the panel. */
export function BasicMultiChannelPerlin() {
  const {
    positionAmplitude,
    positionFrequency,
    rotationAmplitude,
    rotationFrequency,
    amplitudeGain,
    frequencyGain,
    amplitudeDamping,
  } = useControls('BasicMultiChannelPerlin', {
    Position: folder({
      positionAmplitude: { x: 0.15, y: 0.15, z: 0.05 },
      positionFrequency: { x: 1.5, y: 1.7, z: 1.1 },
    }),
    Rotation: folder({
      rotationAmplitude: { x: 1.5, y: 1.5, z: 1.5 },
      rotationFrequency: { x: 1, y: 1, z: 1 },
    }),
    Global: folder({
      amplitudeGain: { value: 1, min: 0, max: 3, step: 0.05 },
      frequencyGain: { value: 1, min: 0, max: 3, step: 0.05 },
      amplitudeDamping: { value: 0, min: 0, max: 2, step: 0.05 },
    }),
  });

  return (
    <>
      <mesh position={subjectPosition}>
        <icosahedronGeometry args={[0.8, 0]} />
        <meshStandardMaterial color="#ff6b4a" />
      </mesh>

      <GroundClutter boxes={groundBoxes} />

      <Klipp>
        <VirtualCamera name="basic-multi-channel-perlin-demo" priority={10}>
          <CameraControls target={subjectPosition} initialPosition={[0, 3, 8]} />
          <Noise.BasicMultiChannelPerlin
            positionAmplitude={[positionAmplitude.x, positionAmplitude.y, positionAmplitude.z]}
            positionFrequency={[positionFrequency.x, positionFrequency.y, positionFrequency.z]}
            rotationAmplitude={[rotationAmplitude.x, rotationAmplitude.y, rotationAmplitude.z]}
            rotationFrequency={[rotationFrequency.x, rotationFrequency.y, rotationFrequency.z]}
            amplitudeGain={amplitudeGain}
            frequencyGain={frequencyGain}
            amplitudeDamping={amplitudeDamping}
          />
          <SpectatorFrustum />
        </VirtualCamera>
      </Klipp>
    </>
  );
}
