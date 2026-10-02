import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { Body } from '../../../src/react/body/Body';
import type { HardLockToTargetBodyThree } from '../../../src/three/body/HardLockToTargetBodyThree';
import { expectPropsReachInstance, expectStopsWhenUnmounted, mountInCamera } from '../wiring';

describe('Body.HardLockToTarget', () => {
  it('registers a body that runs every frame', async () => {
    const target = new Object3D();
    target.position.set(3, 0, 0);
    const mounted = await mountInCamera(<Body.HardLockToTarget target={target} />);
    await mounted.frame();
    expect(mounted.state.position).toEqual([3, 0, 0]);
  });

  it('passes every prop to the same body, on mount and when props change', async () => {
    await expectPropsReachInstance<object, HardLockToTargetBodyThree>(
      (props, ref) => <Body.HardLockToTarget ref={ref} {...props} />,
      { target: new Object3D(), damping: 0.5, maxSpeed: 4 },
      { target: new Object3D(), damping: { into: 0.2, from: 1 }, maxSpeed: 8 },
    );
  });

  it('stops moving the camera once unmounted', async () => {
    await expectStopsWhenUnmounted((target) => <Body.HardLockToTarget target={target} />);
  });
});
