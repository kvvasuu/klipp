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
- `Body`: `HardLockToTarget` (instant), `Follow` (damped, with `BindingModes` controlling how the offset rotates with the target), `PositionComposer` (keeps the target at a chosen screen position/size instead of a fixed world offset).
- `Aim`: `HardLookAt` (instant), `RotateWithFollowTarget` (rigidly matches the target's own rotation, "glued" child-like framing), `RotationComposer` (keeps the look-at target at a chosen screen position with a dead zone + damping).

### 🎬 Multi-camera blending

- Any number of `<VirtualCamera>`s can coexist under one `<Klipp>` - `KlippCore` arbitrates by `priority` and cross-fades into the winner automatically on every switch, including mid-blend interruption (the outgoing camera stays live until its blend actually finishes).
- Custom blend curves and durations, globally or per specific from→to camera pair (Custom Blends).
- Four additional strategies on the same blend engine, for when arbitration needs more than "highest priority wins": `Sequencer` (timed playlist, with per-step hold/blend), `MixingCamera` (continuous N-way weighted cross-fade, caller-driven), `StateDrivenCamera` (candidates keyed to an external state machine), `ClearShot` (picks the best-scoring candidate via a pluggable `ShotQualityEvaluator`).

### 🌊 Noise & Impulse

- `Noise` stacks additive shake on top of whatever Body/Aim already computed - `BasicMultiChannelPerlin` gives independent amplitude/frequency per axis, in camera-local space.
- `Impulse` is event-driven, one-shot reactions (explosions, impacts) that any number of `<VirtualCamera>`s can react to independently, on a shared clock decoupled from any single camera's own `dt` - `ImpulseManager.generate()` fires an event, `ImpulseListenerNoise`/`ImpulseListener` sample its envelope with their own falloff/radius.

### 🖼️ GroupFraming

- Keeps a group of targets (`TargetGroup`, weighted, point/sphere/box members) in frame as a **distance ceiling** - dollies the camera back only as far as needed, never closer than Body/Aim already placed it.

### 🕹️ OrbitalControls

- Optional adapter around [`camera-controls`](https://github.com/yomotsu/camera-controls) for user-driven orbiting - the one deliberate exception to the Body/Aim split, since orbit input is inherently coupled position+rotation.

### ⚙️ Performance

- Zero-allocation core: every per-frame path (`update`, blending, damping) reuses scratch objects instead of allocating, safe to run every frame without generating garbage.
- SmoothDamp-style damping (`Damper`, `Vector3Damper`, `QuaternionDamper`) shared across Body/Aim/GroupFraming wherever a value needs to catch up smoothly instead of snapping.

## Quickstart

### Basic Setup

Wrap your scene in `<Klipp>` and declare a `<VirtualCamera>` with a Body and an Aim:

```tsx
import { Canvas } from '@react-three/fiber';
import { Klipp, VirtualCamera, Body, Aim } from '@kvvasuu/klipp';

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
