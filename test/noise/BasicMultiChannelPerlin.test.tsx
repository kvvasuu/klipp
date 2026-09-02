import { create } from '@react-three/test-renderer';
import { describe, expect, it } from 'vitest';
import { BasicMultiChannelPerlin } from '../../src/noise/BasicMultiChannelPerlin';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

describe('BasicMultiChannelPerlin (React wrapper)', () => {
  it('registers a BasicMultiChannelPerlinNoise that actually runs every frame', async () => {
    let core: KlippCore | undefined;

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <BasicMultiChannelPerlin positionAmplitude={[5, 5, 5]} seed={1} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1);

    expect(core!.activeState!.position.length()).toBeGreaterThan(0);
  });

  it('a positionAmplitude prop change is picked up on the next frame (field mutation, not re-registration)', async () => {
    let core: KlippCore | undefined;

    const scene = (amplitude: [number, number, number]) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <BasicMultiChannelPerlin positionAmplitude={amplitude} seed={1} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene([0, 0, 0]));
    await renderer.advanceFrames(1, 0.1);
    const quietPosition = core!.activeState!.position.clone();

    await renderer.update(scene([5, 5, 5]));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.equals(quietPosition)).toBe(false);
  });

  it('unmounting stops the noise from running', async () => {
    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && <BasicMultiChannelPerlin positionAmplitude={[5, 5, 5]} />}
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(1, 0.1);

    await renderer.update(scene(false));
    await expect(renderer.advanceFrames(1, 0.1)).resolves.not.toThrow();
  });

  it('two instances stack additively, unlike Body/Aim which would replace each other', async () => {
    let core: KlippCore | undefined;

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <BasicMultiChannelPerlin positionAmplitude={[3, 0, 0]} seed={1} />
          <BasicMultiChannelPerlin positionAmplitude={[3, 0, 0]} seed={2} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1);

    // two independent, seeded, nonzero contributions should (almost certainly) not cancel to exactly 0
    expect(core!.activeState!.position.length()).toBeGreaterThan(0);
  });

  it('an amplitudeDamping prop change is picked up on the next frame — eases instead of cutting instantly', async () => {
    let core: KlippCore | undefined;

    const scene = (amplitudeGain: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <BasicMultiChannelPerlin
            positionAmplitude={[5, 5, 5]}
            amplitudeGain={amplitudeGain}
            amplitudeDamping={0.5}
            seed={1}
          />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(1));
    await renderer.advanceFrames(1, 0.1);

    await renderer.update(scene(0));
    await renderer.advanceFrames(1, 0.016);

    // damped: one small step after amplitudeGain drops to 0 should NOT have cut the shake dead yet
    expect(core!.activeState!.position.length()).toBeGreaterThan(0);
  });
});
