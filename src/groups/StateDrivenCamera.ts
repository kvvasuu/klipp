import { clamp } from 'maath';
import { copyCameraState, createCameraState, type CameraState } from '../CameraState';
import { BlendCurves } from '../blend/BlendCurves';
import type { BlendDefinition } from '../blend/BlendDefinition';
import { lerpCameraState } from '../blend/lerpCameraState';

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

type ActiveBlend = {
  from: CameraState;
  toId: string;
  definition: BlendDefinition;
  elapsed: number;
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

  private drivingState: string | null = null;
  private winnerId: string | null = null;

  private liveId: string | null = null;
  private blend: ActiveBlend | null = null;
  private everActivated = false;

  private readonly output: CameraState = createCameraState();
  private readonly blendFromScratch: CameraState = createCameraState();

  constructor(candidates: StateDrivenCandidate[], options: StateDrivenCameraOptions = {}) {
    if (candidates.length === 0) throw new Error('StateDrivenCamera needs at least one candidate.');
    this.candidates = candidates;
    this.defaultBlend = options.defaultBlend ?? { curve: BlendCurves.easeInOut, time: 2 };
  }

  setState(state: string): void {
    this.drivingState = state;
    this.recompute();
  }

  get currentState(): string | null {
    return this.drivingState;
  }

  get liveCameraId(): string | null {
    return this.liveId;
  }

  get isBlending(): boolean {
    return this.blend !== null;
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
    const blendTargetId = this.blend ? this.blend.toId : this.liveId;

    if (this.winnerId !== null && this.winnerId !== blendTargetId) {
      if (!this.everActivated) {
        this.everActivated = true;
        this.liveId = this.winnerId;
        copyCameraState(this.output, this.candidateState(this.winnerId));
      } else {
        copyCameraState(this.blendFromScratch, this.output);
        this.blend = { from: this.blendFromScratch, toId: this.winnerId, definition: this.defaultBlend, elapsed: 0 };
      }
    }

    if (this.blend) {
      this.blend.elapsed += dt;
      const t = this.blend.definition.time <= 0 ? 1 : clamp(this.blend.elapsed / this.blend.definition.time, 0, 1);
      const toState = this.candidateState(this.blend.toId);
      lerpCameraState(this.output, this.blend.from, toState, this.blend.definition.curve(t));

      if (t >= 1) {
        this.liveId = this.blend.toId;
        this.blend = null;
      }
    } else if (this.liveId !== null) {
      copyCameraState(this.output, this.candidateState(this.liveId));
    }

    return this.output;
  }

  private candidateState(cameraId: string): CameraState {
    return this.candidates.find((c) => c.cameraId === cameraId)!.state;
  }
}
