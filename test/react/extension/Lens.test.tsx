import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import type { LensExtension } from '../../../src/core/extension/LensExtension';
import { Extension } from '../../../src/react/extension/Extension';
import type { LensProps } from '../../../src/react/extension/Lens';
import { expectPropsReachInstance, mountInCamera } from '../wiring';

describe('Extension.Lens', () => {
  it('registers an extension that sets the lens every frame, leaving unset fields alone', async () => {
    const mounted = await mountInCamera(<Extension.Lens fov={75} />, { near: 0.5, far: 200 });
    await mounted.frame();
    expect([mounted.state.fov, mounted.state.near, mounted.state.far]).toEqual([75, 0.5, 200]);
  });

  it('passes every prop to the same extension, on mount and when props change', async () => {
    await expectPropsReachInstance<LensProps, LensExtension>(
      (props, ref) => <Extension.Lens ref={ref} {...props} />,
      {
        fov: 40,
        near: 0.2,
        far: 300,
        fovDamping: 0.5,
        nearDamping: 0.1,
        farDamping: 0.2,
        fovMaxSpeed: 5,
        nearMaxSpeed: 1,
        farMaxSpeed: 2,
      },
      {
        fov: 70,
        near: 0.4,
        far: 900,
        fovDamping: { into: 0.2, from: 1 },
        nearDamping: 0.3,
        farDamping: 0.4,
        fovMaxSpeed: 9,
        nearMaxSpeed: 3,
        farMaxSpeed: 4,
      },
    );
  });

  it('stops changing the lens once unmounted', async () => {
    const ref = createRef<LensExtension>();
    const mounted = await mountInCamera(<Extension.Lens ref={ref} fov={60} />);
    await mounted.frame();
    const lens = ref.current!;
    await mounted.update(null);

    lens.fov = 20;
    await mounted.frame();

    expect(mounted.state.fov).toBe(60);
  });
});
