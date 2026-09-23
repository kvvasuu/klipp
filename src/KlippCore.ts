import { EventDispatcher } from 'three';
import type { CameraState } from './CameraState';
import { BlendCurves } from './blend/BlendCurves';
import { resolveBlendDefinition, type BlendDefinition, type CustomBlend } from './blend/BlendDefinition';
import { BlendDriver } from './blend/BlendDriver';
import { BlendHints } from './blend/BlendHints';

export type VirtualCameraConfig = {
  id: string;
  priority: number;
  /** Mutable live state read by the core. */
  state: CameraState;
  /** Blend hints for transitions involving this camera. */
  hints?: BlendHints;
};

type Candidate = VirtualCameraConfig & { activatedAt: number };

let activationCounter = 0;

const DEFAULT_BLEND: BlendDefinition = { curve: BlendCurves.easeInOut, time: 2 };

export type KlippCoreOptions = {
  /** Used when no `customBlends` entry matches a from→to transition. */
  defaultBlend?: BlendDefinition;
  customBlends?: CustomBlend[];
};

/** Transition events emitted by the core and virtual camera controllers. */
export type CameraTransitionEventMap = {
  /** A camera became the active candidate. */
  activated: { incoming: string; outgoing: string | null };
  /** A camera stopped contributing to output. */
  deactivated: { outgoing: string };
  /** A blend transition started. */
  blendCreated: { incoming: string; outgoing: string | null };
  /** A blend transition finished. */
  blendFinished: { liveId: string };
  /** An instant transition occurred. */
  cut: { incoming: string; outgoing: string | null };
};

/** Priority arbitration and transition blending for the active virtual camera. */
export class KlippCore extends EventDispatcher<CameraTransitionEventMap> {
  private candidates = new Map<string, Candidate>();
  private activeId: string | null = null;
  private readonly activeIdListeners = new Set<() => void>();

  private defaultBlend: BlendDefinition;
  private customBlends: CustomBlend[];

  private readonly driver: BlendDriver<string>;
  private readonly liveIdListeners = new Set<() => void>();

  private customBlendFromId: string | null = null;
  private customBlendFromHints: BlendHints = BlendHints.none;

  constructor(options: KlippCoreOptions = {}) {
    super();
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

  /** Subscribe to active camera changes. */
  subscribeActiveId = (listener: () => void): (() => void) => {
    this.activeIdListeners.add(listener);
    return () => this.activeIdListeners.delete(listener);
  };

  /** The active camera's raw state. */
  get activeState(): CameraState | null {
    return this.activeId !== null ? this.candidates.get(this.activeId)!.state : null;
  }

  /** Camera currently settled in the output. */
  get liveCameraId(): string | null {
    return this.driver.liveId;
  }

  isLive(id: string): boolean {
    return this.driver.liveId === id;
  }

  /** Subscribe to live camera changes. */
  subscribeLiveId = (listener: () => void): (() => void) => {
    this.liveIdListeners.add(listener);
    return () => this.liveIdListeners.delete(listener);
  };

  get isBlending(): boolean {
    return this.driver.isBlending;
  }

  /** Whether the core has produced a real camera output. */
  get hasEverActivated(): boolean {
    return this.driver.hasEverActivated;
  }

  /** Register a camera and return an unregister callback. */
  registerCamera(config: VirtualCameraConfig): () => void {
    const candidate: Candidate = { ...config, activatedAt: ++activationCounter };
    this.candidates.set(config.id, candidate);
    this.recompute();
    return () => {
      if (this.candidates.get(config.id) !== candidate) return;
      this.candidates.delete(config.id);
      // Continue from the current output if the camera disappears.
      this.withLiveIdChangeNotification(() => this.driver.forget(config.id));
      this.recompute();
    };
  }

  /** Update a candidate priority without restarting the current blend. */
  updatePriority(id: string, priority: number): void {
    const candidate = this.candidates.get(id);
    if (!candidate) return;
    candidate.priority = priority;
    this.recompute();
  }

  /** Update candidate hints in place. */
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
    const outgoing = this.activeId;
    this.activeId = newActiveId;
    for (const listener of this.activeIdListeners) listener();
    if (newActiveId !== null) this.dispatchEvent({ type: 'activated', incoming: newActiveId, outgoing });
  }

  /** Run `action` and notify listeners if the live camera changed. */
  private withLiveIdChangeNotification(action: () => void): void {
    const previousLiveId = this.driver.liveId;
    action();
    if (this.driver.liveId !== previousLiveId) {
      for (const listener of this.liveIdListeners) listener();
      if (previousLiveId !== null) this.dispatchEvent({ type: 'deactivated', outgoing: previousLiveId });
    }
  }

  /** Advance the blend and return the reusable output state. */
  tick(dt: number): CameraState {
    let result!: CameraState;
    // Track live-id changes across target selection and ticking.
    this.withLiveIdChangeNotification(() => {
      let justCreatedCut = false;
      if (this.activeId !== null && this.activeId !== this.driver.blendTargetId) {
        // Capture the id before dispatching events.
        const incoming = this.activeId;
        const definition = resolveBlendDefinition(
          this.customBlends,
          this.customBlendFromId,
          incoming,
          this.defaultBlend,
        );
        const toHints = this.candidates.get(incoming)?.hints ?? BlendHints.none;
        // Prefer current hints when the outgoing candidate still exists.
        const fromCandidate = this.customBlendFromId !== null ? this.candidates.get(this.customBlendFromId) : undefined;
        const fromHints = fromCandidate?.hints ?? this.customBlendFromHints;
        const outgoing = this.driver.blendTargetId;
        const isFirstEver = !this.driver.hasEverActivated;
        this.driver.setTarget(incoming, definition, fromHints | toHints);
        this.customBlendFromId = incoming;
        this.customBlendFromHints = toHints;

        if (isFirstEver) {
          this.dispatchEvent({ type: 'cut', incoming, outgoing: null });
        } else {
          this.dispatchEvent({ type: 'blendCreated', incoming, outgoing });
          if (!('damping' in definition) && definition.time <= 0) {
            justCreatedCut = true;
            this.dispatchEvent({ type: 'cut', incoming, outgoing });
          }
        }
      }

      const wasBlending = this.driver.isBlending;
      result = this.driver.tick(dt);
      if (wasBlending && !this.driver.isBlending && !justCreatedCut) {
        this.dispatchEvent({ type: 'blendFinished', liveId: this.driver.liveId! });
      }
    });
    return result;
  }
}
