import { Environment, Grid, OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useState, type ReactNode } from 'react';
import { PerspectiveCamera } from 'three';

/** `CameraFrustumHelper`s render onto this layer (see `SpectatorFrustum`) so they show up in the
 *  spectator inset without ever appearing in the main view - that view IS the demo camera's own POV. */
export const spectatorLayer = 1;

const defaultSpectatorPosition: [number, number, number] = [-6, 5, -9];
const defaultSpectatorTarget: [number, number, number] = [0, 2, 0];

/** Renders the scene a second time into a small DOM-positioned inset (see `SceneRoute`'s `.spectator-
 *  inset` div), from an orbit-controlled camera independent of whichever camera a scene's own `<Klipp>`
 *  is driving. Taking over rendering at `useFrame` priority 1 replaces r3f's own default render entirely
 *  for this Canvas, so the main pass has to be issued here too, not just the inset one. */
function SpectatorInset({
  element,
  position,
  target,
}: {
  element: HTMLDivElement | null;
  position: [number, number, number];
  target: [number, number, number];
}) {
  const [spectatorCamera] = useState(() => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.layers.enable(spectatorLayer);
    return camera;
  });

  useFrame(({ gl, scene, camera, size }) => {
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.render(scene, camera);

    if (!element) return;
    const canvasRect = gl.domElement.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = rect.left - canvasRect.left;
    const y = canvasRect.height - (rect.top - canvasRect.top) - rect.height;

    // spectatorCamera is a stable held instance (like a ref), not reactive state - direct mutation is the point
    // oxlint-disable-next-line react/immutability
    spectatorCamera.aspect = rect.width / rect.height;
    spectatorCamera.updateProjectionMatrix();

    gl.setScissorTest(true);
    gl.setScissor(x, y, rect.width, rect.height);
    gl.setViewport(x, y, rect.width, rect.height);
    gl.render(scene, spectatorCamera);
    gl.setScissorTest(false);
  }, 1);

  if (!element) return null;
  return <OrbitControls camera={spectatorCamera} domElement={element} target={target} makeDefault={false} />;
}

/** Shared across every example - a bright, neutral environment/floor so each scene only has to care
 *  about its own subject, plus a spectator inset (see `SpectatorInset`) for watching a scene's camera
 *  from outside. `spectatorPosition`/`spectatorTarget` (from the registry entry - see `SceneRoute`) let
 *  each scene start the inset framed at whatever's actually worth watching, since that differs scene to
 *  scene (e.g. a fixed camera's own vantage vs. one that moves). */
export function BaseScene({
  children,
  insetElement,
  spectatorPosition = defaultSpectatorPosition,
  spectatorTarget = defaultSpectatorTarget,
}: {
  children: ReactNode;
  insetElement: HTMLDivElement | null;
  spectatorPosition?: [number, number, number];
  spectatorTarget?: [number, number, number];
}) {
  return (
    <>
      <SpectatorInset element={insetElement} position={spectatorPosition} target={spectatorTarget} />
      <Environment preset="studio" background blur={0.8} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[6, 10, 4]} intensity={0.8} />
      <Grid
        args={[60, 60]}
        cellSize={0.5}
        cellColor="#c7c7cf"
        sectionSize={2.5}
        sectionColor="#9a9aa8"
        fadeDistance={35}
        fadeStrength={1.5}
        infiniteGrid
      />
      {children}
    </>
  );
}
