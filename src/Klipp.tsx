import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Camera, PerspectiveCamera } from 'three';
import { copyCameraState, copyCameraStateFromCamera, createCameraState, type CameraState } from './CameraState';
import { KlippContext, useKlipp, type FrameUpdate, type KlippContextValue } from './KlippContext';
import { KlippCore, type CameraTransitionEventMap, type KlippCoreOptions } from './KlippCore';
import { useCameraTransitionEvent } from './useCameraTransitionEvent';

/** `instanceof PerspectiveCamera` silently fails whenever two copies of the `three` module end up
 *  loaded (a real risk in monorepos/certain bundler setups, not just a test-environment quirk) — each
 *  copy's `PerspectiveCamera` is a DIFFERENT class, so an instance from one never passes `instanceof`
 *  against the other's constructor. `isPerspectiveCamera` is an own-instance boolean three.js sets in
 *  the constructor specifically to survive this — a plain property read, no prototype chain involved. */
function isPerspectiveCamera(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true;
}

/** Keyed by camera object, not `<Klipp>` mount - a fresh capture per mount would inherit wherever a
 *  PREVIOUS `<Klipp>` sharing this camera last left it, not the camera's true original config. */
const pristineCameraStates = new WeakMap<Camera, CameraState>();

/** Cap on the `dt` passed to any update/`tick()` this frame under `frameloop="demand"` — see the
 *  `useFrame` callback below. Sized so the FIRST frame after an idle gap advances a blend by an
 *  imperceptible sliver rather than visibly jumping ahead. Only applied under `"demand"`: there, EVERY
 *  frame can legitimately follow an arbitrarily long gap (that's the point of the mode), whereas under
 *  `"always"` a large `dt` almost always means a display genuinely running slow — capping it there would
 *  silently play the whole scene in slow motion instead of protecting against anything. */
const DEMAND_MODE_MAX_DELTA = 1 / 30;

/** Applies to the whole driver:
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
 * `defaultBlend`/`customBlends` are reactive — editing either prop takes effect on the next blend,
 * no remount needed.
 */
export function Klipp({ children, defaultBlend, customBlends, camera: cameraProp, mode = 'enabled' }: KlippProps) {
  const [core] = useState(() => new KlippCore({ defaultBlend, customBlends }));
  const [updates] = useState(() => new Set<FrameUpdate>());

  const defaultCamera = useThree((state) => state.camera);
  const size = useThree((state) => state.size); // for setViewOffset — needs the ACTUAL canvas size
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

  // seeds every <VirtualCamera>'s own state (see VirtualCamera.tsx) with whatever the real camera was
  // already configured as (e.g. <Canvas camera={{ fov: 75 }}>)
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

  // tracks last frame's result to detect actual movement — frameloop="demand" needs invalidate() calls
  const [previousResult] = useState(() => createCameraState());
  const settledRef = useRef(false);

  useFrame((state, rawDelta) => {
    if (mode === 'disabled') return;

    // r3f's clock doesn't pause under frameloop="demand" — the first frame after an idle gap (e.g.
    // waiting for a click) otherwise gets a `delta` spanning the WHOLE gap, blowing through an entire
    // blend in one tick instead of animating it
    const delta = state.frameloop === 'demand' ? Math.min(rawDelta, DEMAND_MODE_MAX_DELTA) : rawDelta;

    // `=== true`, not plain truthiness — see the matching comment in VirtualCameraController.update
    let stillInFlight = false;
    for (const update of updates) {
      if (update(delta) === true) stillInFlight = true;
    }
    const result = core.tick(delta);
    if (mode === 'standby') {
      // keeps frameloop="demand" flowing while there's still work to finish, so "stays warm" actually
      // holds even when nothing else happens to be invalidating — without this, the loop goes idle and
      // whatever was mid-transition when standby started stays frozen there until something else does
      if (stillInFlight || core.isBlending) state.invalidate();
      return; // stays warm, but never touches the real camera
    }

    if (!core.hasEverActivated) {
      // no VirtualCamera has EVER won arbitration — tick() is just returning its untouched default
      // CameraState (origin, identity, fov 50), not a real shot. Writing that onto the real camera would
      // silently snap it away from wherever the scene/user actually placed it. Deliberately NOT
      // `core.liveCameraId === null` — that's also true for one extra tick right after a live camera gets
      // forgotten mid-transition (its <VirtualCamera> unregistering as a new one takes over), where
      // tick()'s output IS already a real, in-progress blend worth rendering and continuing to invalidate.
      if (stillInFlight) state.invalidate();
      return;
    }

    const transformUnchanged =
      settledRef.current &&
      result.position.equals(previousResult.position) &&
      result.quaternion.equals(previousResult.quaternion);
    // matrixWorld updates regardless of this check — only lens fields need updateProjectionMatrix().
    // viewOffset lives here too, not in a separate flag — both setViewOffset/clearViewOffset already
    // call updateProjectionMatrix() themselves, same as the fov/near/far path needs
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
          // X negated - see CameraState.ts's applyCameraState/copyCameraStateFromCamera comment
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

export type KlippEventsProps = {
  onActivated?: (event: CameraTransitionEventMap['activated']) => void;
  onDeactivated?: (event: CameraTransitionEventMap['deactivated']) => void;
  onBlendCreated?: (event: CameraTransitionEventMap['blendCreated']) => void;
  onBlendFinished?: (event: CameraTransitionEventMap['blendFinished']) => void;
  onCut?: (event: CameraTransitionEventMap['cut']) => void;
};

/** Opt-in - place inside a `<Klipp>` to hear every `CameraTransitionEventMap` transition across ALL its
 *  cameras (contrast `VirtualCamera.Events`, scoped to one camera). Also available as `Klipp.Events`. */
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
