import { clamp } from 'math';
import { copyCameraState, createCameraState, type CameraState } from '../CameraState';
import { Damper } from '../damping/Damper';
import type { BlendDefinition } from './BlendDefinition';
import { BlendHints } from './BlendHints';
import { lerpCameraState } from './lerpCameraState';

type ActiveBlend<Id> = {
  from: CameraState;
  toId: Id;
  definition: BlendDefinition;
  elapsed: number;
  progress: number;
  damper: Damper | null;
  hints: BlendHints;
};

/** Advances and composites a transition after a strategy selects its target. */
export class BlendDriver<Id> {
  private liveIdValue: Id | null = null;
  private blend: ActiveBlend<Id> | null = null;
  private hasActivatedOnce = false;

  private readonly output: CameraState = createCameraState();
  private readonly blendFromScratch: CameraState = createCameraState();
  private readonly getState: (id: Id) => CameraState;

  constructor(getState: (id: Id) => CameraState) {
    this.getState = getState;
  }

  /** Candidate whose state is currently settled in the output. */
  get liveId(): Id | null {
    return this.liveIdValue;
  }

  get isBlending(): boolean {
    return this.blend !== null;
  }

  /** Whether the driver has produced a real output at least once. */
  get hasEverActivated(): boolean {
    return this.hasActivatedOnce;
  }

  /** Destination of the active blend, or `liveId` when settled. */
  get blendTargetId(): Id | null {
    return this.blend ? this.blend.toId : this.liveIdValue;
  }

  /** Set the transition destination. Retargeting starts from the current output. */
  setTarget(toId: Id, definition: BlendDefinition, hints: BlendHints = BlendHints.none): void {
    if (toId === this.blendTargetId) return;

    if (!this.hasActivatedOnce) {
      this.hasActivatedOnce = true;
      this.liveIdValue = toId;
      copyCameraState(this.output, this.getState(toId));
      return;
    }

    copyCameraState(this.blendFromScratch, this.output);
    let damper: Damper | null = null;
    if ('damping' in definition) {
      damper = new Damper();
      // Prime the damper so blend progress starts at zero.
      damper.update(0, 0, definition.damping, 0);
    }
    this.blend = { from: this.blendFromScratch, toId, definition, elapsed: 0, progress: 0, damper, hints };
  }

  /** Remove a candidate without discarding the current output. */
  forget(id: Id): void {
    if (this.blend?.toId === id) {
      this.blend = null;
      this.liveIdValue = null;
    } else if (this.liveIdValue === id) {
      this.liveIdValue = null;
    }
  }

  /** Advance the blend and return the reusable output state. */
  tick(dt: number): CameraState {
    if (this.blend) {
      const { definition } = this.blend;
      let t: number;
      if ('damping' in definition) {
        this.blend.progress = this.blend.damper!.update(
          this.blend.progress,
          1,
          definition.damping,
          dt,
          definition.maxSpeed,
        );
        t = this.blend.progress;
      } else {
        this.blend.elapsed += dt;
        const rawT = definition.time <= 0 ? 1 : clamp(this.blend.elapsed / definition.time, 0, 1);
        t = definition.curve(rawT);
      }

      const toState = this.getState(this.blend.toId);
      lerpCameraState(this.output, this.blend.from, toState, t, this.blend.hints);

      if (t >= 1) {
        this.liveIdValue = this.blend.toId;
        this.blend = null;
      }
    } else if (this.liveIdValue !== null) {
      copyCameraState(this.output, this.getState(this.liveIdValue));
    }

    return this.output;
  }
}
