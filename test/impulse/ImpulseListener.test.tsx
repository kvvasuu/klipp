import { create } from '@react-three/test-renderer';
import { describe, expect, it } from 'vitest';
import { Klipp } from '../../src/Klipp';
import { useKlipp } from '../../src/KlippContext';
import type { KlippCore } from '../../src/KlippCore';
import { ImpulseField } from '../../src/impulse/ImpulseField';
import { ImpulseListener } from '../../src/impulse/ImpulseListener';
import type { ImpulseListenerNoise } from '../../src/impulse/ImpulseListenerNoise';
import { VirtualCamera } from '../../src/VirtualCamera';

const always = () => 1;

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlipp().core);
  return null;
}

describe('ImpulseListener (React wrapper)', () => {
  it('registers an ImpulseListenerNoise that actually runs every frame', async () => {
    let core: KlippCore | undefined;
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [5, 0, 0], shape: always, duration: 60 }); // real clock, long duration

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <ImpulseListener field={field} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1);

    expect(core!.activeState!.position.x).toBeCloseTo(5, 3);
  });

  it('a gain prop change is picked up on the next frame (field mutation, not re-registration)', async () => {
    let core: KlippCore | undefined;
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [5, 0, 0], shape: always, duration: 60 });

    const scene = (gain: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <ImpulseListener field={field} gain={gain} />
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
    const field = new ImpulseField();
    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && <ImpulseListener field={field} />}
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
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [5, 0, 0], shape: always, duration: 60, channel: 0b10 });

    const scene = (channelMask: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <ImpulseListener field={field} channelMask={channelMask} />
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

  it('a shake prop (plain config, not a live instance) is wired up and reacts to the impulse', async () => {
    let core: KlippCore | undefined;
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], shape: always, duration: 60 }); // no direction: position offset comes from shake alone

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <ImpulseListener field={field} shake={{ positionAmplitude: [5, 0, 0] }} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(5, 0.1);

    expect(core!.activeState!.position.length()).toBeGreaterThan(0);
  });

  it('shake prop presence toggles listener.shake between an instance and undefined (mount/unmount)', async () => {
    let listener: ImpulseListenerNoise | undefined;
    const field = new ImpulseField();

    const scene = (withShake: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <ImpulseListener
            field={field}
            ref={(instance) => {
              listener = instance ?? undefined;
            }}
            shake={withShake ? { positionAmplitude: [1, 0, 0] } : undefined}
          />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(false));
    await renderer.advanceFrames(1, 0.1);
    expect(listener!.shake).toBeUndefined();

    await renderer.update(scene(true));
    await renderer.advanceFrames(1, 0.1);
    expect(listener!.shake).toBeDefined();

    await renderer.update(scene(false));
    await renderer.advanceFrames(1, 0.1);
    expect(listener!.shake).toBeUndefined();
  });
});
