import { create } from '@react-three/test-renderer';
import { vec3, type Vec3 } from 'math';
import { createRef, type ReactNode, type RefObject } from 'react';
import { expect } from 'vitest';
import type { CameraState } from '../../src/core/CameraState';
import type { KlippThree } from '../../src/three/KlippThree';
import { Klipp } from '../../src/react/Klipp';
import { useKlipp } from '../../src/react/KlippContext';
import { VirtualCamera, type VirtualCameraProps } from '../../src/react/VirtualCamera';

function CoreReader({ onRead }: { onRead: (core: KlippThree) => void }) {
  onRead(useKlipp());
  return null;
}

/** Mounts `piece` in a single active camera. `state` is the camera's output after the frames advanced so far. */
export async function mountInCamera(piece: ReactNode, initialState?: VirtualCameraProps['initialState']) {
  let core: KlippThree | undefined;
  const scene = (child: ReactNode) => (
    <Klipp>
      <CoreReader onRead={(c) => (core = c)} />
      <VirtualCamera name="a" priority={10} initialState={initialState}>
        {child}
      </VirtualCamera>
    </Klipp>
  );
  const renderer = await create(scene(piece));
  return {
    renderer,
    get state(): CameraState {
      return core!.activeState!;
    },
    update: (child: ReactNode) => renderer.update(scene(child)),
    frame: (dt = 0.1) => renderer.advanceFrames(1, dt),
  };
}

/** Every prop reaches the same instance on mount and after a change. */
export async function expectPropsReachInstance<Props extends object, Instance>(
  render: (props: Props, ref: RefObject<Instance | null>) => ReactNode,
  first: Props,
  second: Props,
) {
  const ref = createRef<Instance>();
  const mounted = await mountInCamera(render(first, ref));
  const instance = ref.current;
  expect(instance).toMatchObject(first);

  await mounted.update(render(second, ref));
  expect(ref.current).toBe(instance);
  expect(instance).toMatchObject(second);
}

/**
 * The piece stops affecting the camera once unmounted. The target is a fixed point, read every frame, so a
 * piece left registered would follow the edit.
 */
export async function expectStopsWhenUnmounted(render: (target: Vec3) => ReactNode) {
  const target: Vec3 = [0, 0, -20];
  const mounted = await mountInCamera(render(target));
  await mounted.frame();
  await mounted.update(null);
  const position = vec3.clone(mounted.state.position);
  const rotation = [...mounted.state.quaternion];

  target[0] = 30;
  await mounted.frame();

  expect(mounted.state.position).toEqual(position);
  expect(mounted.state.quaternion).toEqual(rotation);
}
