import type { CameraState } from '../CameraState.js';
import { blendTargetId, createBlendState, setBlendTarget, tickBlend, type BlendState } from '../blend/blend.js';
import { BlendCurves } from '../blend/BlendCurves.js';
import type { BlendDefinition } from '../blend/BlendDefinition.js';

export type StateDrivenCandidate = {
  cameraId: string;
  /** Live reference - read fresh every `tick()`. */
  state: CameraState;
  priority: number;
  /** Which driving state (`setState()`) this candidate applies to. */
  forState: string;
};

export type StateDrivenCameraOptions = {
  defaultBlend?: BlendDefinition;
};

export type StateDrivenParams = { candidates: readonly StateDrivenCandidate[]; defaultBlend: BlendDefinition };

export type StateDrivenState = { drivingState: string | null; winnerId: string | null; blend: BlendState<string> };

export const createStateDrivenState = (): StateDrivenState => ({
  drivingState: null,
  winnerId: null,
  blend: createBlendState<string>(),
});

function candidateState(params: StateDrivenParams, cameraId: string | null): CameraState | null {
  return cameraId !== null ? params.candidates.find((c) => c.cameraId === cameraId)!.state : null;
}

/** Select the camera for `drivingState`: highest priority, first in the list on a tie. */
export function setDrivingState(state: StateDrivenState, params: StateDrivenParams, drivingState: string): void {
  state.drivingState = drivingState;
  let winner: StateDrivenCandidate | null = null;
  for (const candidate of params.candidates) {
    if (candidate.forState !== drivingState) continue;
    if (!winner || candidate.priority > winner.priority) winner = candidate;
  }
  state.winnerId = winner?.cameraId ?? null;
}

/**
 * Advances any blend toward the selected camera and returns the output. Before any matching state has
 * been set, this is the untouched default `CameraState`.
 */
export function tickStateDriven(state: StateDrivenState, params: StateDrivenParams, dt: number): CameraState {
  const { blend, winnerId } = state;
  if (winnerId !== null && winnerId !== blendTargetId(blend)) {
    setBlendTarget(blend, winnerId, candidateState(params, winnerId)!, params.defaultBlend);
  }
  return tickBlend(blend, dt, candidateState(params, blendTargetId(blend)));
}

/**
 * Maps an externally-driven state (`setState()`, e.g. mirroring an animator's current state) to a child
 * camera. Several candidates can target the same state - then the highest `priority` wins, and on a
 * priority tie the FIRST one in the candidate list wins - deliberately simpler than `Klipp`'s
 * "most recently activated" tie-break, since there's no activation order here, just a fixed list.
 *
 * If the current state matches no candidate, holds whatever was live before (nothing to switch to).
 */
export class StateDrivenCamera {
  readonly state = createStateDrivenState();
  private readonly params: StateDrivenParams;

  constructor(candidates: StateDrivenCandidate[], options: StateDrivenCameraOptions = {}) {
    if (candidates.length === 0) throw new Error('StateDrivenCamera needs at least one candidate.');
    this.params = { candidates, defaultBlend: options.defaultBlend ?? { curve: BlendCurves.easeInOut, time: 2 } };
  }

  setState(state: string): void {
    setDrivingState(this.state, this.params, state);
  }

  get currentState(): string | null {
    return this.state.drivingState;
  }

  get liveCameraId(): string | null {
    return this.state.blend.liveId;
  }

  get isBlending(): boolean {
    return this.state.blend.transition.active;
  }

  /** Advances any in-progress blend by `dt` and returns the composited `CameraState` - same scratch instance every call. */
  tick(dt: number): CameraState {
    return tickStateDriven(this.state, this.params, dt);
  }
}
