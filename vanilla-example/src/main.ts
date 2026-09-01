import {
  applyCameraState,
  createCameraState,
  FollowBody,
  HardLockToTargetBody,
  HardLookAtAim,
  KlippCore,
  RotationComposerAim,
  VirtualCameraController,
} from '@kvvasuu/klipp';
import {
  BoxGeometry,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
if (!canvas) throw new Error('#canvas not found');

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new Scene();
scene.add(new GridHelper(20, 20));
const light = new PointLight(0xffffff, 100, 100);
light.position.set(0, 5, 0);
scene.add(light);

const cube = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x4f8dfd }));
scene.add(cube);

const camera = new PerspectiveCamera(50, 1, 0.1, 1000);

// Pure klipp core — no React, no @react-three/fiber. VirtualCameraController is the same class
// <VirtualCamera> uses internally to run Body -> Aim -> Extension -> Noise each frame. Two of them,
// registered on KlippCore, demonstrate the same priority-arbitration + blend engine <Klipp> drives.
const core = new KlippCore();

const orbitState = createCameraState();
const orbitController = new VirtualCameraController('orbit-cam');
const orbitBody = new FollowBody(cube, new Vector3(0, 3, 8), 0.5);
const orbitAim = new HardLookAtAim(cube);
orbitController.registerBody(orbitBody.update);
orbitController.registerAim(orbitAim.update);

// Fixed tripod position — Body never moves it (target is a plain Vector3, not the cube). Aim is
// RotationComposer with a deadZone: it only pans once the cube drifts outside that zone, instead of
// re-centering every frame like HardLookAt.
const staticState = createCameraState();
const staticController = new VirtualCameraController('static-cam');
const staticBody = new HardLockToTargetBody(new Vector3(6, 2, 6));
const staticAim = new RotationComposerAim(cube, [0, 0], canvas.clientWidth / canvas.clientHeight, [0.3, 0.3], 0.4);
staticController.registerBody(staticBody.update);
staticController.registerAim(staticAim.update);

core.registerCamera({ id: 'orbit-cam', priority: 10, state: orbitState });
core.registerCamera({ id: 'static-cam', priority: 0, state: staticState });

let orbitIsActive = true;
canvas.addEventListener('click', () => {
  orbitIsActive = !orbitIsActive;
  core.updatePriority('orbit-cam', orbitIsActive ? 10 : 0);
  core.updatePriority('static-cam', orbitIsActive ? 0 : 10);
});

function resize(): void {
  const width = canvas!.clientWidth;
  const height = canvas!.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  staticAim.aspect = width / height;
}
window.addEventListener('resize', resize);
resize();

const clock = new Timer();
let justActivated = true;

function animate(): void {
  clock.update();
  const dt = clock.getDelta();
  cube.position.x = Math.sin(clock.getElapsed() * 0.5) * 4;
  cube.rotation.y += dt;

  // both controllers update every frame, whether their camera is currently live or not — same as
  // <VirtualCamera>, so the losing side's state stays fresh and ready to blend from/to
  orbitController.update(orbitState, dt, justActivated);
  staticController.update(staticState, dt, justActivated);
  justActivated = false;

  const result = core.tick(dt);
  applyCameraState(camera, result, canvas!.clientWidth, canvas!.clientHeight);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
