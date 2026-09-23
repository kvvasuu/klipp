import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Camera, PerspectiveCamera } from 'three';
import { copyCameraState, copyCameraStateFromCamera, createCameraState, type CameraState } from './CameraState';
import { KlippContext, useKlipp, type FrameUpdate, type KlippContextValue } from './KlippContext';
import { KlippCore, type KlippCoreOptions } from './KlippCore';
import { useCameraTransitionEvent, type CameraTransitionEventProps } from './useCameraTransitionEvent';

/** `three` can load twice in monorepos; `instanceof` then fails. Use the camera's own flag instead. */
function isPerspectiveCamera(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true;
}

/** Cache the original config per camera instance so a later mount does not inherit stale state. */
const pristineCameraStates = new WeakMap<Camera, CameraState>();

/** Bound `dt` under `frameloop="demand"` so an idle gap does not jump the blend forward in one frame. */
const DEMAND_MODE_MAX_DELTA = 1 / 30;

/** Driver mode controlling updates and camera writes. */
export type KlippMode = 'enabled' | 'standby' | 'disabled';

export type KlippProps = KlippCoreOptions & {
  children?: ReactNode;
  camera?: Camera;
  /** See `KlippMode`. */
  mode?: KlippMode;
};

/** Provides the camera driver and writes its output to the active camera. */
export function Klipp({ children, defaultBlend, customBlends, camera: cameraProp, mode = 'enabled' }: KlippProps) {
  const [core] = useState(() => new KlippCore({ defaultBlend, customBlends }));
  const [updates] = useState(() => new Set<FrameUpdate>());

  const defaultCamera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const camera = cameraProp ?? defaultCamera;

  const registerUpdate = useCallback(
    (update: FrameUpdate) => {
      updates.add(update);
      return () => updates.delete(update);
    },
    [updates],
  );

  useEffect(() => core.setDefaultBlend(defaultBlend), [core, defaultBlend]);
  useEffect(() => core.setCustomBlends(customBlends), [core, customBlends]);

  // Seed each virtual camera with the camera's current live configuration.
  const [initialCameraState] = useState(() => {
    let pristine = pristineCameraStates.get(camera);
    if (!pristine) {
      pristine = createCameraState();
      if (isPerspectiveCamera(camera)) copyCameraStateFromCamera(pristine, camera);
      pristineCameraStates.set(camera, pristine);
    }
    return pristine;
  });

  const value = useMemo<KlippContextValue>(
    () => ({ core, registerUpdate, initialCameraState }),
    [core, registerUpdate, initialCameraState],
  );

  // Track the last applied result so demand-loop invalidation only fires when the camera actually moves.
  const [previousResult] = useState(() => createCameraState());
  const settledRef = useRef(false);

  useFrame((state, rawDelta) => {
    if (mode === 'disabled') return;

    // `frameloop="demand"` can see long idle gaps; keep the blend bounded to a normal step.
    const delta = state.frameloop === 'demand' ? Math.min(rawDelta, DEMAND_MODE_MAX_DELTA) : rawDelta;

    // Keep `=== true` semantics: some writers return a real boolean value even when typed as void.
    let stillInFlight = false;
    for (const update of updates) {
      if (update(delta) === true) stillInFlight = true;
    }
    const result = core.tick(delta);
    if (mode === 'standby') {
      // Keep demand rendering active while the driver remains warm.
      if (stillInFlight || core.isBlending) state.invalidate();
      return; // stays warm, but never touches the real camera
    }

    if (!core.hasEverActivated) {
      // Do not write the untouched initial state to the real camera.
      if (stillInFlight) state.invalidate();
      return;
    }

    const transformUnchanged =
      settledRef.current &&
      result.position.equals(previousResult.position) &&
      result.quaternion.equals(previousResult.quaternion);
    // Lens changes also cover view-offset changes.
    const lensUnchanged =
      settledRef.current &&
      result.fov === previousResult.fov &&
      result.near === previousResult.near &&
      result.far === previousResult.far &&
      result.viewOffset[0] === previousResult.viewOffset[0] &&
      result.viewOffset[1] === previousResult.viewOffset[1];

    if (!transformUnchanged || !lensUnchanged) {
      copyCameraState(previousResult, result);
      settledRef.current = true;

      if (!transformUnchanged) {
        camera.position.copy(result.position);
        camera.quaternion.copy(result.quaternion);
      }
      if (!lensUnchanged && isPerspectiveCamera(camera)) {
        camera.fov = result.fov;
        camera.near = result.near;
        camera.far = result.far;
        if (result.viewOffset[0] !== 0 || result.viewOffset[1] !== 0) {
          // three.js uses the opposite horizontal offset convention.
          camera.setViewOffset(
            size.width,
            size.height,
            -result.viewOffset[0] * (size.width / 2),
            result.viewOffset[1] * (size.height / 2),
            size.width,
            size.height,
          );
        } else {
          camera.clearViewOffset();
        }
      }
    }

    if (!transformUnchanged || !lensUnchanged || stillInFlight) {
      state.invalidate();
    }
  });

  return <KlippContext.Provider value={value}>{children}</KlippContext.Provider>;
}

export type KlippEventsProps = CameraTransitionEventProps;

/** Listen to transitions from every camera in the nearest `Klipp`. */
export function KlippEvents({ onActivated, onDeactivated, onBlendCreated, onBlendFinished, onCut }: KlippEventsProps) {
  const { core } = useKlipp();

  useCameraTransitionEvent(core, 'activated', onActivated);
  useCameraTransitionEvent(core, 'deactivated', onDeactivated);
  useCameraTransitionEvent(core, 'blendCreated', onBlendCreated);
  useCameraTransitionEvent(core, 'blendFinished', onBlendFinished);
  useCameraTransitionEvent(core, 'cut', onCut);

  return null;
}

Klipp.Events = KlippEvents;
