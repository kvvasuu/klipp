import type { CameraState } from '../CameraState.js';
import { blendTargetId, createBlendState, setBlendTarget, tickBlend, type BlendState } from '../blend/blend.js';
import { BlendCurves } from '../blend/BlendCurves.js';
import type { BlendDefinition } from '../blend/BlendDefinition.js';

export type ClearShotCandidate = {
  cameraId: string;
  /** Live reference - read fresh every `tick()`. */
  state: CameraState;
  priority: number;
};

/** Scores a candidate's shot quality - higher wins. No built-in scorer yet (a real one needs scene/
 *  collider access, e.g. a future Deoccluder-based evaluator) - this is just the plug point. */
export type ShotQualityEvaluator = (candidate: ClearShotCandidate) => number;

export type ClearShotOptions = {
  evaluator: ShotQualityEvaluator;
  defaultBlend?: BlendDefinition;
  /** Seconds a new best candidate must stay the best, uninterrupted, before it's actually committed to. */
  activateAfter?: number;
  /** Seconds the live camera must stay live before yielding to another candidate on quality alone.
   *  Gates internal switches only - an external, higher-priority camera preempting the whole `ClearShot`
   *  from outside isn't modeled here, this class can't see that. */
  minDuration?: number;
  /** Pick randomly among exactly-tied (quality AND priority) candidates instead of list order. */
  randomizeChoice?: boolean;
  random?: () => number;
};

export type ClearShotParams = {
  candidates: readonly ClearShotCandidate[];
  evaluator: ShotQualityEvaluator;
  defaultBlend: BlendDefinition;
  activateAfter: number;
  minDuration: number;
  randomizeChoice: boolean;
  random: () => number;
};

export type ClearShotState = {
  /** Seconds since the last commit (initial swap or mid-blend retarget). */
  liveElapsed: number;
  /** The candidate being debounced toward (`activateAfter`), before it is committed to. */
  pendingId: string | null;
  pendingElapsed: number;
  blend: BlendState<string>;
};

export const createClearShotState = (): ClearShotState => ({
  liveElapsed: 0,
  pendingId: null,
  pendingElapsed: 0,
  blend: createBlendState<string>(),
});

function candidateState(params: ClearShotParams, cameraId: string | null): CameraState | null {
  return cameraId !== null ? params.candidates.find((c) => c.cameraId === cameraId)!.state : null;
}

/** Highest quality wins; `priority` breaks quality ties; among exact ties, `randomizeChoice` picks
 *  uniformly at random via reservoir sampling (no allocation), otherwise list order. */
function pickBest(params: ClearShotParams): string {
  let bestQuality = -Infinity;
  let bestPriority = -Infinity;
  let bestId = params.candidates[0].cameraId;
  let tieCount = 0;

  for (const candidate of params.candidates) {
    const quality = params.evaluator(candidate);
    if (quality > bestQuality || (quality === bestQuality && candidate.priority > bestPriority)) {
      bestQuality = quality;
      bestPriority = candidate.priority;
      bestId = candidate.cameraId;
      tieCount = 1;
    } else if (quality === bestQuality && candidate.priority === bestPriority) {
      tieCount++;
      if (params.randomizeChoice && params.random() < 1 / tieCount) bestId = candidate.cameraId;
    }
  }

  return bestId;
}

function commit(state: ClearShotState, params: ClearShotParams, cameraId: string): void {
  setBlendTarget(state.blend, cameraId, candidateState(params, cameraId)!, params.defaultBlend);
}

/** Re-evaluates the candidates, advances any blend by `dt` and returns the output. */
export function tickClearShot(state: ClearShotState, params: ClearShotParams, dt: number): CameraState {
  const rawBest = pickBest(params);
  const target = blendTargetId(state.blend);

  if (rawBest !== target) {
    if (target === null) {
      // First activation snaps on its own: there is nothing to debounce toward yet.
      commit(state, params, rawBest);
      state.pendingId = null;
      state.pendingElapsed = 0;
    } else {
      if (state.pendingId !== rawBest) {
        state.pendingId = rawBest;
        state.pendingElapsed = 0;
      } else {
        state.pendingElapsed += dt;
      }

      const activateAfterSatisfied = state.pendingElapsed >= params.activateAfter;
      // liveElapsed counts from the last commit, including mid-blend retargets, so a flickering evaluator
      // cannot redirect a blend in flight every frame.
      const minDurationSatisfied = state.liveElapsed >= params.minDuration;

      if (activateAfterSatisfied && minDurationSatisfied) {
        commit(state, params, rawBest);
        state.pendingId = null;
        state.pendingElapsed = 0;
        state.liveElapsed = 0;
      }
    }
  } else {
    state.pendingId = null;
    state.pendingElapsed = 0;
  }

  const result = tickBlend(state.blend, dt, candidateState(params, blendTargetId(state.blend)));
  state.liveElapsed += dt; // keeps counting through the blend, see minDurationSatisfied above
  return result;
}

/**
 * Picks the child with the best shot quality - `priority` only breaks quality ties.
 * `activateAfter` debounces the pick (a new best must hold that title continuously before it's committed,
 * anti-flicker); `minDuration` then protects the committed camera from being swapped out again too soon.
 */
export class ClearShot {
  readonly state = createClearShotState();
  private readonly params: ClearShotParams;

  constructor(candidates: ClearShotCandidate[], options: ClearShotOptions) {
    if (candidates.length === 0) throw new Error('ClearShot needs at least one candidate.');
    this.params = {
      candidates,
      evaluator: options.evaluator,
      defaultBlend: options.defaultBlend ?? { curve: BlendCurves.easeInOut, time: 2 },
      activateAfter: options.activateAfter ?? 0,
      minDuration: options.minDuration ?? 0,
      randomizeChoice: options.randomizeChoice ?? false,
      random: options.random ?? Math.random,
    };
  }

  get liveCameraId(): string | null {
    return this.state.blend.liveId;
  }

  get isBlending(): boolean {
    return this.state.blend.transition.active;
  }

  /** The candidate currently being debounced toward (`activateAfter`), before it's committed to. */
  get pendingCameraId(): string | null {
    return this.state.pendingId;
  }

  tick(dt: number): CameraState {
    return tickClearShot(this.state, this.params, dt);
  }
}
