import { useThree } from '@react-three/fiber';
import { create } from '@react-three/test-renderer';
import CameraControlsImpl from 'camera-controls';
import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HardLockToTarget } from '../../src/body/HardLockToTarget';
import { CameraControls } from '../../src/body/CameraControls';
import type { CameraControlsBody } from '../../src/body/CameraControlsBody';
import { Klipp, useKlippCore } from '../../src/Klipp';
import type { KlippCore } from '../../src/KlippCore';
import { VirtualCamera } from '../../src/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

describe('CameraControls (React wrapper)', () => {
  it('registers a CameraControlsBody that actually runs every frame', async () => {
    let core: KlippCore | undefined;
    const target = new Vector3(0, 0, -20);

    const scene = (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <CameraControls target={target} />
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

  it('impl threads a custom CameraControls subclass through to the underlying body', async () => {
    class CustomControls extends CameraControlsImpl {}
    let controlsBody: CameraControlsBody | null = null;

    const scene = (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <CameraControls target={new Vector3(0, 0, -10)} impl={CustomControls} ref={(b) => (controlsBody = b)} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene);
    await renderer.advanceFrames(1, 0.05);

    expect(controlsBody!.controls).toBeInstanceOf(CustomControls);
  });

  it('any other prop passes straight through onto the real CameraControls instance, drei-style, and stays reactive', async () => {
    let controlsBody: CameraControlsBody | null = null;

    const scene = (minDistance: number) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <CameraControls
            target={new Vector3(0, 0, -10)}
            minDistance={minDistance}
            ref={(b) => (controlsBody = b)}
          />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(5));
    await renderer.advanceFrames(1, 0.05);
    expect(controlsBody!.controls.minDistance).toBe(5);

    await renderer.update(scene(20));
    await renderer.advanceFrames(1, 0.05);
    expect(controlsBody!.controls.minDistance).toBe(20);
  });

  it('connecting/disconnecting on mount/unmount does not throw in the test renderer', async () => {
    const scene = (mounted: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          {mounted && <CameraControls target={new Vector3(0, 0, -10)} />}
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
          <CameraControls target={target} />
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
    let controlsBody: CameraControlsBody | null = null;
    const target = new Vector3(0, 0, -10);

    const scene = (orbitalPriority: number) => (
      <Klipp>
        <VirtualCamera name="orbital" priority={orbitalPriority}>
          <CameraControls target={target} waitForBlend={false} ref={(b) => (controlsBody = b)} />
        </VirtualCamera>
        <VirtualCamera name="other" priority={5}>
          <HardLockToTarget target={[0, 0, 0]} />
        </VirtualCamera>
      </Klipp>
    );

    // orbital starts LOSING the arbitration (1 < 5) — not active, no connect() yet
    const renderer = await create(scene(1));
    await renderer.advanceFrames(1, 0.05); // 'other' is first-ever active: snaps live instantly, no blend

    const connectSpy = vi.spyOn(controlsBody!.controls, 'connect');
    const disconnectSpy = vi.spyOn(controlsBody!.controls, 'disconnect');

    await renderer.update(scene(10)); // orbital now wins priority — its blend-in just started (default 2s)
    await renderer.advanceFrames(1, 0.05); // still mid-blend, but waitForBlend=false doesn't care
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).not.toHaveBeenCalled();

    await renderer.update(scene(1)); // orbital loses again
    await renderer.advanceFrames(1, 0.05);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('waitForBlend=true (default): does not connect until the blend into it actually finishes', async () => {
    let controlsBody: CameraControlsBody | null = null;
    const target = new Vector3(0, 0, -10);

    const scene = (orbitalPriority: number) => (
      <Klipp>
        <VirtualCamera name="orbital" priority={orbitalPriority}>
          <CameraControls target={target} ref={(b) => (controlsBody = b)} />
        </VirtualCamera>
        <VirtualCamera name="other" priority={5}>
          <HardLockToTarget target={[0, 0, 0]} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(1));
    await renderer.advanceFrames(1, 0.05); // 'other' snaps live instantly (first-ever, no blend)

    const connectSpy = vi.spyOn(controlsBody!.controls, 'connect');

    await renderer.update(scene(10)); // orbital wins priority — blend into it starts (default 2s)
    await renderer.advanceFrames(1, 0.5); // mid-blend: not live yet
    expect(connectSpy).not.toHaveBeenCalled();

    await renderer.advanceFrames(1, 2); // pushes elapsed well past the 2s blend duration
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('waitForBlend=true (default): disconnects the instant it loses priority, not lagging through its own blend-out (real bug: overlapped with a waitForBlend=false camera winning immediately, so both received live drag/scroll input at once)', async () => {
    let followBody: CameraControlsBody | null = null;

    const scene = (followPriority: number) => (
      <Klipp>
        <VirtualCamera name="follow" priority={followPriority}>
          <CameraControls target={new Vector3(0, 0, -10)} ref={(b) => (followBody = b)} />
        </VirtualCamera>
        <VirtualCamera name="free" priority={5}>
          <CameraControls waitForBlend={false} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(10)); // follow starts winning, sole/first-ever active
    await renderer.advanceFrames(1, 0.05);

    const disconnectSpy = vi.spyOn(followBody!.controls, 'disconnect');

    await renderer.update(scene(1)); // free wins instantly; follow's own blend-out just started (default 2s)
    await renderer.advanceFrames(1, 0.05); // still well within that blend-out

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  describe('invalidate() on drag/scroll input', () => {
    it('calls invalidate() when camera-controls fires controlstart/control/transitionstart/update/wake while connected (real bug: frameloop="demand" never re-rendered on drag)', async () => {
      let controlsBody: CameraControlsBody | null = null;
      let invalidateSpy: ReturnType<typeof vi.spyOn> | undefined;

      function InvalidateReader() {
        const state = useThree();
        invalidateSpy = vi.spyOn(state, 'invalidate');
        return null;
      }

      const scene = (
        <Klipp>
          <InvalidateReader />
          <VirtualCamera name="a" priority={10}>
            <CameraControls target={new Vector3(0, 0, -10)} ref={(b) => (controlsBody = b)} />
          </VirtualCamera>
        </Klipp>
      );

      const renderer = await create(scene);
      await renderer.advanceFrames(1, 0.05); // sole/first-ever active camera: connects immediately

      invalidateSpy!.mockClear();
      controlsBody!.controls.dispatchEvent({ type: 'controlstart' });
      expect(invalidateSpy).toHaveBeenCalledTimes(1);

      controlsBody!.controls.dispatchEvent({ type: 'control' });
      expect(invalidateSpy).toHaveBeenCalledTimes(2);

      controlsBody!.controls.dispatchEvent({ type: 'transitionstart' });
      expect(invalidateSpy).toHaveBeenCalledTimes(3);

      controlsBody!.controls.dispatchEvent({ type: 'update' });
      expect(invalidateSpy).toHaveBeenCalledTimes(4);

      controlsBody!.controls.dispatchEvent({ type: 'wake' });
      expect(invalidateSpy).toHaveBeenCalledTimes(5);
    });

    it('does not call invalidate() once disconnected — the listeners are torn down with connect()', async () => {
      let controlsBody: CameraControlsBody | null = null;
      let invalidateSpy: ReturnType<typeof vi.spyOn> | undefined;

      function InvalidateReader() {
        const state = useThree();
        invalidateSpy = vi.spyOn(state, 'invalidate');
        return null;
      }

      const scene = (mounted: boolean) => (
        <Klipp>
          <InvalidateReader />
          <VirtualCamera name="a" priority={10}>
            {mounted && <CameraControls target={new Vector3(0, 0, -10)} ref={(b) => (controlsBody = b)} />}
          </VirtualCamera>
        </Klipp>
      );

      const renderer = await create(scene(true));
      await renderer.advanceFrames(1, 0.05);
      const controls = controlsBody!.controls;

      await renderer.update(scene(false));
      invalidateSpy!.mockClear();
      controls.dispatchEvent({ type: 'control' });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('regress=true also calls performance.regress() on the same events invalidate() fires for, but not controlend/rest/sleep', async () => {
      let controlsBody: CameraControlsBody | null = null;
      let regressSpy: ReturnType<typeof vi.spyOn> | undefined;

      function RegressReader() {
        const state = useThree();
        regressSpy = vi.spyOn(state.performance, 'regress');
        return null;
      }

      const scene = (
        <Klipp>
          <RegressReader />
          <VirtualCamera name="a" priority={10}>
            <CameraControls target={new Vector3(0, 0, -10)} regress ref={(b) => (controlsBody = b)} />
          </VirtualCamera>
        </Klipp>
      );

      const renderer = await create(scene);
      await renderer.advanceFrames(1, 0.05);

      regressSpy!.mockClear();
      controlsBody!.controls.dispatchEvent({ type: 'controlstart' });
      controlsBody!.controls.dispatchEvent({ type: 'control' });
      controlsBody!.controls.dispatchEvent({ type: 'transitionstart' });
      controlsBody!.controls.dispatchEvent({ type: 'update' });
      controlsBody!.controls.dispatchEvent({ type: 'wake' });
      expect(regressSpy).toHaveBeenCalledTimes(5);

      controlsBody!.controls.dispatchEvent({ type: 'controlend' });
      controlsBody!.controls.dispatchEvent({ type: 'rest' });
      controlsBody!.controls.dispatchEvent({ type: 'sleep' });
      expect(regressSpy).toHaveBeenCalledTimes(5); // still 5 — these three never regress
    });

    it('regress=false (default) never calls performance.regress()', async () => {
      let controlsBody: CameraControlsBody | null = null;
      let regressSpy: ReturnType<typeof vi.spyOn> | undefined;

      function RegressReader() {
        const state = useThree();
        regressSpy = vi.spyOn(state.performance, 'regress');
        return null;
      }

      const scene = (
        <Klipp>
          <RegressReader />
          <VirtualCamera name="a" priority={10}>
            <CameraControls target={new Vector3(0, 0, -10)} ref={(b) => (controlsBody = b)} />
          </VirtualCamera>
        </Klipp>
      );

      const renderer = await create(scene);
      await renderer.advanceFrames(1, 0.05);

      regressSpy!.mockClear();
      controlsBody!.controls.dispatchEvent({ type: 'control' });
      expect(regressSpy).not.toHaveBeenCalled();
    });

    it('forwards every camera-controls lifecycle event to its matching on* prop', async () => {
      const calls: string[] = [];
      let controlsBody: CameraControlsBody | null = null;

      const scene = (
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <CameraControls
              target={new Vector3(0, 0, -10)}
              ref={(b) => (controlsBody = b)}
              onControlStart={() => calls.push('controlstart')}
              onControl={() => calls.push('control')}
              onControlEnd={() => calls.push('controlend')}
              onTransitionStart={() => calls.push('transitionstart')}
              onUpdate={() => calls.push('update')}
              onWake={() => calls.push('wake')}
              onRest={() => calls.push('rest')}
              onSleep={() => calls.push('sleep')}
            />
          </VirtualCamera>
        </Klipp>
      );

      const renderer = await create(scene);
      await renderer.advanceFrames(1, 0.05);

      const allTypes = ['controlstart', 'control', 'controlend', 'transitionstart', 'update', 'wake', 'rest', 'sleep'];
      for (const type of allTypes) controlsBody!.controls.dispatchEvent({ type });

      expect(calls).toEqual(allTypes);
    });
  });
});
