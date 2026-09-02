import { create } from '@react-three/test-renderer';
import { useEffect } from 'react';
import type { CameraHelper } from 'three';
import { Color, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { CameraState } from '../src/CameraState';
import { CameraFrustumHelper } from '../src/CameraFrustumHelper';
import { Klipp } from '../src/Klipp';
import { useVirtualCameraSlots, VirtualCamera } from '../src/VirtualCamera';

function Writer({ onWrite }: { onWrite: (out: CameraState) => void }) {
  const slots = useVirtualCameraSlots();
  useEffect(() => slots.registerBody((out) => onWrite(out)), [slots, onWrite]);
  return null;
}

describe('CameraFrustumHelper', () => {
  it('throws outside a <VirtualCamera> (via useVirtualCameraState)', async () => {
    await expect(create(<CameraFrustumHelper />)).rejects.toThrow(/within a <VirtualCamera>/);
  });

  it("syncs its scratch camera from the VirtualCamera's own CameraState (one frame behind — its own useFrame runs separately from <Klipp>'s driver)", async () => {
    let helper: CameraHelper | null = null;

    const renderer = await create(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <Writer
            onWrite={(out) => {
              out.position.set(1, 2, 3);
              out.fov = 70;
            }}
          />
          <CameraFrustumHelper ref={(h) => (helper = h)} />
        </VirtualCamera>
      </Klipp>,
    );
    // two SEPARATE single-frame advances — advanceFrames(N>1) runs one subscriber's N calls before the
    // next subscriber's first call (a test-renderer quirk, not real per-frame interleaving), so it can't
    // actually simulate "this frame reads what last frame just wrote"
    await renderer.advanceFrames(1, 0.1);
    await renderer.advanceFrames(1, 0.1);

    expect(helper).not.toBeNull();
    expect(helper!.camera.position.equals(new Vector3(1, 2, 3))).toBe(true);
    expect(helper!.camera.fov).toBe(70);
  });

  it('keeps visualizing an inactive (non-winning) camera — its own Body/Aim still run', async () => {
    let helper: CameraHelper | null = null;

    const renderer = await create(
      <Klipp>
        <VirtualCamera name="winner" priority={20} />
        <VirtualCamera name="loser" priority={10}>
          <Writer onWrite={(out) => out.position.set(5, 0, 0)} />
          <CameraFrustumHelper ref={(h) => (helper = h)} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.1);
    await renderer.advanceFrames(1, 0.1);

    expect(helper!.camera.position.equals(new Vector3(5, 0, 0))).toBe(true);
  });

  describe('color', () => {
    // one representative vertex from each of setColors' 5 line groups: frustum(0), cone(24), up(32),
    // target(38), cross(42) — see THREE.CameraHelper.setColors' own index comments
    function readGroupColors(helper: CameraHelper): Color[] {
      const attr = helper.geometry.getAttribute('color');
      return [0, 24, 32, 38, 42].map((i) => new Color(attr.getX(i), attr.getY(i), attr.getZ(i)));
    }

    it('applies one color to all 5 line groups', async () => {
      let helper: CameraHelper | null = null;

      await create(
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <CameraFrustumHelper color="lime" ref={(h) => (helper = h)} />
          </VirtualCamera>
        </Klipp>,
      );

      const lime = new Color('lime');
      for (const groupColor of readGroupColors(helper!)) {
        expect(groupColor.r).toBeCloseTo(lime.r, 5);
        expect(groupColor.g).toBeCloseTo(lime.g, 5);
        expect(groupColor.b).toBeCloseTo(lime.b, 5);
      }
    });

    it('omitting color leaves THREE.CameraHelper\'s own built-in colors untouched', async () => {
      let helper: CameraHelper | null = null;

      await create(
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <CameraFrustumHelper ref={(h) => (helper = h)} />
          </VirtualCamera>
        </Klipp>,
      );

      const [frustum, cone] = readGroupColors(helper!);
      const expectedFrustum = new Color(0xffaa00);
      const expectedCone = new Color(0xff0000);
      expect(frustum.r).toBeCloseTo(expectedFrustum.r, 5);
      expect(frustum.g).toBeCloseTo(expectedFrustum.g, 5);
      expect(frustum.b).toBeCloseTo(expectedFrustum.b, 5);
      expect(cone.r).toBeCloseTo(expectedCone.r, 5);
      expect(cone.g).toBeCloseTo(expectedCone.g, 5);
      expect(cone.b).toBeCloseTo(expectedCone.b, 5);
    });
  });

  describe('maxDistance', () => {
    it('caps the scratch camera\'s far plane below CameraState.far (default far is 1000)', async () => {
      let helper: CameraHelper | null = null;

      const renderer = await create(
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <CameraFrustumHelper ref={(h) => (helper = h)} />
          </VirtualCamera>
        </Klipp>,
      );
      await renderer.advanceFrames(1, 0.1);
      await renderer.advanceFrames(1, 0.1);

      expect(helper!.camera.far).toBe(1); // default maxDistance
    });

    it('a custom maxDistance is respected', async () => {
      let helper: CameraHelper | null = null;

      const renderer = await create(
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <CameraFrustumHelper maxDistance={25} ref={(h) => (helper = h)} />
          </VirtualCamera>
        </Klipp>,
      );
      await renderer.advanceFrames(1, 0.1);
      await renderer.advanceFrames(1, 0.1);

      expect(helper!.camera.far).toBe(25);
    });

    it('never exceeds the real CameraState.far, even when maxDistance is larger', async () => {
      let helper: CameraHelper | null = null;

      const renderer = await create(
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <Writer onWrite={(out) => (out.far = 5)} />
            <CameraFrustumHelper maxDistance={1000} ref={(h) => (helper = h)} />
          </VirtualCamera>
        </Klipp>,
      );
      await renderer.advanceFrames(1, 0.1);
      await renderer.advanceFrames(1, 0.1);

      expect(helper!.camera.far).toBe(5);
    });
  });

  describe('hideWhenLive', () => {
    it('hides the helper (removes it from the scene) while this VirtualCamera is live, by default', async () => {
      let helper: CameraHelper | null = null;

      const renderer = await create(
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <CameraFrustumHelper ref={(h) => (helper = h)} />
          </VirtualCamera>
        </Klipp>,
      );
      await renderer.advanceFrames(1, 0.1);

      expect(helper!.parent).toBeNull();
    });

    it('hideWhenLive={false} keeps it visible even while live', async () => {
      let helper: CameraHelper | null = null;

      const renderer = await create(
        <Klipp>
          <VirtualCamera name="a" priority={10}>
            <CameraFrustumHelper hideWhenLive={false} ref={(h) => (helper = h)} />
          </VirtualCamera>
        </Klipp>,
      );
      await renderer.advanceFrames(1, 0.1);

      expect(helper!.parent).not.toBeNull();
    });

    it('a non-live (losing) camera stays visible even with the default hideWhenLive', async () => {
      let helper: CameraHelper | null = null;

      const renderer = await create(
        <Klipp>
          <VirtualCamera name="winner" priority={20} />
          <VirtualCamera name="loser" priority={10}>
            <CameraFrustumHelper ref={(h) => (helper = h)} />
          </VirtualCamera>
        </Klipp>,
      );
      await renderer.advanceFrames(1, 0.1);

      expect(helper!.parent).not.toBeNull();
    });
  });

  it('disposes its geometry/material on unmount', async () => {
    let helper: CameraHelper | null = null;

    const renderer = await create(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <CameraFrustumHelper ref={(h) => (helper = h)} />
        </VirtualCamera>
      </Klipp>,
    );
    const disposeSpy = vi.spyOn(helper!, 'dispose');

    await renderer.unmount();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});
