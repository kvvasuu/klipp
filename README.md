# Klipp 📹

[![Version](https://badgen.net/npm/v/@kvvasuu/klipp)](https://www.npmjs.com/package/@kvvasuu/klipp)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Declarative virtual camera library for [React Three Fiber](https://github.com/pmndrs/react-three-fiber), inspired by Unity Cinemachine.

⚠️ Early-stage, experimental - API may change in future releases.

## Description

Camera code in a React Three Fiber scene usually ends up as a pile of `useFrame` callbacks doing manual lerps, look-ats, and ad-hoc shake.
Klipp replaces that with declarative, composable pieces instead.

### 🎥 Body & Aim - independent by design

- A camera's **position** (`Body`) and **rotation** (`Aim`) are computed by two completely separate pieces - follow one target with one damping curve while looking at a totally different one.
- `Body`: `HardLockToTarget` (instant), `Follow` (damped, with `BindingModes` controlling how the offset rotates with the target), `PositionComposer` (keeps the target at a chosen screen position with a dead zone + damping, reacting to its nearest screen-space edge - auto-detected from a `Mesh`/`Line`/`Points`, or given explicitly via `radius`/`size` - instead of just its center point).
- `Aim`: `HardLookAt` (instant), `RotateWithFollowTarget` (rigidly matches the target's own rotation, "glued" child-like framing), `RotationComposer` (the same screen-position/dead-zone/edge-aware composition as `PositionComposer`, but for rotation).
- A target that deforms (a `SkinnedMesh` bone animation, a mutated `BufferGeometry`) can call `recalculateSize()` on its `PositionComposerBody`/`RotationComposerAim`/`GroupFramingExtension` ref to force a fresh measurement on demand, instead of paying for one every frame.

### 🎬 Multi-camera blending

- Any number of `<VirtualCamera>`s can coexist under one `<Klipp>` - `KlippCore` arbitrates by `priority` and cross-fades into the winner automatically on every switch, including mid-blend interruption (the outgoing camera stays live until its blend actually finishes).
- Custom blend curves and durations, globally or per specific from→to camera pair (Custom Blends).
- Four additional strategies on the same blend engine, for when arbitration needs more than "highest priority wins": `Sequencer` (timed playlist, with per-step hold/blend), `MixingCamera` (continuous N-way weighted cross-fade, caller-driven), `StateDrivenCamera` (candidates keyed to an external state machine), `ClearShot` (picks the best-scoring candidate via a pluggable `ShotQualityEvaluator`).

### 🌊 Noise & Impulse

- `Noise` stacks additive shake on top of whatever Body/Aim already computed - `BasicMultiChannelPerlin` gives independent amplitude/frequency per axis, in camera-local space.
- `Impulse` is event-driven, one-shot reactions (explosions, impacts) that any number of `<VirtualCamera>`s can react to independently, on a shared clock decoupled from any single camera's own `dt` - `ImpulseManager.generate()` fires an event, `ImpulseListenerNoise`/`ImpulseListener` sample its envelope with their own falloff/radius.

### 🖼️ Extensions

- `Extension`s run after Body+Aim and before Noise - a stacking slot for adjustments that need the shot's final orientation, or fields Body/Aim don't touch at all.
- `GroupFraming` keeps a group of targets (`TargetGroup`, weighted, point/sphere/box members) in frame as a **distance ceiling** - dollies the camera back only as far as needed, never closer than Body/Aim already placed it.
- `Lens` overrides `fov`/`near`/`far`, each independently damped - settable via prop or `ref`, so an external `useFrame` animating the lens doesn't fight Klipp's own driver every frame.

### 🔍 Debug Visualization

- `PositionComposer`/`RotationComposer`/`GroupFraming` all take a `debug` prop that draws their dead zone/hard limit/padding as bordered, dimmed boxes directly on the canvas - lightweight DOM manipulation, no extra dependency, visible only while that camera is actually live.

### 🕹️ CameraControls

- Optional adapter around [`camera-controls`](https://github.com/yomotsu/camera-controls) for user-driven orbiting - the one deliberate exception to the Body/Aim split, since orbit input is inherently coupled position+rotation.

### ⚙️ Performance

- Zero-allocation core: every per-frame path (`update`, blending, damping) reuses scratch objects instead of allocating, safe to run every frame without generating garbage.
- SmoothDamp-style damping (`Damper`, `Vector3Damper`, `QuaternionDamper`) shared across Body/Aim/GroupFraming wherever a value needs to catch up smoothly instead of snapping.

The base `@kvvasuu/klipp` entry is the framework-agnostic engine (no React/R3F required) - the React bindings (`<Klipp>`, `<VirtualCamera>`, `Body`, `Aim`, `Noise`, `Extension`, ...) live under `@kvvasuu/klipp/react`.

## Quickstart

### Basic Setup

Wrap your scene in `<Klipp>` and declare a `<VirtualCamera>` with a Body and an Aim:

```tsx
import { Canvas } from '@react-three/fiber';
import { Klipp, VirtualCamera, Body, Aim } from '@kvvasuu/klipp/react';

function Scene({ playerRef }) {
  return (
    <Canvas>
      <Klipp>
        <VirtualCamera name="follow-cam" priority={10}>
          <Body.Follow target={playerRef} offset={[0, 3, 8]} damping={0.5} />
          <Aim.HardLookAt target={playerRef} />
        </VirtualCamera>
      </Klipp>
      {/* ...scene content... */}
    </Canvas>
  );
}
```

### Blending Between Cameras

Mount a second `<VirtualCamera>` with a higher `priority` and Klipp blends into it automatically - no manual state machine required:

```tsx
<Klipp>
  <VirtualCamera name="follow-cam" priority={10} active={true}>
    <Body.Follow target={playerRef} offset={[0, 3, 8]} damping={0.5} />
    <Aim.HardLookAt target={playerRef} />
  </VirtualCamera>
  <VirtualCamera name="cutscene-cam" active={isCutscene} priority={20}>
    <Body.HardLockToTarget target={cutsceneCamPosition} />
    <Aim.HardLookAt target={playerRef} />
  </VirtualCamera>
</Klipp>
```

## Documentation & Examples

More examples live in [`example/`](example) - a live testbed covering every Body/Aim/Noise/Extension combination shipped so far.

A hosted live demo, showcase, and full API documentation are coming soon.

## Support

If this project helps you, consider supporting development.

- GitHub Sponsors: https://github.com/sponsors/kvvasuu

## License

[MIT](LICENSE) © kvvasuu
