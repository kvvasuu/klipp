import { create } from '@react-three/test-renderer';
import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { BindingModes } from '../../src/body/BindingMode';
import { Follow } from '../../src/body/Follow';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

describe('Follow (React wrapper)', () => {
  it("registers a FollowBody that actually runs every frame, using r3f's [x,y,z] offset shorthand", async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.position.set(3, 0, 0);

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <Follow target={target} offset={[0, 0, 0]} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1);

    expect(core!.activeState!.position.x).toBeCloseTo(3, 10);
  });

  it('an offset prop change is picked up on the next frame (field mutation, not re-registration)', async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();

    const scene = (offsetX: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <Follow target={target} offset={[offsetX, 0, 0]} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(1));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.x).toBeCloseTo(1, 5);

    await renderer.update(scene(5));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.x).toBeCloseTo(5, 5);
  });

  it('unmounting stops the body from running', async () => {
    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && <Follow target={new Object3D()} />}
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(1, 0.1);

    await renderer.update(scene(false));
    await expect(renderer.advanceFrames(1, 0.1)).resolves.not.toThrow();
  });

  it('a bindingMode prop change is picked up on the next frame', async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.rotation.set(0, Math.PI / 2, 0);

    const scene = (bindingMode: (typeof BindingModes)[keyof typeof BindingModes]) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <Follow target={target} offset={[0, 0, 10]} bindingMode={bindingMode} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(BindingModes.lockToTarget));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.x).toBeCloseTo(10, 5); // rotated into the target's 90° yaw

    await renderer.update(scene(BindingModes.worldSpace));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.x).toBeCloseTo(0, 5); // now raw, unrotated
    expect(core!.activeState!.position.z).toBeCloseTo(10, 5);
  });
});
