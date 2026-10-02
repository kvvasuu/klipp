import { createRef } from 'react';
import { Object3D, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { Aim } from '../../../src/react/aim/Aim';
import type { RotateWithFollowTargetAimThree } from '../../../src/three/aim/RotateWithFollowTargetAimThree';
import { expectPropsReachInstance, mountInCamera } from '../wiring';

function rotatedTarget(y: number) {
  const target = new Object3D();
  target.rotation.set(0, y, 0);
  target.updateMatrixWorld();
  return target;
}

describe('Aim.RotateWithFollowTarget', () => {
  it('registers an aim that runs every frame', async () => {
    const target = rotatedTarget(1);
    const mounted = await mountInCamera(<Aim.RotateWithFollowTarget target={target} />);
    await mounted.frame();
    expect(new Quaternion().fromArray(mounted.state.quaternion).angleTo(target.quaternion)).toBeLessThan(1e-9);
  });

  it('passes every prop to the same aim, on mount and when props change', async () => {
    await expectPropsReachInstance<object, RotateWithFollowTargetAimThree>(
      (props, ref) => <Aim.RotateWithFollowTarget ref={ref} {...props} />,
      { target: new Object3D(), damping: 0.5, maxSpeed: 4 },
      { target: new Object3D(), damping: { into: 0.2, from: 1 }, maxSpeed: 8 },
    );
  });

  it('stops turning the camera once unmounted', async () => {
    const target = rotatedTarget(1);
    const mounted = await mountInCamera(<Aim.RotateWithFollowTarget ref={createRef()} target={target} />);
    await mounted.frame();
    await mounted.update(null);
    const before = [...mounted.state.quaternion];

    target.rotation.set(0, -1, 0);
    target.updateMatrixWorld();
    await mounted.frame();

    expect(mounted.state.quaternion).toEqual(before);
  });

  it("eases in from VirtualCamera's initialState.quaternion instead of snapping", async () => {
    const target = rotatedTarget(Math.PI / 2);
    const mounted = await mountInCamera(<Aim.RotateWithFollowTarget target={target} damping={0.5} />, {
      quaternion: [0, 0, 0, 1],
    });
    await mounted.frame(0.016);
    const rotation = new Quaternion().fromArray(mounted.state.quaternion);
    expect(rotation.angleTo(new Quaternion())).toBeGreaterThan(0);
    expect(rotation.angleTo(target.quaternion)).toBeGreaterThan(0.01);
  });
});
