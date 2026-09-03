import type { CameraState } from './CameraState';
import { BlendCurves } from './blend/BlendCurves';
import { resolveBlendDefinition, type BlendDefinition, type CustomBlend } from './blend/BlendDefinition';
import { BlendDriver } from './blend/BlendDriver';
import { BlendHints } from './blend/BlendHints';

export type VirtualCameraConfig = {
  id: string;
  priority: number;
  /** Reference to this camera's live state — `KlippCore` reads it directly. Whoever registers it is
   *  responsible for keeping it updated in place (zero-allocation convention, see CLAUDE.md). */
  state: CameraState;
  /** Combined (OR'd) with whichever OTHER camera is on the other end of a transition into/out of this
   *  one - see `BlendHints`. Default `BlendHints.none`. */
  hints?: BlendHints;
};

type Candidate = VirtualCameraConfig & { activatedAt: number };

let activationCounter = 0;

const DEFAULT_BLEND: BlendDefinition = { curve: BlendCurves.easeInOut, time: 2 };

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
 * lagging, composited state separately from `activeCameraId`. The actual snap/blend/composite mechanics
 * live in `BlendDriver`, shared with `Sequencer`/`StateDrivenCamera`/`ClearShot` — this class only owns
 * priority arbitration (`recompute`) and `CustomBlend` resolution, then hands the decided winner to it.
 */
export class KlippCore {
  private candidates = new Map<string, Candidate>();
  private activeId: string | null = null;
  private readonly activeIdListeners = new Set<() => void>();

  private defaultBlend: BlendDefinition;
  private customBlends: CustomBlend[];

  private readonly driver: BlendDriver<string>;
  private readonly liveIdListeners = new Set<() => void>();

  /** Unlike `driver.blendTargetId`, survives the outgoing camera unregistering mid-transition. */
  private customBlendFromId: string | null = null;
  /** Fallback for `customBlendFromId`'s `hints` once its candidate entry is gone (`tick()` prefers the
   *  live value when the candidate still exists, since `hints` can change while a camera stays active). */
  private customBlendFromHints: BlendHints = BlendHints.none;

  constructor(options: KlippCoreOptions = {}) {
    this.defaultBlend = options.defaultBlend ?? DEFAULT_BLEND;
    this.customBlends = options.customBlends ?? [];
    this.driver = new BlendDriver((id) => this.candidates.get(id)!.state);
  }

  setDefaultBlend(defaultBlend?: BlendDefinition): void {
    this.defaultBlend = defaultBlend ?? DEFAULT_BLEND;
  }

  setCustomBlends(customBlends?: CustomBlend[]): void {
    this.customBlends = customBlends ?? [];
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
    return this.driver.liveId;
  }

  isLive(id: string): boolean {
    return this.driver.liveId === id;
  }

  /** Notified whenever `liveCameraId` actually changes — i.e. a blend just finished (or the very first
   *  camera ever went live). `useSyncExternalStore`-shaped, same as `subscribeActiveId`. */
  subscribeLiveId = (listener: () => void): (() => void) => {
    this.liveIdListeners.add(listener);
    return () => this.liveIdListeners.delete(listener);
  };

  get isBlending(): boolean {
    return this.driver.isBlending;
  }

  /** Whether ANY candidate has ever won arbitration — unlike `liveCameraId === null`, stays `true` even
   *  on a tick where the live candidate was just forgotten mid-blend (e.g. its `<VirtualCamera>`
   *  unregistering right as a new one takes over) — `tick()`'s output is still a real, meaningful frame
   *  worth rendering in that case, not the untouched default `CameraState`. See `Klipp.tsx`'s `useFrame`. */
  get hasEverActivated(): boolean {
    return this.driver.hasEverActivated;
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
      // target vanished mid-blend (or while live) — forget it, so tick() blends from the current
      // composited position toward whatever wins next, instead of snapping back to a stale id whose
      // state no longer exists
      this.withLiveIdChangeNotification(() => this.driver.forget(config.id));
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

  /** Updates an already-registered candidate's `hints` in place - no re-arbitration needed, `hints` are
   *  only consulted lazily when a NEW blend into/out of this candidate starts. Also refreshes
   *  `customBlendFromHints` when `id` is the camera it was captured from - otherwise a live camera's
   *  hints changing (e.g. a toggle) while it's NOT mid-transition would go stale: it may already have
   *  unregistered (the `active`-prop toggle pattern) by the time a future transition needs its hints. */
  updateHints(id: string, hints: BlendHints): void {
    const candidate = this.candidates.get(id);
    if (candidate) candidate.hints = hints;
    if (id === this.customBlendFromId) this.customBlendFromHints = hints;
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

  /** Runs `action`, then notifies `liveIdListeners` if it changed `driver.liveId` as a side effect —
   *  shared between `tick()` and the unregister path above, the two places that can move it. */
  private withLiveIdChangeNotification(action: () => void): void {
    const previousLiveId = this.driver.liveId;
    action();
    if (this.driver.liveId !== previousLiveId) {
      for (const listener of this.liveIdListeners) listener();
    }
  }

  /**
   * Advances any in-progress blend by `dt` and returns the composited `CameraState` — same scratch
   * instance every call, valid only until the next `tick()`.
   *
   * Before any candidate has ever won arbitration (`hasEverActivated === false`), this is just the
   * untouched default `CameraState` (origin, identity, fov 50) — check `hasEverActivated` first if that
   * distinction matters to the caller, same as `Klipp.tsx` does before writing this onto the real camera.
   * NOT `liveCameraId === null` — that's also transiently true right after a live candidate is forgotten
   * mid-blend, where this IS already a real, meaningful composited frame.
   */
  tick(dt: number): CameraState {
    let result!: CameraState;
    // setTarget AND tick both need to be inside the SAME before/after window — setTarget's own first-
    // ever-activation snap changes driver.liveId synchronously, before tick() even runs, so measuring
    // "before" only around tick() would already see the post-snap value and never detect the change
    this.withLiveIdChangeNotification(() => {
      if (this.activeId !== null && this.activeId !== this.driver.blendTargetId) {
        const definition = resolveBlendDefinition(
          this.customBlends,
          this.customBlendFromId,
          this.activeId,
          this.defaultBlend,
        );
        const toHints = this.candidates.get(this.activeId)?.hints ?? BlendHints.none;
        // prefer the outgoing camera's CURRENT hints (it may have changed since it went live) - the
        // captured customBlendFromHints is only a fallback for when it already unregistered mid-transition
        const fromCandidate = this.customBlendFromId !== null ? this.candidates.get(this.customBlendFromId) : undefined;
        const fromHints = fromCandidate?.hints ?? this.customBlendFromHints;
        this.driver.setTarget(this.activeId, definition, fromHints | toHints);
        this.customBlendFromId = this.activeId;
        this.customBlendFromHints = toHints;
      }
      result = this.driver.tick(dt);
    });
    return result;
  }
}
