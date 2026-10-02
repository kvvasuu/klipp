import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { Body } from '../../../src/react/body/Body';
import type { PositionComposerProps } from '../../../src/react/body/PositionComposer';
import type { PositionComposerBodyThree } from '../../../src/three/body/PositionComposerBodyThree';
import { expectPropsReachInstance, expectStopsWhenUnmounted, mountInCamera } from '../wiring';

describe('Body.PositionComposer', () => {
  it('registers a body that runs every frame', async () => {
    const target = new Object3D();
    target.position.set(0, 0, -20);
    const mounted = await mountInCamera(<Body.PositionComposer target={target} cameraDistance={10} />);
    await mounted.frame();
    expect(mounted.state.position[2]).toBeCloseTo(-10, 5);
  });

  it('passes every prop to the same body, on mount and when props change', async () => {
    await expectPropsReachInstance<PositionComposerProps, PositionComposerBodyThree>(
      (props, ref) => <Body.PositionComposer ref={ref} {...props} />,
      {
        target: new Object3D(),
        cameraDistance: 8,
        screenPosition: [0.1, 0.2],
        deadZone: [0.3, 0.3],
        damping: 0.4,
        maxSpeed: 5,
        hardLimit: [0.6, 0.6],
        radius: 1,
        size: [1, 2, 3],
        depthDeadZone: 2,
        lookaheadTime: 0.5,
        lookaheadSmoothing: 3,
        lookaheadIgnoreY: true,
      },
      {
        target: new Object3D(),
        cameraDistance: 12,
        screenPosition: [-0.1, 0],
        deadZone: [0.1, 0.2],
        damping: { into: 0.2, from: 1 },
        maxSpeed: 9,
        hardLimit: [0.8, 0.7],
        radius: 2,
        size: [4, 5, 6],
        depthDeadZone: 1,
        lookaheadTime: 0.2,
        lookaheadSmoothing: 1,
        lookaheadIgnoreY: false,
      },
    );
  });

  it('stops moving the camera once unmounted', async () => {
    await expectStopsWhenUnmounted((target) => <Body.PositionComposer target={target} cameraDistance={10} />);
  });

  it("eases in from VirtualCamera's initialState.position instead of snapping", async () => {
    const target = new Object3D();
    target.position.set(0, 0, -20);
    const mounted = await mountInCamera(<Body.PositionComposer target={target} cameraDistance={10} damping={0.5} />, {
      position: [0, 0, 100],
    });
    await mounted.frame(0.016);
    expect(mounted.state.position[2]).toBeLessThan(100);
    expect(mounted.state.position[2]).toBeGreaterThan(-10);
  });
});
