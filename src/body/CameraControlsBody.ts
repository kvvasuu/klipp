import CameraControls from 'camera-controls';
import * as THREE from 'three';
import type { CameraState } from '../CameraState';
import { resolveTargetPosition, type Target } from '../resolve/Target';

CameraControls.install({ THREE });

const scratchTargetPosition = new THREE.Vector3();

/**
 * User-input-driven orbit around a target - klipp's adapter for `camera-controls`.
 *
 * Exception to "Body never computes rotation": orbiting is inherently coupled position+rotation,
 * writes both `out.position` and `out.quaternion`.
 *
 * No `target`: full free camera-controls.
 * With a `target`: locked orbit/dolly via `moveTo` each frame, which re-overrides any truck/pan drift back onto it.
 *
 * `initialPosition` is applied once at construction, independent of `target` resolution.
 */
export class CameraControlsBody {
  target: Target;
  aspect: number;
  enableTransition: boolean;
  readonly controls: CameraControls;
  readonly initialPosition: THREE.Vector3 | null;

  private readonly camera: THREE.PerspectiveCamera;
  private hasResolvedTargetOnce = false;
  /** Whether `target` resolved last frame too - distinguishes continuous tracking (`moveTo`) from a
   *  re-acquisition after a gap, which needs `setTarget` instead to avoid a stale-delta jump. */
  private wasResolvedLastFrame = false;

  constructor(
    target: Target,
    aspect = 1,
    initialPosition: THREE.Vector3 | null = null,
    impl: typeof CameraControls = CameraControls,
    enableTransition = false,
  ) {
    this.target = target;
    this.aspect = aspect;
    this.enableTransition = enableTransition;
    this.camera = new THREE.PerspectiveCamera();
    this.controls = new impl(this.camera);
    this.initialPosition = initialPosition;

    if (initialPosition) {
      this.controls.setPosition(initialPosition.x, initialPosition.y, initialPosition.z, false);
    }
  }

  update = (out: CameraState, dt: number): void => {
    this.camera.fov = out.fov;
    this.camera.near = out.near;
    this.camera.far = out.far;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();

    const resolved = resolveTargetPosition(scratchTargetPosition, this.target);

    if (resolved && !this.wasResolvedLastFrame) {
      // re-anchor in place rather than moveTo, which would jump by a stale delta
      this.controls.setTarget(
        scratchTargetPosition.x,
        scratchTargetPosition.y,
        scratchTargetPosition.z,
        this.enableTransition,
      );
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

    // no-op only while a promised target has never resolved and there's no initialPosition to show
    const hasSomethingToShow =
      this.target == null || resolved || this.hasResolvedTargetOnce || this.initialPosition !== null;
    if (hasSomethingToShow) {
      out.position.copy(this.camera.position);
      out.quaternion.copy(this.camera.quaternion);
    }
    out.hasTarget = resolved;
    if (resolved) out.target.copy(scratchTargetPosition);
  };
}
