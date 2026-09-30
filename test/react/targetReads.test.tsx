/**
 * Acceptance test for the target registry: every target is resolved
 * once per frame per <Klipp>, however many stages and cameras read it.
 *
 * Counts Object3D.updateWorldMatrix calls on the target itself (klipp's only path to world transforms;
 * the renderer uses updateMatrixWorld), so the result does not depend on how deep the target is nested.
 *
 * Without the registry every stage resolved on its own: 3 / 7 / 6 resolves per frame.
 */
import { create } from '@react-three/test-renderer';
import type { ReactNode } from 'react';
import { Object3D } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { Follow, GroupFraming, HardLookAt, Klipp, RotationComposer, VirtualCamera } from '../../src/react/index';

const DEPTH = 2;
const FRAMES = 10;

const originalUpdateWorldMatrix = Object3D.prototype.updateWorldMatrix;
afterEach(() => {
  Object3D.prototype.updateWorldMatrix = originalUpdateWorldMatrix;
});

function nestedTarget() {
  const root = new Object3D();
  let leaf = root;
  for (let d = 0; d < DEPTH; d++) {
    const child = new Object3D();
    child.position.set(0.1, 0.2, 0);
    leaf.add(child);
    leaf = child;
  }
  return { root, leaf };
}

async function resolvesPerFrame(scene: (target: Object3D) => ReactNode): Promise<number> {
  const { root, leaf } = nestedTarget();
  const renderer = await create(
    <>
      <primitive object={root} />
      <Klipp>{scene(leaf)}</Klipp>
    </>,
  );
  await renderer.advanceFrames(5, 1 / 60); // settle mount-time work
  let calls = 0;
  Object3D.prototype.updateWorldMatrix = function (updateParents, updateChildren) {
    if (this === leaf) calls++;
    return originalUpdateWorldMatrix.call(this, updateParents, updateChildren);
  };
  await renderer.advanceFrames(FRAMES, 1 / 60);
  Object3D.prototype.updateWorldMatrix = originalUpdateWorldMatrix;
  await renderer.unmount();
  return calls / FRAMES;
}

describe('target reads per frame', () => {
  it('Follow + HardLookAt resolve a shared target once', async () => {
    const resolves = await resolvesPerFrame((target) => (
      <VirtualCamera name="a" priority={1}>
        <Follow target={target} offset={[0, 3, 8]} />
        <HardLookAt target={target} />
      </VirtualCamera>
    ));
    expect(resolves).toBe(1);
  });

  it('Follow + RotationComposer + GroupFraming resolve a shared target once', async () => {
    const resolves = await resolvesPerFrame((target) => (
      <VirtualCamera name="a" priority={1}>
        <Follow target={target} offset={[0, 3, 8]} />
        <RotationComposer target={target} />
        <GroupFraming members={[{ target, radius: 1 }]} />
      </VirtualCamera>
    ));
    expect(resolves).toBe(1);
  });

  it('two cameras following the same target resolve it once', async () => {
    const resolves = await resolvesPerFrame((target) => (
      <>
        <VirtualCamera name="a" priority={2}>
          <Follow target={target} offset={[0, 3, 8]} />
          <HardLookAt target={target} />
        </VirtualCamera>
        <VirtualCamera name="b" priority={1}>
          <Follow target={target} offset={[5, 2, 0]} />
          <HardLookAt target={target} />
        </VirtualCamera>
      </>
    ));
    expect(resolves).toBe(1);
  });
});
