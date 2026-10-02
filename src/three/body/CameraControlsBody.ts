import CameraControls from 'camera-controls';
import * as THREE from 'three';
import type { CameraState } from '../../core/CameraState.js';
import { resolveTargetPosition, type Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';
import { resolveVector3, type Vector3Like } from '../resolve/resolveVector3.js';

CameraControls.install({ THREE });

const scratchTargetPosition = new THREE.Vector3();

export type CameraControlsOptions = {
  /** Viewport width divided by height. */
  aspect?: number;
  /** Where the camera starts. */
  initialPosition?: Vector3Like | null;
  /** A `CameraControls` subclass to use instead. */
  impl?: typeof CameraControls;
  /** Animate the internal `camera-controls` calls. */
  enableTransition?: boolean;
};

/** Adapts `camera-controls` orbit and dolly input to the virtual camera pipeline. */
export class CameraControlsBody {
  target: Target;
  targetSlot: TargetSlot | null = null;
  aspect: number;
  enableTransition: boolean;
  readonly controls: CameraControls;
  readonly initialPosition: THREE.Vector3 | null;

  private readonly camera: THREE.PerspectiveCamera;
  private hasResolvedTargetOnce = false;
  private wasResolvedLastFrame = false;

  constructor(target: Target, options?: CameraControlsOptions) {
    this.target = target;
    this.aspect = options?.aspect ?? 1;
    this.enableTransition = options?.enableTransition ?? false;
    this.camera = new THREE.PerspectiveCamera();
    this.controls = new (options?.impl ?? CameraControls)(this.camera);
    this.initialPosition =
      options?.initialPosition != null ? resolveVector3(new THREE.Vector3(), options.initialPosition) : null;

    if (this.initialPosition) {
      const { x, y, z } = this.initialPosition;
      this.controls.setPosition(x, y, z, false);
    }
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    this.camera.fov = out.fov;
    this.camera.near = out.near;
    this.camera.far = out.far;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();

    const resolved = resolveTargetPosition(scratchTargetPosition, this.target, this.targetSlot);

    // Reactivation re-anchors the orbit because the previous frame may be stale.
    if (resolved && (!this.wasResolvedLastFrame || justActivated)) {
      // Re-anchor from the current orbit before applying the new target.
      this.controls
        .normalizeRotations()
        .setTarget(scratchTargetPosition.x, scratchTargetPosition.y, scratchTargetPosition.z, this.enableTransition);
    } else if (resolved) {
      this.controls.moveTo(
        scratchTargetPosition.x,
        scratchTargetPosition.y,
        scratchTargetPosition.z,
        this.enableTransition,
      );
    }
    if (resolved) this.hasResolvedTargetOnce = true;
    this.wasResolvedLastFrame = resolved;

    this.controls.update(dt);

    // Keep the initial pose visible until a target resolves.
    const hasSomethingToShow =
      this.target == null || resolved || this.hasResolvedTargetOnce || this.initialPosition !== null;
    if (hasSomethingToShow) {
      this.camera.position.toArray(out.position);
      this.camera.quaternion.toArray(out.quaternion);
    }
    out.hasTarget = resolved;
    if (resolved) scratchTargetPosition.toArray(out.target);
    // A resolved target is also the look-at point used for blending.
    out.hasLookAtTarget = resolved;
    if (resolved) scratchTargetPosition.toArray(out.lookAtTarget);
  };
}
