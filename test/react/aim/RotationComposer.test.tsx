import { create } from '@react-three/test-renderer';
import { Object3D, Quaternion, Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { Aim } from '../../../src/react/aim/Aim';
import type { RotationComposerProps } from '../../../src/react/aim/RotationComposer';
import { Klipp } from '../../../src/react/Klipp';
import { VirtualCamera } from '../../../src/react/VirtualCamera';
import type { RotationComposerAim } from '../../../src/three/aim/RotationComposerAim';
import { expectPropsReachInstance, expectStopsWhenUnmounted, mountInCamera } from '../wiring';

afterEach(() => {
  document.body.replaceChildren();
});

describe('Aim.RotationComposer', () => {
  it('registers an aim that runs every frame', async () => {
    const target = new Object3D();
    target.position.set(10, 0, 0);
    const mounted = await mountInCamera(<Aim.RotationComposer target={target} />);
    await mounted.frame();
    const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().fromArray(mounted.state.quaternion));
    const toTarget = target.position
      .clone()
      .sub(new Vector3(...mounted.state.position))
      .normalize();
    expect(forward.dot(toTarget)).toBeCloseTo(1, 9);
  });

  it('passes every prop to the same aim, on mount and when props change', async () => {
    await expectPropsReachInstance<RotationComposerProps, RotationComposerAim>(
      (props, ref) => <Aim.RotationComposer ref={ref} {...props} />,
      {
        target: new Object3D(),
        screenPosition: [0.1, 0.2],
        deadZone: [0.3, 0.3],
        damping: 0.4,
        maxSpeed: 5,
        hardLimit: [0.6, 0.6],
        targetOffset: [0, 1, 0],
        radius: 1,
        size: [1, 2, 3],
        lookaheadTime: 0.5,
        lookaheadSmoothing: 3,
        lookaheadIgnoreY: true,
      },
      {
        target: new Object3D(),
        screenPosition: [-0.1, 0],
        deadZone: [0.1, 0.2],
        damping: { into: 0.2, from: 1 },
        maxSpeed: 9,
        hardLimit: [0.8, 0.7],
        targetOffset: [1, 0, 0],
        radius: 2,
        size: [4, 5, 6],
        lookaheadTime: 0.2,
        lookaheadSmoothing: 1,
        lookaheadIgnoreY: false,
      },
    );
  });

  it('stops turning the camera once unmounted', async () => {
    await expectStopsWhenUnmounted((target) => <Aim.RotationComposer target={target} />);
  });

  it("eases in from VirtualCamera's initialState.quaternion instead of snapping", async () => {
    const target = new Object3D();
    target.position.set(10, 0, -10);
    const mounted = await mountInCamera(<Aim.RotationComposer target={target} damping={0.5} />, {
      quaternion: [0, 0, 0, 1],
    });
    await mounted.frame(0.016);
    const rotation = new Quaternion().fromArray(mounted.state.quaternion);
    const forward = new Vector3(0, 0, -1).applyQuaternion(rotation);
    const toTarget = target.position
      .clone()
      .sub(new Vector3(...mounted.state.position))
      .normalize();
    expect(rotation.angleTo(new Quaternion())).toBeGreaterThan(0);
    expect(forward.dot(toTarget)).toBeLessThan(0.999);
  });

  it('draws the dead zone and hard limit only with debug', async () => {
    const zones = () => {
      const root = document.querySelector('canvas')?.parentElement?.querySelector('div');
      return Array.from(root?.children ?? [])
        .map((element) => element.className)
        .filter((className) => className !== 'klipp-debug-crosshair');
    };
    const scene = (debug: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <Aim.RotationComposer target={new Object3D()} deadZone={[0.4, 0.4]} hardLimit={[0.7, 0.7]} debug={debug} />
        </VirtualCamera>
      </Klipp>
    );
    const attach = { beforeReturn: (canvas: HTMLCanvasElement) => document.body.appendChild(canvas) };

    const plain = await create(scene(false), attach);
    await plain.advanceFrames(1, 0.1);
    expect(zones()).toEqual([]);
    await plain.unmount();

    const debug = await create(scene(true), attach);
    await debug.advanceFrames(1, 0.1);
    expect(zones()).toEqual(['klipp-debug-hardlimit', 'klipp-debug-deadzone']);
  });
});
