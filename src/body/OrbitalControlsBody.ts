import CameraControls from 'camera-controls';
import * as THREE from 'three';
import type { CameraState } from '../CameraState';
import { resolveTargetPosition, type Target } from '../resolve/Target';

CameraControls.install({ THREE });

const scratchTargetPosition = new THREE.Vector3();

/**
 * User-input-driven orbit around a target — klipp's adapter for `camera-controls` (yomotsu/
 * camera-controls).
 *
 * **The ONE exception to "Body never computes rotation".** Orbiting is inherently coupled
 * position+rotation — a camera orbiting a target is always looking at it, there's no independent Aim to
 * decompose that into. Writes both `out.position` AND `out.quaternion`. Pair with an `Aim` anyway to
 * override just the look direction — it runs after Body and overwrites this rotation while leaving the
 * input-driven position untouched.
 *
 * Delegates to a PRIVATE, PER-INSTANCE, never-rendered `THREE.PerspectiveCamera` that only
 * `camera-controls` mutates. Must be per-instance, not a shared scratch — `camera-controls` persists its
 * orbit/dolly state ON this camera between frames, so two instances sharing one would fight over it.
 *
 * `update(out, dt)` syncs the scratch camera's lens from `out`/`aspect`, pushes `target` into
 * `controls.moveTo(x, y, z, false)` (deliberately not `setTarget`, which re-aims without moving the
 * camera — useless for a moving target, since the dragged/scrolled offset would silently drift instead of
 * staying glued to it), then `controls.update(dt)` and copies the result into `out`.
 *
 * **Zero damping of klipp's own on top** — `camera-controls` already has its own smoothing (`smoothTime`,
 * `draggingSmoothTime`); wrapping that in another `Damper` would double-smooth. None of its many options
 * get a klipp prop — configure the real thing directly through `controls`, a public field pointing at a
 * genuine `CameraControls` instance (get it via this class's `ref`).
 *
 * Doesn't call `controls.connect()`/`.disconnect()` itself — that's the React wrapper's job (needs the
 * canvas DOM element from `useThree`).
 */
export class OrbitalControlsBody {
  target: Target;
  aspect: number;
  readonly controls: CameraControls;

  private readonly camera: THREE.PerspectiveCamera;

  constructor(target: Target, aspect = 1, initialDistance = 10) {
    this.target = target;
    this.aspect = aspect;
    this.camera = new THREE.PerspectiveCamera();
    this.controls = new CameraControls(this.camera);
    // a fresh camera starts at the origin, coincident with the target — a degenerate zero-distance orbit.
    // setPosition (not setLookAt) gives it a real starting distance while still gazing at the target.
    this.controls.setPosition(0, 0, initialDistance, false);
  }

  update = (out: CameraState, dt: number): void => {
    this.camera.fov = out.fov;
    this.camera.near = out.near;
    this.camera.far = out.far;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();

    if (resolveTargetPosition(scratchTargetPosition, this.target)) {
      this.controls.moveTo(scratchTargetPosition.x, scratchTargetPosition.y, scratchTargetPosition.z, false);
    }

    this.controls.update(dt);

    out.position.copy(this.camera.position);
    out.quaternion.copy(this.camera.quaternion);
  };
}
