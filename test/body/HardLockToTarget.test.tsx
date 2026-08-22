import { create } from '@react-three/test-renderer';
import { useRef } from 'react';
import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { HardLockToTarget } from '../../src/body/HardLockToTarget';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

describe('HardLockToTarget (React wrapper)', () => {
  it('registers a HardLockToTargetBody that actually runs every frame', async () => {
    let core: KlippCore | undefined;
    function Scene() {
      const targetRef = useRef<Object3D>(null);
      return (
        <Klipp>
          <CoreReader onRead={(c) => (core = c)} />
          <object3D ref={targetRef} position={[3, 0, 0]} />
          <VirtualCamera name="a" priority={10}>
            <HardLockToTarget target={targetRef} />
          </VirtualCamera>
        </Klipp>
      );
    }

    const renderer = await create(<Scene />);
    await renderer.advanceFrames(1, 0.1);

    expect(core!.activeState!.position.x).toBeCloseTo(3, 10);
  });

  it('a target prop change is picked up on the next frame (field mutation, not re-registration)', async () => {
    let core: KlippCore | undefined;
    const objectA = new Object3D();
    objectA.position.set(1, 0, 0);
    const objectB = new Object3D();
    objectB.position.set(9, 0, 0);

    const scene = (target: Object3D) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <HardLockToTarget target={target} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(objectA));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.x).toBeCloseTo(1, 10);

    await renderer.update(scene(objectB));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.x).toBeCloseTo(9, 10);
  });

  it('unmounting stops the body from running', async () => {
    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && <HardLockToTarget target={new Object3D()} />}
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(1, 0.1);

    await renderer.update(scene(false));
    await expect(renderer.advanceFrames(1, 0.1)).resolves.not.toThrow();
  });

  it('a damping prop change is picked up on the next frame, without losing the underlying HardLockToTargetBody', async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.position.set(10, 0, 0);

    const scene = (damping: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <HardLockToTarget target={target} damping={damping} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(0.5));
    await renderer.advanceFrames(1, 0.05);
    expect(core!.activeState!.position.x).toBeGreaterThan(0);
    expect(core!.activeState!.position.x).toBeLessThan(10); // still catching up, damped

    await renderer.update(scene(0));
    await renderer.advanceFrames(1, 0.05);
    expect(core!.activeState!.position.x).toBe(10); // damping off: snaps instantly
  });
});
