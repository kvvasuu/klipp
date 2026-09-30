import type { CameraState } from './CameraState';
import {
  blendTargetId,
  createBlendState,
  forgetBlendCandidate,
  setBlendTarget,
  tickBlend,
  type BlendState,
} from './blend/blend';
import { BlendCurves } from './blend/BlendCurves';
import { resolveBlendDefinition, type BlendDefinition, type CustomBlend } from './blend/BlendDefinition';
import { BlendHints } from './blend/BlendHints';

export type VirtualCameraConfig = {
  id: string;
  priority: number;
  /** Mutable live state read by the core. */
  state: CameraState;
  /** Blend hints for transitions involving this camera. */
  hints?: BlendHints;
};

export type KlippCamera = VirtualCameraConfig & { activatedAt: number };

/** Transition events emitted by the core and virtual camera controllers. */
export type CameraTransitionEventMap = {
  /** A camera became the active candidate. */
  activated: { incoming: string; outgoing: string | null };
  /** A camera stopped contributing to output. */
  deactivated: { outgoing: string };
  /** A blend transition started. */
  blendCreated: { incoming: string; outgoing: string | null };
  /** A blend transition finished. */
  blendFinished: { liveId: string };
  /** An instant transition occurred. */
  cut: { incoming: string; outgoing: string | null };
};

/** Transition events plus `activeIdChanged` / `liveIdChanged`, in the order they happened. */
export type KlippEvent =
  | { [K in keyof CameraTransitionEventMap]: { type: K } & CameraTransitionEventMap[K] }[keyof CameraTransitionEventMap]
  | { type: 'activeIdChanged' }
  | { type: 'liveIdChanged' };

export type KlippParams = {
  /** Used when no `customBlends` entry matches a from→to transition. */
  defaultBlend: BlendDefinition;
  customBlends: CustomBlend[];
};

export const DEFAULT_BLEND: BlendDefinition = { curve: BlendCurves.easeInOut, time: 2 };

export type KlippState = {
  cameras: Map<string, KlippCamera>;
  /** Highest-priority camera, the one the output is heading to. */
  activeId: string | null;
  activationCounter: number;
  blend: BlendState<string>;
  customBlendFromId: string | null;
  customBlendFromHints: BlendHints;
  /** Events since the last drain. The caller empties it. */
  events: KlippEvent[];
};

export const createKlippState = (): KlippState => ({
  cameras: new Map(),
  activeId: null,
  activationCounter: 0,
  blend: createBlendState<string>(),
  customBlendFromId: null,
  customBlendFromHints: BlendHints.none,
  events: [],
});

function recompute(state: KlippState): void {
  let winner: KlippCamera | null = null;
  for (const camera of state.cameras.values()) {
    if (
      !winner ||
      camera.priority > winner.priority ||
      (camera.priority === winner.priority && camera.activatedAt > winner.activatedAt)
    ) {
      winner = camera;
    }
  }
  const newActiveId = winner?.id ?? null;
  if (newActiveId === state.activeId) return;
  const outgoing = state.activeId;
  state.activeId = newActiveId;
  state.events.push({ type: 'activeIdChanged' });
  if (newActiveId !== null) state.events.push({ type: 'activated', incoming: newActiveId, outgoing });
}

function reportLiveIdChange(state: KlippState, previousLiveId: string | null): void {
  if (state.blend.liveId === previousLiveId) return;
  state.events.push({ type: 'liveIdChanged' });
  if (previousLiveId !== null) state.events.push({ type: 'deactivated', outgoing: previousLiveId });
}

/** Register a camera and return its record, needed to unregister it. */
export function registerKlippCamera(state: KlippState, config: VirtualCameraConfig): KlippCamera {
  const camera: KlippCamera = { ...config, activatedAt: ++state.activationCounter };
  state.cameras.set(config.id, camera);
  recompute(state);
  return camera;
}

/** Unregister `camera`, unless its id has since been taken by a newer registration. */
export function unregisterKlippCamera(state: KlippState, camera: KlippCamera): void {
  if (state.cameras.get(camera.id) !== camera) return;
  state.cameras.delete(camera.id);
  // Continue from the current output if the camera disappears.
  const previousLiveId = state.blend.liveId;
  forgetBlendCandidate(state.blend, camera.id);
  reportLiveIdChange(state, previousLiveId);
  recompute(state);
}

/** Change a camera's priority without restarting the current blend. */
export function setKlippPriority(state: KlippState, id: string, priority: number): void {
  const camera = state.cameras.get(id);
  if (!camera) return;
  camera.priority = priority;
  recompute(state);
}

/** Change a camera's blend hints in place. */
export function setKlippHints(state: KlippState, id: string, hints: BlendHints): void {
  const camera = state.cameras.get(id);
  if (camera) camera.hints = hints;
  if (id === state.customBlendFromId) state.customBlendFromHints = hints;
}

/** Start a transition to `incoming`. Returns `true` when it resolved to an instant cut. */
function retarget(state: KlippState, params: KlippParams, incoming: string): boolean {
  const definition = resolveBlendDefinition(
    params.customBlends,
    state.customBlendFromId,
    incoming,
    params.defaultBlend,
  );
  const incomingCamera = state.cameras.get(incoming)!;
  const toHints = incomingCamera.hints ?? BlendHints.none;
  // Prefer current hints when the outgoing camera still exists.
  const fromCamera = state.customBlendFromId !== null ? state.cameras.get(state.customBlendFromId) : undefined;
  const fromHints = fromCamera?.hints ?? state.customBlendFromHints;
  const outgoing = blendTargetId(state.blend);
  const isFirstEver = !state.blend.hasEverActivated;
  setBlendTarget(state.blend, incoming, incomingCamera.state, definition, fromHints | toHints);
  state.customBlendFromId = incoming;
  state.customBlendFromHints = toHints;

  if (isFirstEver) {
    state.events.push({ type: 'cut', incoming, outgoing: null });
    return false;
  }
  state.events.push({ type: 'blendCreated', incoming, outgoing });
  if ('damping' in definition || definition.time > 0) return false;
  state.events.push({ type: 'cut', incoming, outgoing });
  return true;
}

/** Head for the active camera, advance the blend and return the reusable output state. */
export function tickKlipp(state: KlippState, params: KlippParams, dt: number): CameraState {
  const blend = state.blend;
  const previousLiveId = blend.liveId;
  const justCreatedCut =
    state.activeId !== null && state.activeId !== blendTargetId(blend) && retarget(state, params, state.activeId);

  const wasBlending = blend.transition.active;
  const targetId = blendTargetId(blend);
  const result = tickBlend(blend, dt, targetId !== null ? state.cameras.get(targetId)!.state : null);
  if (wasBlending && !blend.transition.active && !justCreatedCut) {
    state.events.push({ type: 'blendFinished', liveId: blend.liveId! });
  }
  reportLiveIdChange(state, previousLiveId);
  return result;
}
