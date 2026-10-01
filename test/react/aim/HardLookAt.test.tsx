import { Object3D, PerspectiveCamera, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { Aim } from '../../../src/react/aim/Aim';
import { Body } from '../../../src/react/body/Body';
import type { HardLookAtAim } from '../../../src/three/aim/HardLookAtAim';
import { expectPropsReachInstance, expectStopsWhenUnmounted, mountInCamera } from '../wiring';

describe('Aim.HardLookAt', () => {
  it('registers an aim that runs every frame, after the Body', async () => {
    const target = new Object3D();
    target.position.set(5, -1, 0);
    const mounted = await mountInCamera(
      <>
        <Aim.HardLookAt target={target} />
        <Body.HardLockToTarget target={[1, 2, 3]} />
      </>,
    );
    await mounted.frame();

    const reference = new PerspectiveCamera();
    reference.position.set(1, 2, 3);
    reference.lookAt(5, -1, 0);
    expect(new Quaternion().fromArray(mounted.state.quaternion).angleTo(reference.quaternion)).toBeLessThan(1e-6);
  });

  it('passes the target to the same aim, on mount and when it changes', async () => {
    await expectPropsReachInstance<object, HardLookAtAim>(
      (props, ref) => <Aim.HardLookAt ref={ref} {...props} />,
      { target: new Object3D() },
      { target: new Object3D() },
    );
  });

  it('stops turning the camera once unmounted', async () => {
    await expectStopsWhenUnmounted((target) => <Aim.HardLookAt target={target} />);
  });
});
