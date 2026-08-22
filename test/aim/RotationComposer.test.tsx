import { create } from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import { Object3D, PerspectiveCamera, Vector3, type Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { RotationComposer } from '../../src/aim/RotationComposer';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

// the test renderer's default viewport aspect isn't necessarily 1 — read the SAME aspect the
// component sees instead of assuming one, so verification matches what RotationComposer actually used
function AspectReader({ onRead }: { onRead: (aspect: number) => void }) {
  onRead(useThree((state) => state.viewport.aspect));
  return null;
}

function projectToScreen(position: Vector3, quaternion: Quaternion, fov: number, aspect: number, target: Vector3) {
  const camera = new PerspectiveCamera(fov, aspect, 0.1, 1000);
  camera.position.copy(position);
  camera.quaternion.copy(quaternion);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return target.clone().project(camera);
}

describe('RotationComposer (React wrapper)', () => {
  it('registers a RotationComposerAim that actually runs every frame', async () => {
    let core: KlippCore | undefined;
    let aspect = 1;
    const target = new Object3D();
    target.position.set(5, 2, -30);

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <AspectReader onRead={(a) => (aspect = a)} />
        <VirtualCamera name="a" priority={10}>
          <RotationComposer target={target} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1);

    const state = core!.activeState!;
    const projected = projectToScreen(state.position, state.quaternion, state.fov, aspect, target.position);
    expect(projected.x).toBeCloseTo(0, 4);
    expect(projected.y).toBeCloseTo(0, 4);
  });

  it('a target prop change is picked up on the next frame (field mutation, not re-registration)', async () => {
    let core: KlippCore | undefined;
    let aspect = 1;
    const targetA = new Object3D();
    targetA.position.set(0, 0, -10);
    const targetB = new Object3D();
    targetB.position.set(10, 5, -20);

    const scene = (target: Object3D) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <AspectReader onRead={(a) => (aspect = a)} />
        <VirtualCamera name="a" priority={10}>
          <RotationComposer target={target} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(targetA));
    await renderer.advanceFrames(1, 0.1);

    await renderer.update(scene(targetB));
    await renderer.advanceFrames(1, 0.1);

    const state = core!.activeState!;
    const projected = projectToScreen(state.position, state.quaternion, state.fov, aspect, targetB.position);
    expect(projected.x).toBeCloseTo(0, 4);
    expect(projected.y).toBeCloseTo(0, 4);
  });

  it('unmounting stops the aim from running', async () => {
    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && <RotationComposer target={new Object3D()} />}
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(1, 0.1);

    await renderer.update(scene(false));
    await expect(renderer.advanceFrames(1, 0.1)).resolves.not.toThrow();
  });

  it('a screenPosition prop change is picked up on the next frame', async () => {
    let core: KlippCore | undefined;
    let aspect = 1;
    const target = new Object3D();
    target.position.set(0, 0, -20);

    const scene = (screenPosition: [number, number]) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <AspectReader onRead={(a) => (aspect = a)} />
        <VirtualCamera name="a" priority={10}>
          <RotationComposer target={target} screenPosition={screenPosition} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene([0, 0]));
    await renderer.advanceFrames(1, 0.1);
    let state = core!.activeState!;
    let projected = projectToScreen(state.position, state.quaternion, state.fov, aspect, target.position);
    expect(projected.x).toBeCloseTo(0, 4);

    await renderer.update(scene([0.3, 0]));
    await renderer.advanceFrames(1, 0.1);
    state = core!.activeState!;
    projected = projectToScreen(state.position, state.quaternion, state.fov, aspect, target.position);
    expect(projected.x).toBeCloseTo(0.3, 4);
  });

  it('a target inside deadZone gets no reaction; damping eases the catch-up once outside it', async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.position.set(0, 0, -20);

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <RotationComposer target={target} deadZone={[0.2, 0.2]} damping={0.5} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1); // target dead-ahead: within deadZone, no reaction
    const beforeReaction = core!.activeState!.quaternion.clone();

    target.position.set(20, 0, -20); // now far outside deadZone
    await renderer.advanceFrames(1, 0.05);
    expect(core!.activeState!.quaternion.angleTo(beforeReaction)).toBeGreaterThan(0);
  });

  it('a targetOffset prop shifts the look-at point (degrades to world space for a non-rotated target)', async () => {
    let core: KlippCore | undefined;
    let aspect = 1;
    const target = new Object3D();
    target.position.set(0, 0, -20);

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <AspectReader onRead={(a) => (aspect = a)} />
        <VirtualCamera name="a" priority={10}>
          <RotationComposer target={target} targetOffset={[5, 0, 0]} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1);

    const state = core!.activeState!;
    const projected = projectToScreen(state.position, state.quaternion, state.fov, aspect, new Vector3(5, 0, -20));
    expect(projected.x).toBeCloseTo(0, 4);
    expect(projected.y).toBeCloseTo(0, 4);
  });

  it('a hardLimit prop forces the target back inside bounds even under heavy damping', async () => {
    let core: KlippCore | undefined;
    let aspect = 1;
    const target = new Object3D();
    target.position.set(20, 0, -20);

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <AspectReader onRead={(a) => (aspect = a)} />
        <VirtualCamera name="a" priority={10}>
          <RotationComposer target={target} deadZone={[0.1, 0.1]} damping={5} hardLimit={[0.3, 0.3]} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1);

    const state = core!.activeState!;
    const projected = projectToScreen(state.position, state.quaternion, state.fov, aspect, target.position);
    expect(projected.x).toBeCloseTo(0.15, 3);
  });
});
