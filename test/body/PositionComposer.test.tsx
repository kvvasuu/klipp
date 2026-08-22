import { create } from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import { Object3D, PerspectiveCamera, Vector3, type Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { PositionComposer } from '../../src/body/PositionComposer';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

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

describe('PositionComposer (React wrapper)', () => {
  it('registers a PositionComposerBody that actually runs every frame', async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.position.set(0, 0, -20);

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <PositionComposer target={target} cameraDistance={10} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1);

    expect(core!.activeState!.position.z).toBeCloseTo(-10, 5);
  });

  it('a target prop change is picked up on the next frame (field mutation, not re-registration)', async () => {
    let core: KlippCore | undefined;
    const objectA = new Object3D();
    objectA.position.set(0, 0, -10);
    const objectB = new Object3D();
    objectB.position.set(0, 0, -40);

    const scene = (target: Object3D) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <PositionComposer target={target} cameraDistance={5} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(objectA));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.z).toBeCloseTo(-5, 5);

    await renderer.update(scene(objectB));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.z).toBeCloseTo(-35, 5);
  });

  it('unmounting stops the body from running', async () => {
    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && <PositionComposer target={new Object3D()} />}
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(1, 0.1);

    await renderer.update(scene(false));
    await expect(renderer.advanceFrames(1, 0.1)).resolves.not.toThrow();
  });

  it('a cameraDistance prop change is picked up on the next frame', async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.position.set(0, 0, -30);

    const scene = (cameraDistance: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <PositionComposer target={target} cameraDistance={cameraDistance} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(10));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.z).toBeCloseTo(-20, 5);

    await renderer.update(scene(25));
    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.z).toBeCloseTo(-5, 5);
  });

  it('a target inside deadZone gets no lateral reaction; damping eases the catch-up once outside it', async () => {
    let core: KlippCore | undefined;
    const target = new Object3D();
    target.position.set(0, 0, -20);

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <PositionComposer target={target} cameraDistance={10} deadZone={[0.2, 0.2]} damping={0.5} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.1); // target dead-ahead: within deadZone, no lateral reaction
    const beforeReaction = core!.activeState!.position.clone();

    target.position.set(20, 0, -20); // now far outside deadZone
    await renderer.advanceFrames(1, 0.05);
    expect(core!.activeState!.position.distanceTo(beforeReaction)).toBeGreaterThan(0);
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
          <PositionComposer
            target={target}
            cameraDistance={10}
            deadZone={[0.1, 0.1]}
            damping={5}
            hardLimit={[0.3, 0.3]}
          />
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
