import { create } from '@react-three/test-renderer';
import { useRef } from 'react';
import { Object3D, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { HardLockToTarget } from '../../src/body/HardLockToTarget';
import { HardLookAt } from '../../src/aim/HardLookAt';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

function expectQuaternionsClose(
  actual: { x: number; y: number; z: number; w: number },
  expected: { x: number; y: number; z: number; w: number },
) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
  expect(actual.w).toBeCloseTo(expected.w, 9);
}

describe('HardLookAt (React wrapper)', () => {
  it('registers a HardLookAtAim that actually runs every frame, after Body', async () => {
    let core: KlippCore | undefined;
    function Scene() {
      const eyeRef = useRef<Object3D>(null);
      const targetRef = useRef<Object3D>(null);
      return (
        <Klipp>
          <CoreReader onRead={(c) => (core = c)} />
          <object3D ref={eyeRef} position={[1, 2, 3]} />
          <object3D ref={targetRef} position={[5, -1, 0]} />
          <VirtualCamera name="a" priority={10}>
            <HardLockToTarget target={eyeRef} />
            <HardLookAt target={targetRef} />
          </VirtualCamera>
        </Klipp>
      );
    }

    const renderer = await create(<Scene />);
    await renderer.advanceFrames(1, 0.1);

    const reference = new PerspectiveCamera();
    reference.position.set(1, 2, 3);
    reference.lookAt(5, -1, 0);

    expectQuaternionsClose(core!.activeState!.quaternion, reference.quaternion);
  });

  it('a target prop change is picked up on the next frame (field mutation, not re-registration)', async () => {
    let core: KlippCore | undefined;
    const targetA = new Object3D();
    targetA.position.set(0, 0, -5);
    const targetB = new Object3D();
    targetB.position.set(5, -1, 0);

    const scene = (target: Object3D) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <HardLockToTarget target={new Object3D()} />
          <HardLookAt target={target} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(targetA));
    await renderer.advanceFrames(1, 0.1);

    await renderer.update(scene(targetB));
    await renderer.advanceFrames(1, 0.1);

    const reference = new PerspectiveCamera();
    reference.position.set(0, 0, 0);
    reference.lookAt(5, -1, 0);
    expectQuaternionsClose(core!.activeState!.quaternion, reference.quaternion);
  });
});
