import { useFrame, useThree } from '@react-three/fiber';
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { PerspectiveCamera, type Camera } from 'three';
import { copyCameraState, createCameraState } from './CameraState';
import { KlippCore, type KlippCoreOptions } from './KlippCore';

/** A per-frame update — used by `<VirtualCamera>` to drive its own Body/Aim/Noise. */
export type FrameUpdate = (dt: number) => void;

type KlippContextValue = {
  core: KlippCore;
  registerUpdate: (update: FrameUpdate) => () => void;
};

const KlippContext = createContext<KlippContextValue | null>(null);

/** Cinemachine's `StandbyUpdate` concept, applied to the whole driver:
 *  - `'enabled'` (default) — update → tick → write onto the real camera, as normal.
 *  - `'standby'` — update → tick still run every frame (blends/damping stay warm, so handing control
 *    back later resumes smoothly) but the real camera is left untouched — for a temporary hand-off to
 *    some other camera controller sharing the same camera object.
 *  - `'disabled'` — nothing runs at all, zero cost — for longer stretches where klipp isn't driving
 *    anything and a smooth resume doesn't matter. */
export type KlippMode = 'enabled' | 'standby' | 'disabled';

export type KlippProps = KlippCoreOptions & {
  children?: ReactNode;
  camera?: Camera;
  /** See `KlippMode`. Default `'enabled'`. */
  mode?: KlippMode;
};

/**
 * Root provider AND driver — owns the subtree's `KlippCore`. Every frame: runs every registered
 * `VirtualCamera`'s update, then `core.tick(dt)`, then copies the composited result onto the real r3f
 * camera. Must be rendered inside a `<Canvas>`, since it drives itself via `useFrame`.
 *
 * `defaultBlend`/`customBlends` are captured once on mount — changing them later has no effect.
 */
export function Klipp({ children, defaultBlend, customBlends, camera: cameraProp, mode = 'enabled' }: KlippProps) {
  const [core] = useState(() => new KlippCore({ defaultBlend, customBlends }));
  const [updates] = useState(() => new Set<FrameUpdate>());
  const defaultCamera = useThree((state) => state.camera);
  const camera = cameraProp ?? defaultCamera;

  const registerUpdate = useCallback(
    (update: FrameUpdate) => {
      updates.add(update);
      return () => updates.delete(update);
    },
    [updates],
  );

  const value = useMemo<KlippContextValue>(() => ({ core, registerUpdate }), [core, registerUpdate]);

  // tracks last frame's result to detect actual movement — frameloop="demand" needs invalidate() calls
  const [previousResult] = useState(() => createCameraState());
  const settledRef = useRef(false);

  useFrame((state, delta) => {
    if (mode === 'disabled') return;

    for (const update of updates) update(delta);
    const result = core.tick(delta);
    if (mode === 'standby') return; // stays warm, but never touches the real camera

    const transformUnchanged =
      settledRef.current &&
      result.position.equals(previousResult.position) &&
      result.quaternion.equals(previousResult.quaternion);
    // matrixWorld updates regardless of this check — only lens fields need updateProjectionMatrix()
    const lensUnchanged =
      settledRef.current &&
      result.fov === previousResult.fov &&
      result.near === previousResult.near &&
      result.far === previousResult.far;

    if (!transformUnchanged || !lensUnchanged) {
      copyCameraState(previousResult, result);
      settledRef.current = true;
      state.invalidate();

      if (!transformUnchanged) {
        camera.position.copy(result.position);
        camera.quaternion.copy(result.quaternion);
      }
      if (!lensUnchanged && camera instanceof PerspectiveCamera) {
        camera.fov = result.fov;
        camera.near = result.near;
        camera.far = result.far;
        camera.updateProjectionMatrix();
      }
    }
  });

  return <KlippContext.Provider value={value}>{children}</KlippContext.Provider>;
}

function useKlippContext(): KlippContextValue {
  const context = use(KlippContext);
  if (!context) throw new Error('useKlippCore must be used within a <Klipp> provider.');
  return context;
}

/** The current subtree's `KlippCore` — throws outside a `<Klipp>` provider. */
export function useKlippCore(): KlippCore {
  return useKlippContext().core;
}

/** Registers a per-frame update, run every frame before `core.tick(dt)`. Returns an unregister function. */
export function useKlippUpdateRegistry(): (update: FrameUpdate) => () => void {
  return useKlippContext().registerUpdate;
}
