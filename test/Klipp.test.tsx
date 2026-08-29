import { renderHook } from '@testing-library/react';
import { create } from '@react-three/test-renderer';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Klipp, useKlippCore } from '../src/Klipp';
import { KlippCore } from '../src/KlippCore';
import { VirtualCamera, useVirtualCameraSlots } from '../src/VirtualCamera';
import { HardLockToTarget } from '../src/body/HardLockToTarget';
import { useEffect, useRef } from 'react';
import type { Object3D } from 'three';

describe('Klipp / useKlippCore', () => {
  it('throws when used outside a <Klipp> provider', () => {
    // no Canvas/renderer needed: this throws before touching anything r3f-specific
    expect(() => renderHook(() => useKlippCore())).toThrow(/within a <Klipp> provider/);
  });

  it('provides a KlippCore instance to consumers', async () => {
    let core: KlippCore | undefined;
    function Reader() {
      core = useKlippCore();
      return null;
    }

    await create(
      <Klipp>
        <Reader />
      </Klipp>,
    );

    expect(core).toBeInstanceOf(KlippCore);
  });

  it('the instance is stable across re-renders', async () => {
    const seen: KlippCore[] = [];
    function Reader() {
      seen.push(useKlippCore());
      return null;
    }

    const renderer = await create(
      <Klipp>
        <Reader />
      </Klipp>,
    );
    await renderer.update(
      <Klipp>
        <Reader />
      </Klipp>,
    );

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });

  it('two separate <Klipp> trees get independent instances', async () => {
    let coreA: KlippCore | undefined;
    let coreB: KlippCore | undefined;

    await create(
      <Klipp>
        <Reader onRead={(c) => (coreA = c)} />
      </Klipp>,
    );
    await create(
      <Klipp>
        <Reader onRead={(c) => (coreB = c)} />
      </Klipp>,
    );

    expect(coreA).toBeInstanceOf(KlippCore);
    expect(coreB).toBeInstanceOf(KlippCore);
    expect(coreA).not.toBe(coreB);
  });

  it('copies the composited CameraState onto the real r3f camera — the actual end of the chain', async () => {
    let camera: PerspectiveCamera | undefined;
    function CameraReader() {
      camera = useThree((state) => state.camera as PerspectiveCamera);
      return null;
    }

    function Scene() {
      const targetRef = useRef<Object3D>(null);
      return (
        <Klipp>
          <CameraReader />
          <object3D ref={targetRef} position={[3, 4, 5]} />
          <VirtualCamera name="a" priority={10}>
            <HardLockToTarget target={targetRef} />
          </VirtualCamera>
        </Klipp>
      );
    }

    const renderer = await create(<Scene />);
    await renderer.advanceFrames(1, 0.1);

    expect(camera!.position.x).toBeCloseTo(3, 10);
    expect(camera!.position.y).toBeCloseTo(4, 10);
    expect(camera!.position.z).toBeCloseTo(5, 10);
  });

  it("writes fov/near/far onto the real r3f camera — the isPerspectiveCamera-gated path actually fires", async () => {
    let camera: PerspectiveCamera | undefined;
    function CameraReader() {
      camera = useThree((state) => state.camera as PerspectiveCamera);
      return null;
    }
    function LensWriter() {
      const slots = useVirtualCameraSlots();
      useEffect(
        () =>
          slots.registerAim((out) => {
            out.fov = 35;
            out.near = 1;
            out.far = 200;
          }),
        [slots],
      );
      return null;
    }

    const renderer = await create(
      <Klipp>
        <CameraReader />
        <VirtualCamera name="a" priority={10}>
          <LensWriter />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);

    expect(camera!.fov).toBe(35);
    expect(camera!.near).toBe(1);
    expect(camera!.far).toBe(200);
  });

  describe('viewOffset', () => {
    function ViewOffsetWriter({ x, y }: { x: number; y: number }) {
      const slots = useVirtualCameraSlots();
      useEffect(
        () =>
          slots.registerAim((out) => {
            out.viewOffsetX = x;
            out.viewOffsetY = y;
          }),
        [slots, x, y],
      );
      return null;
    }

    it('a nonzero viewOffsetX/Y calls camera.setViewOffset with it, in canvas pixel size', async () => {
      let camera: PerspectiveCamera | undefined;
      function CameraReader() {
        camera = useThree((state) => state.camera as PerspectiveCamera);
        return null;
      }

      const renderer = await create(
        <Klipp>
          <CameraReader />
          <VirtualCamera name="a" priority={10}>
            <ViewOffsetWriter x={80} y={-30} />
          </VirtualCamera>
        </Klipp>,
      );
      await renderer.advanceFrames(1, 0.1);

      expect(camera!.view?.enabled).toBe(true);
      expect(camera!.view?.offsetX).toBe(80);
      expect(camera!.view?.offsetY).toBe(-30);
    });

    it('viewOffsetX/Y = 0 (default) never calls setViewOffset at all', async () => {
      let camera: PerspectiveCamera | undefined;
      function CameraReader() {
        camera = useThree((state) => state.camera as PerspectiveCamera);
        return null;
      }

      const renderer = await create(
        <Klipp>
          <CameraReader />
          <VirtualCamera name="a" priority={10}>
            <HardLockToTarget target={[1, 2, 3]} />
          </VirtualCamera>
        </Klipp>,
      );
      await renderer.advanceFrames(1, 0.1);

      expect(camera!.view).toBeNull();
    });

    it('going back to 0 after a nonzero offset calls clearViewOffset', async () => {
      let camera: PerspectiveCamera | undefined;
      function CameraReader() {
        camera = useThree((state) => state.camera as PerspectiveCamera);
        return null;
      }

      const scene = (x: number) => (
        <Klipp>
          <CameraReader />
          <VirtualCamera name="a" priority={10}>
            <ViewOffsetWriter x={x} y={0} />
          </VirtualCamera>
        </Klipp>
      );

      const renderer = await create(scene(80));
      await renderer.advanceFrames(1, 0.1);
      expect(camera!.view?.enabled).toBe(true);

      await renderer.update(scene(0));
      await renderer.advanceFrames(1, 0.1);
      expect(camera!.view?.enabled).toBe(false);
    });
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

  describe('dt clamp under frameloop="demand"', () => {
    it('clamps a huge single-frame dt so a blend animates instead of snapping to completion', async () => {
      let core: KlippCore | undefined;
      function Reader() {
        core = useKlippCore();
        return null;
      }

      const renderer = await create(
        <Klipp>
          <Reader />
          <VirtualCamera name="a" priority={10} />
        </Klipp>,
        { frameloop: 'demand' },
      );
      const tickSpy = vi.spyOn(core!, 'tick');

      await renderer.advanceFrames(1, 2); // simulates waking up after a 2s idle gap
      const calledDt = tickSpy.mock.calls[0]?.[0];
      expect(calledDt).toBeLessThan(1 / 29); // clamped — nowhere near the raw 2s
    });

    it('does NOT clamp under the default frameloop="always" — dt stays accurate even when large', async () => {
      let core: KlippCore | undefined;
      function Reader() {
        core = useKlippCore();
        return null;
      }

      const renderer = await create(
        <Klipp>
          <Reader />
          <VirtualCamera name="a" priority={10} />
        </Klipp>,
      ); // default frameloop="always"
      const tickSpy = vi.spyOn(core!, 'tick');

      await renderer.advanceFrames(1, 2);
      expect(tickSpy).toHaveBeenCalledWith(2);
    });
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
      expect(core!.activeState!.position.x).toBeCloseTo(3, 10);
      // ...but the actual r3f camera never got written to
      expect(camera!.position.equals(cameraBefore)).toBe(true);
    });
  });
});

function Reader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}
