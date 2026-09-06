import { create } from '@react-three/test-renderer';
import { describe, expect, it } from 'vitest';
import { HardLockToTarget } from '../../src/body/HardLockToTarget';
import type { LensExtension } from '../../src/extension/LensExtension';
import { Lens } from '../../src/extension/Lens';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

describe('Lens (React wrapper)', () => {
  it('registers a LensExtension that overrides fov every frame', async () => {
    let core: KlippCore | undefined;
    const renderer = await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <HardLockToTarget target={[3, 0, 0]} />
          <Lens fov={75} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    expect(core!.activeState!.fov).toBe(75);
  });

  it('leaves near/far untouched when only fov is set', async () => {
    let core: KlippCore | undefined;
    const renderer = await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10} initialState={{ near: 0.5, far: 200 }}>
          <HardLockToTarget target={[3, 0, 0]} />
          <Lens fov={75} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    expect(core!.activeState!.near).toBe(0.5);
    expect(core!.activeState!.far).toBe(200);
  });

  it('a fov prop change is picked up on the next frame (field mutation, not re-registration)', async () => {
    let core: KlippCore | undefined;
    const scene = (fov: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <HardLockToTarget target={[3, 0, 0]} />
          <Lens fov={fov} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(60));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.fov).toBe(60);

    await renderer.update(scene(90));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.fov).toBe(90);
  });

  it('ref gives imperative access, for mutating fov from an external useFrame without a re-render', async () => {
    let core: KlippCore | undefined;
    const lensRef = { current: null as LensExtension | null };
    const renderer = await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <HardLockToTarget target={[3, 0, 0]} />
          <Lens ref={lensRef} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    lensRef.current!.fov = 45;
    await renderer.advanceFrames(1, 0.1);

    expect(core!.activeState!.fov).toBe(45);
  });
});
