import { create } from '@react-three/test-renderer';
import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HardLockToTarget } from '../../src/body/HardLockToTarget';
import { OrbitalControls } from '../../src/body/OrbitalControls';
import type { OrbitalControlsBody } from '../../src/body/OrbitalControlsBody';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

describe('OrbitalControls (React wrapper)', () => {
  it('registers an OrbitalControlsBody that actually runs every frame', async () => {
    let core: KlippCore | undefined;
    const target = new Vector3(0, 0, -20);

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <OrbitalControls target={target} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(5, 0.05);

    const state = core!.activeState!;
    const forward = new Vector3(0, 0, -1).applyQuaternion(state.quaternion);
    const towardTarget = target.clone().sub(state.position).normalize();
    expect(forward.dot(towardTarget)).toBeGreaterThan(0.99);
  });

  it('connecting/disconnecting on mount/unmount does not throw in the test renderer', async () => {
    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && <OrbitalControls target={new Vector3(0, 0, -10)} />}
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(1, 0.05);

    await renderer.update(scene(false));
    await expect(renderer.advanceFrames(1, 0.05)).resolves.not.toThrow();
  });

  it('a target prop change is picked up on the next frame (field mutation, not re-registration)', async () => {
    let core: KlippCore | undefined;
    const targetA = new Vector3(0, 0, -10);
    const targetB = new Vector3(20, 0, 0);

    const scene = (target: Vector3) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <OrbitalControls target={target} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(targetA));
    await renderer.advanceFrames(10, 0.05);

    await renderer.update(scene(targetB));
    await renderer.advanceFrames(10, 0.05);

    const state = core!.activeState!;
    const forward = new Vector3(0, 0, -1).applyQuaternion(state.quaternion);
    const towardB = targetB.clone().sub(state.position).normalize();
    expect(forward.dot(towardB)).toBeGreaterThan(0.99);
  });

  it('waitForBlend=false: connects the instant it wins priority, even mid-blend; disconnects the instant it loses', async () => {
    let orbitalBody: OrbitalControlsBody | null = null;
    const target = new Vector3(0, 0, -10);

    const scene = (orbitalPriority: number) => (
      <Klipp>
        <VirtualCamera name="orbital" priority={orbitalPriority}>
          <OrbitalControls target={target} waitForBlend={false} ref={(b) => (orbitalBody = b)} />
        </VirtualCamera>
        <VirtualCamera name="other" priority={5}>
          <HardLockToTarget target={[0, 0, 0]} />
        </VirtualCamera>
      </Klipp>
    );

    // orbital starts LOSING the arbitration (1 < 5) — not active, no connect() yet
    const renderer = await create(scene(1));
    await renderer.advanceFrames(1, 0.05); // 'other' is first-ever active: snaps live instantly, no blend

    const connectSpy = vi.spyOn(orbitalBody!.controls, 'connect');
    const disconnectSpy = vi.spyOn(orbitalBody!.controls, 'disconnect');

    await renderer.update(scene(10)); // orbital now wins priority — its blend-in just started (default 2s)
    await renderer.advanceFrames(1, 0.05); // still mid-blend, but waitForBlend=false doesn't care
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).not.toHaveBeenCalled();

    await renderer.update(scene(1)); // orbital loses again
    await renderer.advanceFrames(1, 0.05);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('waitForBlend=true (default): does not connect until the blend into it actually finishes', async () => {
    let orbitalBody: OrbitalControlsBody | null = null;
    const target = new Vector3(0, 0, -10);

    const scene = (orbitalPriority: number) => (
      <Klipp>
        <VirtualCamera name="orbital" priority={orbitalPriority}>
          <OrbitalControls target={target} ref={(b) => (orbitalBody = b)} />
        </VirtualCamera>
        <VirtualCamera name="other" priority={5}>
          <HardLockToTarget target={[0, 0, 0]} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(1));
    await renderer.advanceFrames(1, 0.05); // 'other' snaps live instantly (first-ever, no blend)

    const connectSpy = vi.spyOn(orbitalBody!.controls, 'connect');

    await renderer.update(scene(10)); // orbital wins priority — blend into it starts (default 2s)
    await renderer.advanceFrames(1, 0.5); // mid-blend: not live yet
    expect(connectSpy).not.toHaveBeenCalled();

    await renderer.advanceFrames(1, 2); // pushes elapsed well past the 2s blend duration
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });
});
