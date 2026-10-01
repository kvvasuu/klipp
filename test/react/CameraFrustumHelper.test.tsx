import { vec3 } from 'math';
import { create } from '@react-three/test-renderer';
import { useEffect, type ReactNode } from 'react';
import type { CameraHelper } from 'three';
import { Color, type PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { CameraState } from '../../src/core/CameraState';
import { CameraFrustumHelper, type CameraFrustumHelperProps } from '../../src/react/CameraFrustumHelper';
import { Klipp } from '../../src/react/Klipp';
import { VirtualCamera } from '../../src/react/VirtualCamera';
import { useVirtualCamera } from '../../src/react/VirtualCameraContext';

function Writer({ onWrite }: { onWrite: (out: CameraState) => void }) {
  const { controller } = useVirtualCamera();
  useEffect(() => controller.registerBody((out) => onWrite(out)), [controller, onWrite]);
  return null;
}

/**
 * Mounts a helper in camera "a" and advances two separate frames: the helper's own useFrame reads the
 * state <Klipp> wrote the frame before, and advanceFrames(2) would run each subscriber twice in a row.
 */
async function mountHelper(
  props: CameraFrustumHelperProps = {},
  { live = true, writer }: { live?: boolean; writer?: ReactNode } = {},
) {
  let helper: CameraHelper | null = null;
  const renderer = await create(
    <Klipp>
      <VirtualCamera name="other" priority={live ? 0 : 20} />
      <VirtualCamera name="a" priority={10}>
        {writer}
        <CameraFrustumHelper
          {...props}
          ref={(h) => {
            helper = h;
          }}
        />
      </VirtualCamera>
    </Klipp>,
  );
  await renderer.advanceFrames(1, 0.1);
  await renderer.advanceFrames(1, 0.1);
  return { helper: helper!, camera: helper!.camera as PerspectiveCamera, renderer };
}

describe('CameraFrustumHelper', () => {
  it('throws outside a <VirtualCamera>', async () => {
    await expect(create(<CameraFrustumHelper />)).rejects.toThrow(/within a <VirtualCamera>/);
  });

  it("follows its VirtualCamera's own state, even when that camera isn't live", async () => {
    const { camera } = await mountHelper(
      {},
      {
        live: false,
        writer: (
          <Writer
            onWrite={(out) => {
              vec3.set(out.position, 1, 2, 3);
              out.fov = 70;
            }}
          />
        ),
      },
    );

    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(camera.fov).toBe(70);
  });

  it("applies color to all 5 line groups, and keeps CameraHelper's own colors without it", async () => {
    // one vertex from each of setColors' groups: frustum, cone, up, target, cross
    const groupColors = (helper: CameraHelper) => {
      const attr = helper.geometry.getAttribute('color');
      return [0, 24, 32, 38, 42].map((i) => new Color(attr.getX(i), attr.getY(i), attr.getZ(i)).getHex());
    };

    const lime = new Color('lime').getHex();
    expect(groupColors((await mountHelper({ color: 'lime' })).helper)).toEqual([lime, lime, lime, lime, lime]);
    expect(groupColors((await mountHelper()).helper).slice(0, 2)).toEqual([0xffaa00, 0xff0000]);
  });

  it('draws the frustum up to maxDistance (default 1), never past the real far plane', async () => {
    const far5 = <Writer onWrite={(out) => (out.far = 5)} />;

    expect((await mountHelper()).camera.far).toBe(1);
    expect((await mountHelper({ maxDistance: 25 })).camera.far).toBe(25);
    expect((await mountHelper({ maxDistance: 1000 }, { writer: far5 })).camera.far).toBe(5);
  });

  it('hides while its camera is live, unless hideWhenLive is false', async () => {
    expect((await mountHelper()).helper.parent).toBeNull();
    expect((await mountHelper({}, { live: false })).helper.parent).not.toBeNull();
    expect((await mountHelper({ hideWhenLive: false })).helper.parent).not.toBeNull();
  });

  it('disposes on unmount', async () => {
    const { helper, renderer } = await mountHelper();
    const dispose = vi.spyOn(helper, 'dispose');

    await renderer.unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
