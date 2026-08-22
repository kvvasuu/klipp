import { clamp } from 'maath';
import { copyCameraState, createCameraState, type CameraState } from './CameraState';
import { BlendCurves } from './blend/BlendCurves';
import { resolveBlendDefinition, type BlendDefinition, type CustomBlend } from './blend/BlendDefinition';
import { lerpCameraState } from './blend/lerpCameraState';

export type VirtualCameraConfig = {
  id: string;
  priority: number;
  /** Reference to this camera's live state — `KlippCore` reads it directly. Whoever registers it is
   *  responsible for keeping it updated in place (zero-allocation convention, see CLAUDE.md). */
  state: CameraState;
};

type Candidate = VirtualCameraConfig & { activatedAt: number };

/** `from` is a frozen snapshot, stable even if that camera unregisters. `to` stays a live reference
 *  (via `toId`) so a moving target keeps being tracked mid-blend. */
type ActiveBlend = {
  from: CameraState;
  fromId: string | null;
  toId: string;
  definition: BlendDefinition;
  elapsed: number;
};

let activationCounter = 0;

export type KlippCoreOptions = {
  /** Used when no `customBlends` entry matches a from→to transition. Default: Ease In Out over 2s. */
  defaultBlend?: BlendDefinition;
  customBlends?: CustomBlend[];
};

/**
 * Priority arbitration + blend driver for the active virtual camera.
 *
 * Priority ties break by "most recently activated" — `activatedAt` is a monotonic stamp set on every
 * `registerCamera` call, highest wins on a tie.
 *
 * `activeCameraId` is the instant priority winner. `tick(dt)` lags behind it on purpose: the outgoing
 * camera keeps feeding the output until its blend finishes. `liveCameraId`/`isBlending` expose that
 * lagging, composited state separately from `activeCameraId`.
 */
export class KlippCore {
  private candidates = new Map<string, Candidate>();
  private activeId: string | null = null;
  private readonly activeIdListeners = new Set<() => void>();

  private readonly defaultBlend: BlendDefinition;
  private readonly customBlends: CustomBlend[];

  private liveId: string | null = null;
  private readonly liveIdListeners = new Set<() => void>();
  private blend: ActiveBlend | null = null;
  /** Distinguishes "never started" (snap immediately) from "was live, now unregistered" (`liveId` is
   *  null but `output` still holds a valid frame to blend from). */
  private everActivated = false;

  private readonly output: CameraState = createCameraState();
  private readonly blendFromScratch: CameraState = createCameraState();

  constructor(options: KlippCoreOptions = {}) {
    this.defaultBlend = options.defaultBlend ?? { curve: BlendCurves.easeInOut, time: 2 };
    this.customBlends = options.customBlends ?? [];
  }

  get activeCameraId(): string | null {
    return this.activeId;
  }

  isActive(id: string): boolean {
    return this.activeId === id;
  }

  /** Notified whenever `activeCameraId` actually changes (not on every `recompute()` — most are no-ops).
   *  `useSyncExternalStore`-shaped (`(onChange) => unsubscribe`) — pass this field directly as its
   *  `subscribe` argument, it's already bound. */
  subscribeActiveId = (listener: () => void): (() => void) => {
    this.activeIdListeners.add(listener);
    return () => this.activeIdListeners.delete(listener);
  };

  /** The currently winning camera's raw, un-blended live state — NOT `tick()`'s composited output. */
  get activeState(): CameraState | null {
    return this.activeId !== null ? this.candidates.get(this.activeId)!.state : null;
  }

  /** Camera `tick()`'s output is currently settled on. Lags behind `activeCameraId` while blending. */
  get liveCameraId(): string | null {
    return this.liveId;
  }

  isLive(id: string): boolean {
    return this.liveId === id;
  }

  /** Notified whenever `liveCameraId` actually changes — i.e. a blend just finished (or the very first
   *  camera ever went live). `useSyncExternalStore`-shaped, same as `subscribeActiveId`. */
  subscribeLiveId = (listener: () => void): (() => void) => {
    this.liveIdListeners.add(listener);
    return () => this.liveIdListeners.delete(listener);
  };

  private setLiveId(id: string | null): void {
    if (id === this.liveId) return;
    this.liveId = id;
    for (const listener of this.liveIdListeners) listener();
  }

  get isBlending(): boolean {
    return this.blend !== null;
  }

  /** Returns an unregister function. Re-registering an already-known id refreshes its `activatedAt`.
   *  The unregister function only touches its OWN entry — if another `registerCamera` call already
   *  overwrote this id (e.g. two `<VirtualCamera name="main">` mounted at once), an unmount of the
   *  older one won't tear down the newer one that replaced it. */
  registerCamera(config: VirtualCameraConfig): () => void {
    const candidate: Candidate = { ...config, activatedAt: ++activationCounter };
    this.candidates.set(config.id, candidate);
    this.recompute();
    return () => {
      if (this.candidates.get(config.id) !== candidate) return;
      this.candidates.delete(config.id);
      if (this.blend?.toId === config.id) {
        // target vanished mid-blend — clear liveId too, so tick() blends from the current composited
        // position toward whatever wins next, instead of snapping back to a stale liveId
        this.blend = null;
        this.setLiveId(null);
      } else if (this.liveId === config.id) {
        this.setLiveId(null);
      }
      this.recompute();
    };
  }

  /** Updates an already-registered candidate's priority in place and re-arbitrates — does NOT touch
   *  `activatedAt`/`liveId`/`blend`. Going through `registerCamera` again would reset `liveId`,
   *  spuriously restarting a blend even when the winner didn't change. */
  updatePriority(id: string, priority: number): void {
    const candidate = this.candidates.get(id);
    if (!candidate) return;
    candidate.priority = priority;
    this.recompute();
  }

  private recompute(): void {
    let winner: Candidate | null = null;
    for (const candidate of this.candidates.values()) {
      if (
        !winner ||
        candidate.priority > winner.priority ||
        (candidate.priority === winner.priority && candidate.activatedAt > winner.activatedAt)
      ) {
        winner = candidate;
      }
    }
    const newActiveId = winner?.id ?? null;
    if (newActiveId === this.activeId) return;
    this.activeId = newActiveId;
    for (const listener of this.activeIdListeners) listener();
  }

  /**
   * Advances any in-progress blend by `dt` and returns the composited `CameraState` — same scratch
   * instance every call, valid only until the next `tick()`.
   *
   * A new blend's "from" is always the CURRENT composited output frozen in place, not the previous
   * blend's original start — that's what makes mid-blend interruption correct.
   */
  tick(dt: number): CameraState {
    const blendTargetId = this.blend ? this.blend.toId : this.liveId;

    if (this.activeId !== null && this.activeId !== blendTargetId) {
      if (!this.everActivated) {
        this.everActivated = true;
        this.setLiveId(this.activeId);
        copyCameraState(this.output, this.candidates.get(this.activeId)!.state);
      } else {
        const fromId = this.blend ? this.blend.toId : this.liveId;
        copyCameraState(this.blendFromScratch, this.output);
        this.blend = {
          from: this.blendFromScratch,
          fromId,
          toId: this.activeId,
          definition: resolveBlendDefinition(this.customBlends, fromId, this.activeId, this.defaultBlend),
          elapsed: 0,
        };
      }
    }

    if (this.blend) {
      this.blend.elapsed += dt;
      const t = this.blend.definition.time <= 0 ? 1 : clamp(this.blend.elapsed / this.blend.definition.time, 0, 1);
      const toState = this.candidates.get(this.blend.toId)!.state;
      lerpCameraState(this.output, this.blend.from, toState, this.blend.definition.curve(t));

      if (t >= 1) {
        this.setLiveId(this.blend.toId);
        this.blend = null;
      }
    } else if (this.liveId !== null) {
      copyCameraState(this.output, this.candidates.get(this.liveId)!.state);
    }

    return this.output;
  }
}
