import type { CameraState } from '../CameraState.js';
import { blendTargetId, createBlendState, forgetBlendCandidate, setBlendTarget, tickBlend } from './blend.js';
import type { BlendDefinition } from './BlendDefinition.js';
import { BlendHints } from './BlendHints.js';

/** Stateful wrapper over the blend functions, resolving camera states by id. */
export class BlendDriver<Id> {
  readonly state = createBlendState<Id>();
  private readonly getState: (id: Id) => CameraState;

  constructor(getState: (id: Id) => CameraState) {
    this.getState = getState;
  }

  /** Candidate whose state is currently settled in the output. */
  get liveId(): Id | null {
    return this.state.liveId;
  }

  get isBlending(): boolean {
    return this.state.transition.active;
  }

  /** Whether the driver has produced a real output at least once. */
  get hasEverActivated(): boolean {
    return this.state.hasEverActivated;
  }

  /** Destination of the active blend, or `liveId` when settled. */
  get blendTargetId(): Id | null {
    return blendTargetId(this.state);
  }

  /** Set the transition destination. Retargeting starts from the current output. */
  setTarget(toId: Id, definition: BlendDefinition, hints: BlendHints = BlendHints.none): void {
    if (toId === blendTargetId(this.state)) return;
    setBlendTarget(this.state, toId, this.getState(toId), definition, hints);
  }

  /** Remove a candidate without discarding the current output. */
  forget(id: Id): void {
    forgetBlendCandidate(this.state, id);
  }

  /** Advance the blend and return the reusable output state. */
  tick(dt: number): CameraState {
    const targetId = blendTargetId(this.state);
    return tickBlend(this.state, dt, targetId !== null ? this.getState(targetId) : null);
  }
}
