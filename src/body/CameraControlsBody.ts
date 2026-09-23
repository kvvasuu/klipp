import CameraControls from 'camera-controls';
import * as THREE from 'three';
import type { CameraState } from '../CameraState';
import { resolveTargetPosition, type Target } from '../resolve/Target';

CameraControls.install({ THREE });

const scratchTargetPosition = new THREE.Vector3();

/** Adapts `camera-controls` orbit and dolly input to the virtual camera pipeline. */
export class CameraControlsBody {
  target: Target;
  aspect: number;
  enableTransition: boolean;
  readonly controls: CameraControls;
  readonly initialPosition: THREE.Vector3 | null;

  private readonly camera: THREE.PerspectiveCamera;
  private hasResolvedTargetOnce = false;
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

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    this.camera.fov = out.fov;
    this.camera.near = out.near;
    this.camera.far = out.far;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();

    const resolved = resolveTargetPosition(scratchTargetPosition, this.target);

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
      out.position.copy(this.camera.position);
      out.quaternion.copy(this.camera.quaternion);
    }
    out.hasTarget = resolved;
    if (resolved) out.target.copy(scratchTargetPosition);
    // A resolved target is also the look-at point used for blending.
    out.hasLookAtTarget = resolved;
    if (resolved) out.lookAtTarget.copy(scratchTargetPosition);
  };
}
