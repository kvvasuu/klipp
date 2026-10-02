import { vec3 } from 'math';
import { describe, expect, it } from 'vitest';
import type { BasicMultiChannelPerlinNoiseThree } from '../../../src/three/noise/BasicMultiChannelPerlinNoiseThree';
import type { BasicMultiChannelPerlinProps } from '../../../src/react/noise/BasicMultiChannelPerlin';
import { Noise } from '../../../src/react/noise/Noise';
import { expectPropsReachInstance, mountInCamera } from '../wiring';

describe('Noise.BasicMultiChannelPerlin', () => {
  it('registers a noise that runs every frame, stacking with other noise', async () => {
    const mounted = await mountInCamera(
      <>
        <Noise.BasicMultiChannelPerlin positionAmplitude={[3, 0, 0]} seed={1} />
        <Noise.BasicMultiChannelPerlin positionAmplitude={[0, 3, 0]} seed={2} />
      </>,
    );
    await mounted.frame();
    expect(mounted.state.position[0]).not.toBe(0);
    expect(mounted.state.position[1]).not.toBe(0);
  });

  it('passes every prop to the same noise, on mount and when props change', async () => {
    await expectPropsReachInstance<BasicMultiChannelPerlinProps, BasicMultiChannelPerlinNoiseThree>(
      (props, ref) => <Noise.BasicMultiChannelPerlin ref={ref} {...props} />,
      {
        positionAmplitude: [1, 2, 3],
        positionFrequency: [2, 2, 2],
        rotationAmplitude: [4, 5, 6],
        rotationFrequency: [3, 3, 3],
        amplitudeGain: 0.5,
        frequencyGain: 2,
        amplitudeDamping: 0.3,
      },
      {
        positionAmplitude: [3, 2, 1],
        positionFrequency: [1, 1, 1],
        rotationAmplitude: [6, 5, 4],
        rotationFrequency: [1, 2, 3],
        amplitudeGain: 1,
        frequencyGain: 0.5,
        amplitudeDamping: { into: 0.2, from: 1 },
      },
    );
  });

  it('stops shaking the camera once unmounted', async () => {
    const mounted = await mountInCamera(<Noise.BasicMultiChannelPerlin positionAmplitude={[5, 5, 5]} seed={1} />);
    await mounted.frame();
    await mounted.update(null);
    await mounted.frame();
    const before = vec3.clone(mounted.state.position);

    await mounted.frame();

    expect(mounted.state.position).toEqual(before);
  });
});
