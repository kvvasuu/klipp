import { clamp } from 'math';
import { copyCameraState, createCameraState, type CameraState } from '../CameraState.js';
import { createDamperState, damp, resetDamper, type DamperState } from '../damping/Damper.js';
import type { BlendDefinition } from './BlendDefinition.js';
import { BlendHints } from './BlendHints.js';
import { lerpCameraState } from './lerpCameraState.js';

/** A transition in flight from a frozen `from` state toward the live `toId` camera. */
export type BlendTransition<Id> = {
  active: boolean;
  from: CameraState;
  toId: Id | null;
  definition: BlendDefinition | null;
  elapsed: number;
  progress: number;
  damper: DamperState;
  hints: BlendHints;
};

export type BlendState<Id> = {
  /** Camera currently settled in the output. */
  liveId: Id | null;
  /** Whether a real output has been produced at least once. */
  hasEverActivated: boolean;
  transition: BlendTransition<Id>;
  /** Reusable output, returned by `tickBlend`. */
  output: CameraState;
};

export const createBlendState = <Id>(): BlendState<Id> => ({
  liveId: null,
  hasEverActivated: false,
  transition: {
    active: false,
    from: createCameraState(),
    toId: null,
    definition: null,
    elapsed: 0,
    progress: 0,
    damper: createDamperState(),
    hints: BlendHints.none,
  },
  output: createCameraState(),
});

/** Destination of the active transition, or `liveId` when settled. */
export const blendTargetId = <Id>(state: BlendState<Id>): Id | null =>
  state.transition.active ? state.transition.toId : state.liveId;

/**
 * Start a transition to `toId`, from the current output. The very first target is taken over at once
 * from `toState`, since there is nothing to blend from yet.
 */
export function setBlendTarget<Id>(
  state: BlendState<Id>,
  toId: Id,
  toState: CameraState,
  definition: BlendDefinition,
  hints: BlendHints = BlendHints.none,
): void {
  if (toId === blendTargetId(state)) return;

  if (!state.hasEverActivated) {
    state.hasEverActivated = true;
    state.liveId = toId;
    copyCameraState(state.output, toState);
    return;
  }

  const transition = state.transition;
  copyCameraState(transition.from, state.output);
  transition.active = true;
  transition.toId = toId;
  transition.definition = definition;
  transition.elapsed = 0;
  transition.progress = 0;
  transition.hints = hints;
  if (definition.damping !== undefined) {
    // Prime the damper so blend progress starts at zero.
    resetDamper(transition.damper);
    damp(transition.damper, 0, definition.damping, 0);
  }
}

/** Drop a camera that went away, keeping the current output. */
export function forgetBlendCandidate<Id>(state: BlendState<Id>, id: Id): void {
  const transition = state.transition;
  if (transition.active && transition.toId === id) {
    transition.active = false;
    transition.toId = null;
    state.liveId = null;
  } else if (state.liveId === id) {
    state.liveId = null;
  }
}

/**
 * Advance the transition and composite the output. `targetState` is the state of `blendTargetId(state)`,
 * or `null` when there is none.
 */
export function tickBlend<Id>(state: BlendState<Id>, dt: number, targetState: CameraState | null): CameraState {
  const transition = state.transition;
  if (transition.active && targetState) {
    const definition = transition.definition!;
    let t: number;
    if (definition.damping !== undefined) {
      transition.damper.value = transition.progress;
      transition.progress = damp(transition.damper, 1, definition.damping, dt, definition.maxSpeed).value;
      t = transition.progress;
    } else {
      transition.elapsed += dt;
      const rawT = definition.time <= 0 ? 1 : clamp(transition.elapsed / definition.time, 0, 1);
      t = definition.curve(rawT);
    }

    lerpCameraState(state.output, transition.from, targetState, t, transition.hints);

    if (t >= 1) {
      state.liveId = transition.toId;
      transition.active = false;
      transition.toId = null;
    }
  } else if (state.liveId !== null && targetState) {
    copyCameraState(state.output, targetState);
  }

  return state.output;
}
