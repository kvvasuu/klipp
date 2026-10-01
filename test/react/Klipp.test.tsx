import { renderHook } from '@testing-library/react';
import { create } from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Klipp } from '../../src/react/Klipp';
import { useKlipp } from '../../src/react/KlippContext';
import { KlippCore } from '../../src/core/KlippCore';
import { VirtualCamera } from '../../src/react/VirtualCamera';
import { useVirtualCamera } from '../../src/react/VirtualCameraContext';
import { HardLockToTarget } from '../../src/react/body/HardLockToTarget';
import { BlendCurves } from '../../src/core/blend/BlendCurves';
import { useEffect, useRef } from 'react';
import type { Object3D } from 'three';

describe('Klipp / useKlipp', () => {
  it('throws when used outside a <Klipp> provider', () => {
    // no Canvas/renderer needed: this throws before touching anything r3f-specific
    expect(() => renderHook(() => useKlipp())).toThrow(/within a <Klipp> provider/);
  });

  it('provides one stable KlippCore per tree', async () => {
    const seen: KlippCore[] = [];
    let other: KlippCore | undefined;
    const scene = () => (
      <Klipp>
        <Reader onRead={(c) => seen.push(c)} />
      </Klipp>
    );

    const renderer = await create(scene());
    await renderer.update(scene());
    await create(
      <Klipp>
        <Reader onRead={(c) => (other = c)} />
      </Klipp>,
    );

    expect(seen[0]).toBeInstanceOf(KlippCore);
    expect(seen[1]).toBe(seen[0]);
    expect(other).not.toBe(seen[0]);
  });

  it('writes position and fov/near/far onto the r3f camera', async () => {
    let camera: PerspectiveCamera | undefined;
    function LensWriter() {
      const { controller } = useVirtualCamera();
      useEffect(
        () =>
          controller.registerAim((out) => {
            out.fov = 35;
            out.near = 1;
            out.far = 200;
          }),
        [controller],
      );
      return null;
    }

    const renderer = await create(
      <Klipp>
        <CameraReader onRead={(c) => (camera = c)} />
        <VirtualCamera name="a" priority={10}>
          <HardLockToTarget target={[3, 4, 5]} />
          <LensWriter />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    expect(camera!.position.toArray()).toEqual([3, 4, 5]);
    expect([camera!.fov, camera!.near, camera!.far]).toEqual([35, 1, 200]);
  });

  it('sets viewOffset in canvas pixels (1280x800), skips it at zero and clears it when it returns to zero', async () => {
    let camera: PerspectiveCamera | undefined;
    function ViewOffsetWriter({ x, y }: { x: number; y: number }) {
      const { controller } = useVirtualCamera();
      useEffect(
        () =>
          controller.registerAim((out) => {
            out.viewOffset[0] = x;
            out.viewOffset[1] = y;
          }),
        [controller, x, y],
      );
      return null;
    }
    const scene = (x: number, y: number) => (
      <Klipp>
        <CameraReader onRead={(c) => (camera = c)} />
        <VirtualCamera name="a" priority={10}>
          <ViewOffsetWriter x={x} y={y} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(0, 0));
    await renderer.advanceFrames(1, 0.1);
    expect(camera!.view).toBeNull();

    await renderer.update(scene(0.5, -0.3));
    await renderer.advanceFrames(1, 0.1);
    expect(camera!.view).toMatchObject({ enabled: true, offsetX: -320, offsetY: -120 });

    await renderer.update(scene(0, 0));
    await renderer.advanceFrames(1, 0.1);
    expect(camera!.view?.enabled).toBe(false);
  });

  it('drives an externally-supplied `camera` prop instead of the default r3f camera', async () => {
    const externalCamera = new PerspectiveCamera();
    let defaultCamera: PerspectiveCamera | undefined;

    function DefaultCameraReader() {
      defaultCamera = useThree((state) => state.camera as PerspectiveCamera);
      return null;
    }

    function Scene() {
      const targetRef = useRef<Object3D>(null);
      return (
        <Klipp camera={externalCamera}>
          <DefaultCameraReader />
          <object3D ref={targetRef} position={[3, 4, 5]} />
          <VirtualCamera name="a" priority={10}>
            <HardLockToTarget target={targetRef} />
          </VirtualCamera>
        </Klipp>
      );
    }

    const renderer = await create(<Scene />);
    await renderer.advanceFrames(1, 0.1);

    expect(externalCamera.position.x).toBeCloseTo(3, 10);
    expect(externalCamera.position.y).toBeCloseTo(4, 10);
    expect(externalCamera.position.z).toBeCloseTo(5, 10);
    expect(defaultCamera!.position.equals(externalCamera.position)).toBe(false);
  });

  it("preserves fov/near/far already configured on the camera before mount, when nothing ever writes them (real bug: they got silently reset to createCameraState()'s generic defaults)", async () => {
    const externalCamera = new PerspectiveCamera(75, 1, 1, 5000);

    const renderer = await create(
      <Klipp camera={externalCamera}>
        <VirtualCamera name="a" priority={10}>
          <HardLockToTarget target={[0, 0, 0]} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    expect(externalCamera.fov).toBe(75);
    expect(externalCamera.near).toBe(1);
    expect(externalCamera.far).toBe(5000);
  });

  it("a NEW <Klipp> mounted later (e.g. switching demo scenes under one <Canvas>) starts from the camera's ORIGINAL pristine config, not wherever a PREVIOUS <Klipp> using the same camera last left it (real bug: switching scenes carried position over)", async () => {
    let camera: PerspectiveCamera | undefined;
    function SceneA() {
      return (
        <>
          <CameraReader onRead={(c) => (camera = c)} />
          <Klipp>
            <VirtualCamera name="a" priority={10}>
              <HardLockToTarget target={[10, 20, 30]} />
            </VirtualCamera>
          </Klipp>
        </>
      );
    }
    function SceneB() {
      return (
        <>
          <CameraReader onRead={(c) => (camera = c)} />
          <Klipp>
            <VirtualCamera name="b" priority={10} />
          </Klipp>
        </>
      );
    }

    const renderer = await create(<SceneA />);
    const pristinePosition = camera!.position.clone();

    await renderer.advanceFrames(1, 0.1);
    expect(camera!.position.equals(pristinePosition)).toBe(false); // SceneA's HardLockToTarget moved it

    await renderer.update(<SceneB />);
    await renderer.advanceFrames(1, 0.1);

    // SceneB has no Body — if it inherited SceneA's leftover position, this would still read (10,20,30)
    expect(camera!.position.equals(pristinePosition)).toBe(true);
  });

  it('clamps a large dt under frameloop="demand" only, so a blend animates after an idle gap', async () => {
    const tickDt = async (frameloop: 'always' | 'demand') => {
      let core: KlippCore | undefined;
      const renderer = await create(
        <Klipp>
          <Reader onRead={(c) => (core = c)} />
          <VirtualCamera name="a" priority={10} />
        </Klipp>,
        { frameloop },
      );
      const tick = vi.spyOn(core!, 'tick');
      await renderer.advanceFrames(1, 2);
      return tick.mock.calls[0][0];
    };

    expect(await tickDt('demand')).toBeLessThan(1 / 29);
    expect(await tickDt('always')).toBe(2);
  });

  describe('mode', () => {
    it('"disabled": nothing runs — the real camera stays untouched, KlippCore never ticks', async () => {
      let core: KlippCore | undefined;
      let camera: PerspectiveCamera | undefined;

      function Scene() {
        const ref = useRef<Object3D>(null);
        camera = useThree((state) => state.camera as PerspectiveCamera);
        return (
          <Klipp mode="disabled">
            <Reader onRead={(c) => (core = c)} />
            <object3D ref={ref} position={[3, 4, 5]} />
            <VirtualCamera name="a" priority={10}>
              <HardLockToTarget target={ref} />
            </VirtualCamera>
          </Klipp>
        );
      }

      const renderer = await create(<Scene />);
      const cameraBefore = camera!.position.clone();
      await renderer.advanceFrames(3, 0.1);

      expect(camera!.position.equals(cameraBefore)).toBe(true);
      expect(core!.liveCameraId).toBeNull(); // tick() never ran, so arbitration never even settled
    });

    it('"standby": KlippCore keeps ticking (stays warm) but the real camera is left untouched', async () => {
      let core: KlippCore | undefined;
      let camera: PerspectiveCamera | undefined;

      function Scene() {
        const ref = useRef<Object3D>(null);
        camera = useThree((state) => state.camera as PerspectiveCamera);
        return (
          <Klipp mode="standby">
            <Reader onRead={(c) => (core = c)} />
            <object3D ref={ref} position={[3, 4, 5]} />
            <VirtualCamera name="a" priority={10}>
              <HardLockToTarget target={ref} />
            </VirtualCamera>
          </Klipp>
        );
      }

      const renderer = await create(<Scene />);
      const cameraBefore = camera!.position.clone();
      await renderer.advanceFrames(1, 0.1);

      // internal state is warm — the winning candidate settled, activeState reflects the real target
      expect(core!.liveCameraId).toBe('a');
      expect(core!.activeState!.position[0]).toBeCloseTo(3, 10);
      // ...but the actual r3f camera never got written to
      expect(camera!.position.equals(cameraBefore)).toBe(true);
    });

    it('"standby": still requests frames while a blend is in flight, so it actually stays warm under frameloop="demand" (real bug: it went idle instead)', async () => {
      let core: KlippCore | undefined;
      let invalidateSpy: ReturnType<typeof vi.spyOn> | undefined;

      function Scene({ bPriority }: { bPriority: number }) {
        const state = useThree();
        invalidateSpy = vi.spyOn(state, 'invalidate');
        return (
          <Klipp mode="standby">
            <Reader onRead={(c) => (core = c)} />
            <VirtualCamera name="a" priority={10}>
              <HardLockToTarget target={[0, 0, 0]} />
            </VirtualCamera>
            <VirtualCamera name="b" priority={bPriority}>
              <HardLockToTarget target={[10, 0, 0]} />
            </VirtualCamera>
          </Klipp>
        );
      }

      const renderer = await create(<Scene bPriority={5} />);
      await renderer.advanceFrames(1, 0.1); // 'a' first-ever: snaps live instantly, no blend

      await renderer.update(<Scene bPriority={30} />); // 'b' wins — blend into it starts (default 2s)
      invalidateSpy!.mockClear();
      await renderer.advanceFrames(1, 0.1); // mid-blend

      expect(core!.isBlending).toBe(true); // sanity: genuinely still blending
      expect(invalidateSpy).toHaveBeenCalled();
    });
  });

  describe('no active camera', () => {
    it("leaves the real camera alone until a VirtualCamera goes live (real bug: it snapped to tick()'s default CameraState on frame 1)", async () => {
      let camera: PerspectiveCamera | undefined;
      const scene = (active: boolean) => (
        <Klipp>
          <CameraReader onRead={(c) => (camera = c)} />
          <VirtualCamera name="a" priority={10} active={active}>
            <HardLockToTarget target={[3, 4, 5]} />
          </VirtualCamera>
        </Klipp>
      );

      const renderer = await create(scene(false));
      camera!.position.set(1, 2, 3);
      await renderer.advanceFrames(3, 0.1);
      expect(camera!.position.toArray()).toEqual([1, 2, 3]);

      await renderer.update(scene(true));
      await renderer.advanceFrames(1, 0.1);
      expect(camera!.position.toArray()).toEqual([3, 4, 5]);
    });

    it('a live camera swapping out for a higher-priority one in the same update keeps writing/blending, not frozen forever (real bug: liveCameraId briefly null from the forget(), indistinguishable from "never activated")', async () => {
      let camera: PerspectiveCamera | undefined;

      function Scene({ activeName }: { activeName: 'a' | 'b' }) {
        camera = useThree((state) => state.camera as PerspectiveCamera);
        return (
          <Klipp defaultBlend={{ curve: BlendCurves.linear, time: 1 }}>
            <VirtualCamera name="a" priority={10} active={activeName === 'a'}>
              <HardLockToTarget target={[0, 0, 0]} />
            </VirtualCamera>
            <VirtualCamera name="b" priority={20} active={activeName === 'b'}>
              <HardLockToTarget target={[10, 0, 0]} />
            </VirtualCamera>
          </Klipp>
        );
      }

      const renderer = await create(<Scene activeName="a" />);
      await renderer.advanceFrames(1, 0.1);
      expect(camera!.position.x).toBeCloseTo(0, 10); // 'a' live

      // 'a' unmounts (forgetting it as liveId) and 'b' mounts as the new winner, same commit — same
      // pattern as two <VirtualCamera>s trading places via an `active` prop flip
      await renderer.update(<Scene activeName="b" />);
      await renderer.advanceFrames(1, 0.1);

      expect(camera!.position.x).toBeGreaterThan(0); // must have actually started blending toward 'b'
    });
  });
});

it('passes defaultBlend and customBlends changes after mount to the core', async () => {
  let core: KlippCore | undefined;
  const scene = (time: number, to: string) => (
    <Klipp
      defaultBlend={{ curve: BlendCurves.linear, time }}
      customBlends={[{ from: 'a', to, blend: { curve: BlendCurves.cut, time: 0 } }]}>
      <Reader onRead={(c) => (core = c)} />
    </Klipp>
  );

  const renderer = await create(scene(1, 'b'));
  const setDefaultBlend = vi.spyOn(core!, 'setDefaultBlend');
  const setCustomBlends = vi.spyOn(core!, 'setCustomBlends');
  await renderer.update(scene(5, 'c'));

  expect(setDefaultBlend).toHaveBeenCalledWith({ curve: BlendCurves.linear, time: 5 });
  expect(setCustomBlends).toHaveBeenCalledWith([{ from: 'a', to: 'c', blend: { curve: BlendCurves.cut, time: 0 } }]);
});

function Reader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlipp().core);
  return null;
}

function CameraReader({ onRead }: { onRead: (camera: PerspectiveCamera) => void }) {
  onRead(useThree((state) => state.camera as PerspectiveCamera));
  return null;
}
