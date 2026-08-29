import type { CameraState } from '../CameraState';
import { BlendCurves } from '../blend/BlendCurves';
import type { BlendDefinition } from '../blend/BlendDefinition';
import { BlendDriver } from '../blend/BlendDriver';

export type StateDrivenCandidate = {
  cameraId: string;
  /** Live reference — read fresh every `tick()`. */
  state: CameraState;
  priority: number;
  /** Which driving state (`setState()`) this candidate applies to. */
  forState: string;
};

export type StateDrivenCameraOptions = {
  defaultBlend?: BlendDefinition;
};

/**
 * Maps an externally-driven state (`setState()`, e.g. mirroring an animator's current state) to a child
 * camera. Several candidates can target the same state — then the highest `priority` wins, and on a
 * priority tie the FIRST one in the candidate list wins — deliberately simpler than `KlippCore`'s
 * "most recently activated" tie-break, since there's no activation order here, just a fixed list.
 *
 * If the current state matches no candidate, holds whatever was live before (nothing to switch to).
 */
export class StateDrivenCamera {
  private readonly candidates: StateDrivenCandidate[];
  private readonly defaultBlend: BlendDefinition;
  private readonly driver: BlendDriver<string>;

  private drivingState: string | null = null;
  private winnerId: string | null = null;

  constructor(candidates: StateDrivenCandidate[], options: StateDrivenCameraOptions = {}) {
    if (candidates.length === 0) throw new Error('StateDrivenCamera needs at least one candidate.');
    this.candidates = candidates;
    this.defaultBlend = options.defaultBlend ?? { curve: BlendCurves.easeInOut, time: 2 };
    this.driver = new BlendDriver((id) => this.candidateState(id));
  }

  setState(state: string): void {
    this.drivingState = state;
    this.recompute();
  }

  get currentState(): string | null {
    return this.drivingState;
  }

  get liveCameraId(): string | null {
    return this.driver.liveId;
  }

  get isBlending(): boolean {
    return this.driver.isBlending;
  }

  private recompute(): void {
    let winner: StateDrivenCandidate | null = null;
    for (const candidate of this.candidates) {
      if (candidate.forState !== this.drivingState) continue;
      if (!winner || candidate.priority > winner.priority) winner = candidate;
    }
    this.winnerId = winner?.cameraId ?? null;
  }

  /**
   * Advances any in-progress blend by `dt` and returns the composited `CameraState` — same scratch
   * instance every call.
   *
   * Before `setState()` has ever been called with a state some candidate's `forState` matches
   * (`liveCameraId === null`), this is just the untouched default `CameraState` (origin, identity,
   * fov 50) — check `liveCameraId` first if that distinction matters to the caller.
   */
  tick(dt: number): CameraState {
    if (this.winnerId !== null && this.winnerId !== this.driver.blendTargetId) {
      this.driver.setTarget(this.winnerId, this.defaultBlend);
    }
    return this.driver.tick(dt);
  }

  private candidateState(cameraId: string): CameraState {
    return this.candidates.find((c) => c.cameraId === cameraId)!.state;
  }
}
