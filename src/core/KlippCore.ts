import type { CameraState } from './CameraState.js';
import { EventDispatcher } from './EventDispatcher.js';
import { blendTargetId } from './blend/blend.js';
import type { BlendDefinition, CustomBlend } from './blend/BlendDefinition.js';
import type { BlendHints } from './blend/BlendHints.js';
import {
  DEFAULT_BLEND,
  createKlippState,
  registerKlippCamera,
  setKlippHints,
  setKlippPriority,
  tickKlipp,
  unregisterKlippCamera,
  type CameraTransitionEventMap,
  type KlippParams,
  type VirtualCameraConfig,
} from './klippState.js';

export type { CameraTransitionEventMap, VirtualCameraConfig };

export type KlippCoreOptions = {
  /** Used when no `customBlends` entry matches a from→to transition. */
  defaultBlend?: BlendDefinition;
  customBlends?: CustomBlend[];
};

/** Priority arbitration and transition blending for the active virtual camera. */
export class KlippCore extends EventDispatcher<CameraTransitionEventMap> {
  readonly state = createKlippState();
  private readonly params: KlippParams;
  private readonly activeIdListeners = new Set<() => void>();
  private readonly liveIdListeners = new Set<() => void>();
  private draining = false;

  constructor(options: KlippCoreOptions = {}) {
    super();
    this.params = {
      defaultBlend: options.defaultBlend ?? DEFAULT_BLEND,
      customBlends: options.customBlends ?? [],
    };
  }

  setDefaultBlend(defaultBlend?: BlendDefinition): void {
    this.params.defaultBlend = defaultBlend ?? DEFAULT_BLEND;
  }

  setCustomBlends(customBlends?: CustomBlend[]): void {
    this.params.customBlends = customBlends ?? [];
  }

  get activeCameraId(): string | null {
    return this.state.activeId;
  }

  isActive(id: string): boolean {
    return this.state.activeId === id;
  }

  /** Subscribe to active camera changes. */
  subscribeActiveId = (listener: () => void): (() => void) => {
    this.activeIdListeners.add(listener);
    return () => this.activeIdListeners.delete(listener);
  };

  /** The active camera's raw state. */
  get activeState(): CameraState | null {
    return this.state.activeId !== null ? this.state.cameras.get(this.state.activeId)!.state : null;
  }

  /** Camera currently settled in the output. */
  get liveCameraId(): string | null {
    return this.state.blend.liveId;
  }

  isLive(id: string): boolean {
    return this.state.blend.liveId === id;
  }

  /** Subscribe to live camera changes. */
  subscribeLiveId = (listener: () => void): (() => void) => {
    this.liveIdListeners.add(listener);
    return () => this.liveIdListeners.delete(listener);
  };

  get isBlending(): boolean {
    return this.state.blend.transition.active;
  }

  /** Destination of the active blend, or the live camera when settled. */
  get blendTargetId(): string | null {
    return blendTargetId(this.state.blend);
  }

  /** Whether the core has produced a real camera output. */
  get hasEverActivated(): boolean {
    return this.state.blend.hasEverActivated;
  }

  /** Register a camera and return an unregister callback. */
  registerCamera(config: VirtualCameraConfig): () => void {
    const camera = registerKlippCamera(this.state, config);
    this.drainEvents();
    return () => {
      unregisterKlippCamera(this.state, camera);
      this.drainEvents();
    };
  }

  /** Update a candidate priority without restarting the current blend. */
  updatePriority(id: string, priority: number): void {
    setKlippPriority(this.state, id, priority);
    this.drainEvents();
  }

  /** Update candidate hints in place. */
  updateHints(id: string, hints: BlendHints): void {
    setKlippHints(this.state, id, hints);
  }

  /** Advance the blend and return the reusable output state. */
  tick(dt: number): CameraState {
    const result = tickKlipp(this.state, this.params, dt);
    this.drainEvents();
    return result;
  }

  /** Notify subscribers and listeners of buffered events, including ones raised while notifying. */
  private drainEvents(): void {
    if (this.draining) return;
    this.draining = true;
    const events = this.state.events;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type === 'activeIdChanged') for (const listener of this.activeIdListeners) listener();
      else if (event.type === 'liveIdChanged') for (const listener of this.liveIdListeners) listener();
      else this.dispatchEvent(event);
    }
    events.length = 0;
    this.draining = false;
  }
}
