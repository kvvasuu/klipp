import { Klipp, Noise, VirtualCamera } from '@kvvasuu/klipp/react';
import { CameraControls } from '@kvvasuu/klipp/react/camera-controls';
import { folder, useControls } from 'leva';
import { SpectatorFrustum } from '../../scene/SpectatorFrustum';

const subjectPosition: [number, number, number] = [0, 2, 0];

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
