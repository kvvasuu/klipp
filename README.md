# Klipp

[![Version](https://badgen.net/npm/v/klipp)](https://www.npmjs.com/package/klipp)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Declarative virtual camera library for [React Three Fiber](https://github.com/pmndrs/react-three-fiber), inspired by Unity Cinemachine.

⚠️ Early-stage, experimental - API may change in future releases.

## Description

Camera code in a React Three Fiber scene usually ends up as a pile of `useFrame` callbacks doing manual lerps, look-ats, and ad-hoc shake.
Klipp replaces that with declarative, composable pieces instead.
Features include:

- **Body** and **Aim** compute a camera's position and rotation independently, so you mix and match them freely - follow a target with one damping curve while looking at a completely different one
- **Noise** and **Impulse** stack additive shake/rumble on top, from ambient handheld wobble to one-shot explosion reactions
- Any number of `<VirtualCamera>`s can coexist - Klipp picks the highest-priority one and **blends** between them automatically on every switch
- An optional [`camera-controls`](https://github.com/yomotsu/camera-controls) adapter adds user-driven orbiting without giving up any of the above

## Quickstart

### Basic Setup

Wrap your scene in `<Klipp>` and declare a `<VirtualCamera>` with a Body and an Aim:

```tsx
import { Canvas } from '@react-three/fiber';
import { Klipp, VirtualCamera, Body, Aim } from 'klipp';

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

## Support

If this project helps you, consider supporting development.

- GitHub Sponsors: https://github.com/sponsors/kvvasuu

## License

[MIT](LICENSE) © kvvasuu
