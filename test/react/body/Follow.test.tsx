import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { BindingModes } from '../../../src/core/body/BindingModes';
import { Body } from '../../../src/react/body/Body';
import type { FollowBodyThree } from '../../../src/three/body/FollowBodyThree';
import { expectPropsReachInstance, expectStopsWhenUnmounted, mountInCamera } from '../wiring';

describe('Body.Follow', () => {
  it('registers a body that runs every frame', async () => {
    const target = new Object3D();
    target.position.set(3, 0, 0);
    const mounted = await mountInCamera(<Body.Follow target={target} offset={[0, 2, 5]} />);
    await mounted.frame();
    expect(mounted.state.position).toEqual([3, 2, 5]);
  });

  it('passes every prop to the same body, on mount and when props change', async () => {
    await expectPropsReachInstance<object, FollowBodyThree>(
      (props, ref) => <Body.Follow ref={ref} {...props} />,
      { target: new Object3D(), offset: [0, 3, 8], damping: 0.5, bindingMode: BindingModes.worldSpace, maxSpeed: 4 },
      {
        target: new Object3D(),
        offset: [1, 2, 3],
        damping: { into: 0.2, from: 1 },
        bindingMode: BindingModes.lockToTargetNoRoll,
        maxSpeed: 8,
      },
    );
  });

  it('stops moving the camera once unmounted', async () => {
    await expectStopsWhenUnmounted((target) => <Body.Follow target={target} offset={[0, 0, 5]} />);
  });

  it("eases in from VirtualCamera's initialState.position instead of snapping", async () => {
    const target = new Object3D();
    target.position.set(100, 0, 0);
    const mounted = await mountInCamera(<Body.Follow target={target} offset={[0, 0, 0]} damping={0.5} />, {
      position: [-100, 0, 0],
    });
    await mounted.frame(0.016);
    expect(mounted.state.position[0]).toBeGreaterThan(-100);
    expect(mounted.state.position[0]).toBeLessThan(100);
  });
});
