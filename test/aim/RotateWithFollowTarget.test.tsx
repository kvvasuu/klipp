import { create } from '@react-three/test-renderer';
import { Object3D, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { RotateWithFollowTarget } from '../../src/aim/RotateWithFollowTarget';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

function expectQuaternionsClose(actual: Quaternion, expected: Quaternion, precision = 9) {
  expect(actual.angleTo(expected)).toBeLessThan(10 ** -precision);
}

describe('RotateWithFollowTarget (React wrapper)', () => {
  it('registers a RotateWithFollowTargetAim that actually runs every frame', async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.rotation.set(0, Math.PI / 2, 0);

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <RotateWithFollowTarget target={target} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1);

    expectQuaternionsClose(core!.activeState!.quaternion, new Quaternion().setFromEuler(target.rotation));
  });

  it('a target prop change is picked up on the next frame (field mutation, not re-registration)', async () => {
    let core: KlippCore | undefined;
    const targetA = new Object3D();
    targetA.rotation.set(0, 1, 0);
    const targetB = new Object3D();
    targetB.rotation.set(0, -1, 0.5);

    const scene = (target: Object3D) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <RotateWithFollowTarget target={target} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(targetA));
    await renderer.advanceFrames(1, 0.1);
    expectQuaternionsClose(core!.activeState!.quaternion, new Quaternion().setFromEuler(targetA.rotation));

    await renderer.update(scene(targetB));
    await renderer.advanceFrames(1, 0.1);
    expectQuaternionsClose(core!.activeState!.quaternion, new Quaternion().setFromEuler(targetB.rotation));
  });

  it('unmounting stops the aim from running', async () => {
    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && <RotateWithFollowTarget target={new Object3D()} />}
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(1, 0.1);

    await renderer.update(scene(false));
    await expect(renderer.advanceFrames(1, 0.1)).resolves.not.toThrow();
  });

  it('a damping prop change is picked up on the next frame, without losing the underlying Aim', async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.rotation.set(0, 1.5, 0);
    const targetQuaternion = new Quaternion().setFromEuler(target.rotation);

    const scene = (damping: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <RotateWithFollowTarget target={target} damping={damping} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(0.5));
    await renderer.advanceFrames(1, 0.05); // consume the first-ever-update hard snap
    target.rotation.set(0, -1.5, 0); // rotate the target so there's a genuine gap for damping to close
    const newTargetQuaternion = new Quaternion().setFromEuler(target.rotation);
    await renderer.advanceFrames(1, 0.05);
    expect(core!.activeState!.quaternion.angleTo(newTargetQuaternion)).toBeGreaterThan(0.01); // still catching up

    await renderer.update(scene(0));
    await renderer.advanceFrames(1, 0.05);
    expectQuaternionsClose(core!.activeState!.quaternion, newTargetQuaternion); // damping off: snaps instantly
  });
});
