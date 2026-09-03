import { clamp } from 'math';
import { copyCameraState, createCameraState, type CameraState } from '../CameraState';
import { Damper } from '../damping/Damper';
import { BlendHints } from './BlendHints';
import type { BlendDefinition } from './BlendDefinition';
import { lerpCameraState } from './lerpCameraState';

type ActiveBlend<Id> = {
  from: CameraState;
  toId: Id;
  definition: BlendDefinition;
  elapsed: number;
  progress: number;
  /** Only for a `damping`-shaped `definition` - see `setTarget`. */
  damper: Damper | null;
  hints: BlendHints;
};

/**
 * The "snap-or-blend-and-composite" mechanics shared by every group strategy (`KlippCore`, `Sequencer`,
 * `StateDrivenCamera`, `ClearShot`) — advancing an in-progress blend, committing it once finished, and
 * tracking whichever candidate is currently live. Deliberately does NOT decide who should be live —
 * that's each strategy's own arbitration (priority order, elapsed hold time, external state, quality
 * evaluator), which differs enough between them that folding it in here would just replace one kind of
 * duplication with a worse one (a single class trying to be four things at once). A strategy calls
 * `setTarget` once it's already decided who the target is, then `tick` every frame to advance/composite.
 *
 * `Id` is whatever a strategy already identifies its candidates by — a string (`KlippCore`,
 * `StateDrivenCamera`, `ClearShot`) or an index (`Sequencer`).
 */
export class BlendDriver<Id> {
  private liveIdValue: Id | null = null;
  private blend: ActiveBlend<Id> | null = null;
  /** Distinguishes "never activated" (snap immediately) from "was live, now vanished" (`liveId` is null
   *  but `output` still holds a valid frame to blend from) — see `setTarget`'s doc comment. */
  private hasActivatedOnce = false;

  private readonly output: CameraState = createCameraState();
  private readonly blendFromScratch: CameraState = createCameraState();
  private readonly getState: (id: Id) => CameraState;

  constructor(getState: (id: Id) => CameraState) {
    this.getState = getState;
  }

  /** The candidate `tick()`'s output is currently settled on — lags behind `blendTargetId` while
   *  blending. `null` before the very first `setTarget` call, or after a live candidate vanishes with
   *  nothing having replaced it yet (a strategy's own bookkeeping, `setTarget` itself never clears this). */
  get liveId(): Id | null {
    return this.liveIdValue;
  }

  get isBlending(): boolean {
    return this.blend !== null;
  }

  /** Whether `setTarget` has ever actually run its snap/blend branch — `false` only before the very
   *  first call. Once `true`, `output` always holds a meaningful composited frame worth reading, even
   *  on a tick where `liveId` happens to be `null` because the live candidate was just `forget()`-ten
   *  mid-blend — unlike `liveId === null`, this stays `true` through that, so a caller deciding whether
   *  there's anything real to render can't mistake "momentarily orphaned mid-transition" for "arbitration
   *  has never picked a winner". */
  get hasEverActivated(): boolean {
    return this.hasActivatedOnce;
  }

  /** Whichever id `tick()` is currently heading toward — the in-progress blend's destination, or
   *  `liveId` if settled. What a strategy should compare its own "who should be live now" decision
   *  against before calling `setTarget` again, so an unchanged winner is a no-op instead of restarting
   *  the blend from scratch every tick. */
  get blendTargetId(): Id | null {
    return this.blend ? this.blend.toId : this.liveIdValue;
  }

  /**
   * Declares that `toId` should be live — the caller has already decided this (arbitration, debounce,
   * whatever's appropriate for that strategy) and is not re-checking it here. A no-op if `toId` already
   * matches `blendTargetId`.
   *
   * The very first call ever snaps immediately, no blend — there's nothing meaningful to blend FROM yet.
   * Every call after that blends from the CURRENT composited output frozen in place (not the previous
   * blend's original start, if one was already in progress) — that's what makes mid-blend interruption
   * correct: retargeting mid-transition continues smoothly from wherever the shot visually is, not from
   * further back.
   */
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
      // consumes Damper's snap-on-first-call quirk (meant for a meaningless initial Body/Aim position)
      // with a no-op update, so the real blend below damps progress from 0 instead of jumping to 1
      damper.update(0, 0, definition.damping, 0);
    }
    this.blend = { from: this.blendFromScratch, toId, definition, elapsed: 0, progress: 0, damper, hints };
  }

  /**
   * Tells the driver `id` no longer exists as a valid candidate — if it was `liveId` or the in-progress
   * blend's destination, forgets it (a later `setTarget` blends from the current frozen `output`, not
   * toward/from a stale id whose `getState` would now throw). A no-op if `id` isn't currently tracked at
   * all (e.g. it lost arbitration a while ago and was already forgotten). Never touches `hasEverActivated`
   * — a NEW candidate arriving afterward still blends from the frozen `output`, it doesn't re-snap.
   */
  forget(id: Id): void {
    if (this.blend?.toId === id) {
      this.blend = null;
      this.liveIdValue = null;
    } else if (this.liveIdValue === id) {
      this.liveIdValue = null;
    }
  }

  /**
   * Advances any in-progress blend by `dt` and returns the composited `CameraState` — same scratch
   * instance every call, valid only until the next `tick()`.
   */
  tick(dt: number): CameraState {
    if (this.blend) {
      const { definition } = this.blend;
      let t: number;
      if ('damping' in definition) {
        this.blend.progress = this.blend.damper!.update(this.blend.progress, 1, definition.damping, dt);
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
