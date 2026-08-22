import { create } from '@react-three/test-renderer';
import { describe, expect, it } from 'vitest';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { ImpulseListener } from '../../src/impulse/ImpulseListener';
import { ImpulseManager } from '../../src/impulse/ImpulseManager';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

describe('ImpulseListener (React wrapper)', () => {
  it('registers an ImpulseListenerNoise that actually runs every frame', async () => {
    let core: KlippCore | undefined;
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [5, 0, 0], sustainTime: 60 }); // real clock, long sustain

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <ImpulseListener manager={manager} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1);

    expect(core!.activeState!.position.x).toBeCloseTo(5, 3);
  });

  it('a gain prop change is picked up on the next frame (field mutation, not re-registration)', async () => {
    let core: KlippCore | undefined;
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [5, 0, 0], sustainTime: 60 });

    const scene = (gain: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <ImpulseListener manager={manager} gain={gain} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(0));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.x).toBeCloseTo(0, 3);

    await renderer.update(scene(2));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.x).toBeCloseTo(10, 3);
  });

  it('unmounting stops the listener from running', async () => {
    const manager = new ImpulseManager();
    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && <ImpulseListener manager={manager} />}
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(1, 0.1);

    await renderer.update(scene(false));
    await expect(renderer.advanceFrames(1, 0.1)).resolves.not.toThrow();
  });

  it('a channelMask prop change is picked up on the next frame', async () => {
    let core: KlippCore | undefined;
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [5, 0, 0], sustainTime: 60, channel: 0b10 });

    const scene = (channelMask: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <ImpulseListener manager={manager} channelMask={channelMask} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(0b01)); // wrong channel
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.x).toBeCloseTo(0, 3);

    await renderer.update(scene(0b10)); // right channel
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.x).toBeCloseTo(5, 3);
  });
});
