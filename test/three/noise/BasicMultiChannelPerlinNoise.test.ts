import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../../src/core/CameraState';
import { BasicMultiChannelPerlinNoiseCore } from '../../../src/core/noise/BasicMultiChannelPerlinNoiseCore';
import { BasicMultiChannelPerlinNoise } from '../../../src/three/noise/BasicMultiChannelPerlinNoise';

describe('BasicMultiChannelPerlinNoise', () => {
  it('takes its vectors as a Vector3, a tuple or one number, and keeps the defaults of the rest', () => {
    const noise = new BasicMultiChannelPerlinNoise({
      positionAmplitude: new Vector3(0.1, 0.2, 0),
      rotationAmplitude: [1, 2, 3],
      rotationFrequency: 2,
      frequencyGain: 3,
    });

    expect(noise.positionAmplitude).toEqual([0.1, 0.2, 0]);
    expect(noise.rotationAmplitude).toEqual([1, 2, 3]);
    expect(noise.rotationFrequency).toEqual([2, 2, 2]);
    expect(noise.positionFrequency).toEqual([1, 1, 1]);
    expect(noise.frequencyGain).toBe(3);
  });

  it('shakes exactly like the core class with the same settings', () => {
    const three = new BasicMultiChannelPerlinNoise({ positionAmplitude: new Vector3(0.1, 0.1, 0), seed: 7 });
    const core = new BasicMultiChannelPerlinNoiseCore({ positionAmplitude: [0.1, 0.1, 0], seed: 7 });
    const a = createCameraState();
    const b = createCameraState();

    for (let i = 0; i < 10; i++) {
      three.update(a, 0.1, i === 0);
      core.update(b, 0.1, i === 0);
    }
    expect(a).toEqual(b);
    expect(a.position).not.toEqual([0, 0, 0]);
  });
});
