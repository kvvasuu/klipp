import type { CameraState } from '../CameraState';
import { BlendCurves } from '../blend/BlendCurves';
import type { BlendDefinition } from '../blend/BlendDefinition';
import { BlendDriver } from '../blend/BlendDriver';

export type SequencerInstruction = {
  cameraId: string;
  /** Live reference — `Sequencer` reads it directly, same convention as `KlippCore.registerCamera`. */
  state: CameraState;
  /** Seconds to hold this camera before advancing. Ignored on the last instruction unless `loop`. */
  hold: number;
  /** Transition into the NEXT instruction. Falls back to `defaultBlend` if omitted. */
  blend?: BlendDefinition;
};

export type SequencerOptions = {
  defaultBlend?: BlendDefinition;
  /** Wrap to the first instruction after the last one's hold elapses, instead of holding forever. */
  loop?: boolean;
};

/**
 * Steps through a fixed list of camera instructions in order, holding each for its own duration before
 * blending to the next. Holds the last instruction forever once reached, unless `loop` — never ends
 * itself.
 */
export class Sequencer {
  private readonly instructions: SequencerInstruction[];
  private readonly defaultBlend: BlendDefinition;
  private readonly loop: boolean;

  private holdElapsed = 0;
  private readonly driver: BlendDriver<number>;

  constructor(instructions: SequencerInstruction[], options: SequencerOptions = {}) {
    if (instructions.length === 0) throw new Error('Sequencer needs at least one instruction.');
    this.instructions = instructions;
    this.defaultBlend = options.defaultBlend ?? { curve: BlendCurves.easeInOut, time: 2 };
    this.loop = options.loop ?? false;
    this.driver = new BlendDriver((index) => this.instructions[index].state);
  }

  /** The settled instruction — during a blend, still the one being left, not the destination (same as
   *  `driver.liveId` throughout `BlendDriver`). `0` before the very first `tick()`. */
  get currentIndex(): number {
    return this.driver.liveId ?? 0;
  }

  get currentCameraId(): string {
    return this.instructions[this.currentIndex].cameraId;
  }

  get isBlending(): boolean {
    return this.driver.isBlending;
  }

  /** Advances by `dt` and returns the composited `CameraState` — same scratch instance every call. */
  tick(dt: number): CameraState {
    if (this.driver.blendTargetId === null) {
      // first-ever tick: snap to instruction 0 and stop — the hold timer hasn't started yet, so this
      // call's dt is never applied toward it, same as every OTHER call below only advances holdElapsed
      // once settled
      this.driver.setTarget(0, this.defaultBlend); // definition is irrelevant here, the first call always snaps
      return this.driver.tick(0);
    }

    // checked BEFORE tick(), not after — a blend that completes on THIS call must still skip the hold
    // timer this tick (matching the pre-BlendDriver code, which always returned early from its own blend
    // branch regardless of whether t reached 1 that call); checking isBlending only after tick() would
    // instead credit this tick's whole dt toward the NEXT hold period on the exact tick a blend lands
    const wasBlending = this.driver.isBlending;
    const result = this.driver.tick(dt);
    if (wasBlending) return result;

    const index = this.currentIndex;
    const isLast = index === this.instructions.length - 1;
    if (isLast && !this.loop) return result;

    this.holdElapsed += dt;
    if (this.holdElapsed >= this.instructions[index].hold) {
      const nextIndex = isLast ? 0 : index + 1;
      this.holdElapsed = 0;
      this.driver.setTarget(nextIndex, this.instructions[index].blend ?? this.defaultBlend);
    }

    return result;
  }
}
