import type { CameraState } from '../CameraState';
import { BlendCurves } from '../blend/BlendCurves';
import type { BlendDefinition } from '../blend/BlendDefinition';
import { BlendDriver } from '../blend/BlendDriver';

export type ClearShotCandidate = {
  cameraId: string;
  /** Live reference — read fresh every `tick()`. */
  state: CameraState;
  priority: number;
};

/** Scores a candidate's shot quality — higher wins. No built-in scorer yet (a real one needs scene/
 *  collider access, e.g. a future Deoccluder-based evaluator) — this is just the plug point. */
export type ShotQualityEvaluator = (candidate: ClearShotCandidate) => number;

export type ClearShotOptions = {
  evaluator: ShotQualityEvaluator;
  defaultBlend?: BlendDefinition;
  /** Seconds a new best candidate must stay the best, uninterrupted, before it's actually committed to. */
  activateAfter?: number;
  /** Seconds the live camera must stay live before yielding to another candidate on quality alone.
   *  Gates internal switches only — an external, higher-priority camera preempting the whole `ClearShot`
   *  from outside isn't modeled here, this class can't see that. */
  minDuration?: number;
  /** Pick randomly among exactly-tied (quality AND priority) candidates instead of list order. */
  randomizeChoice?: boolean;
  random?: () => number;
};

/**
 * Picks the child with the best shot quality (not just priority) — `priority` only breaks quality ties.
 * `activateAfter` debounces the pick (a new best must hold that title continuously before it's committed,
 * anti-flicker); `minDuration` then protects the committed camera from being swapped out again too soon.
 */
export class ClearShot {
  private readonly candidates: ClearShotCandidate[];
  private readonly evaluator: ShotQualityEvaluator;
  private readonly defaultBlend: BlendDefinition;
  private readonly activateAfter: number;
  private readonly minDuration: number;
  private readonly randomizeChoice: boolean;
  private readonly random: () => number;
  private readonly driver: BlendDriver<string>;

  private liveElapsed = 0;

  private pendingId: string | null = null;
  private pendingElapsed = 0;

  constructor(candidates: ClearShotCandidate[], options: ClearShotOptions) {
    if (candidates.length === 0) throw new Error('ClearShot needs at least one candidate.');
    this.candidates = candidates;
    this.evaluator = options.evaluator;
    this.defaultBlend = options.defaultBlend ?? { curve: BlendCurves.easeInOut, time: 2 };
    this.activateAfter = options.activateAfter ?? 0;
    this.minDuration = options.minDuration ?? 0;
    this.randomizeChoice = options.randomizeChoice ?? false;
    this.random = options.random ?? Math.random;
    this.driver = new BlendDriver((id) => this.candidateState(id));
  }

  get liveCameraId(): string | null {
    return this.driver.liveId;
  }

  get isBlending(): boolean {
    return this.driver.isBlending;
  }

  /** The candidate currently being debounced toward (`activateAfter`), before it's committed to. */
  get pendingCameraId(): string | null {
    return this.pendingId;
  }

  tick(dt: number): CameraState {
    const rawBest = this.pickBest();
    const target = this.driver.blendTargetId;

    if (rawBest !== target) {
      if (target === null) {
        // first-ever activation: setTarget snaps on its own (nothing to debounce toward yet)
        this.driver.setTarget(rawBest, this.defaultBlend);
        this.pendingId = null;
        this.pendingElapsed = 0;
      } else {
        if (this.pendingId !== rawBest) {
          this.pendingId = rawBest;
          this.pendingElapsed = 0;
        } else {
          this.pendingElapsed += dt;
        }

        const activateAfterSatisfied = this.pendingElapsed >= this.activateAfter;
        // liveElapsed tracks time since the LAST commit (an initial swap away from a settled camera, OR
        // a mid-blend retarget) rather than only time spent fully settled — otherwise a blend already in
        // flight would exempt every retarget of it from minDuration entirely, letting a flickering
        // evaluator redirect the destination every single frame with no protection at all
        const minDurationSatisfied = this.liveElapsed >= this.minDuration;

        if (activateAfterSatisfied && minDurationSatisfied) {
          this.driver.setTarget(rawBest, this.defaultBlend);
          this.pendingId = null;
          this.pendingElapsed = 0;
          this.liveElapsed = 0;
        }
      }
    } else {
      this.pendingId = null;
      this.pendingElapsed = 0;
    }

    const result = this.driver.tick(dt);
    this.liveElapsed += dt; // keeps counting through the blend — see the minDurationSatisfied comment above
    return result;
  }

  /** Highest quality wins; `priority` breaks quality ties; among exact ties, `randomizeChoice` picks
   *  uniformly at random via reservoir sampling (no allocation), otherwise list order. */
  private pickBest(): string {
    let bestQuality = -Infinity;
    let bestPriority = -Infinity;
    let bestId = this.candidates[0].cameraId;
    let tieCount = 0;

    for (const candidate of this.candidates) {
      const quality = this.evaluator(candidate);
      if (quality > bestQuality || (quality === bestQuality && candidate.priority > bestPriority)) {
        bestQuality = quality;
        bestPriority = candidate.priority;
        bestId = candidate.cameraId;
        tieCount = 1;
      } else if (quality === bestQuality && candidate.priority === bestPriority) {
        tieCount++;
        if (this.randomizeChoice && this.random() < 1 / tieCount) bestId = candidate.cameraId;
      }
    }

    return bestId;
  }

  private candidateState(cameraId: string): CameraState {
    return this.candidates.find((c) => c.cameraId === cameraId)!.state;
  }
}
