# 📹 klipp

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Declarative virtual camera library for [react-three-fiber](https://github.com/pmndrs/react-three-fiber),
inspired by Unity Cinemachine.

⚠️ Pre-1.0 — the API can still change before a stable release, and klipp isn't published to npm yet. Try
it today via a workspace/git dependency, or follow along in [`example/`](example).

## Why

Camera code in a react-three-fiber scene usually ends up as a pile of `useFrame` callbacks doing manual
lerps, look-ats, and ad-hoc shake. klipp replaces that with declarative, composable pieces:

- **Body** and **Aim** compute a camera's position and rotation independently, so you mix and match them
  freely — follow a target with one damping curve while looking at a completely different one.
- **Noise** and **Impulse** stack additive shake/rumble on top, from ambient handheld wobble to one-shot
  explosion reactions.
- Any number of `<VirtualCamera>`s can coexist — klipp picks the highest-priority one and **blends**
  between them automatically on every switch.
- An optional [`camera-controls`](https://github.com/yomotsu/camera-controls) adapter adds user-driven
  orbiting without giving up any of the above.

## Quick look

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

Mount a second `<VirtualCamera>` with a higher `priority` and klipp blends into it automatically —
no manual state machine required.

## Development

This repo is the library itself (`src/`, built with `tsc` into `dist/`). [`example/`](example) is a
separate Vite app used as a live testbed while developing — it resolves `klipp` straight to `src/` via
a Vite alias, so there's no build step in the loop while iterating.

```bash
pnpm install
pnpm --filter example dev
```

Run `pnpm run build` at the root before relying on `dist/` (e.g. for type-checking the published shape),
and `pnpm run test` for the unit suite.

## License

[MIT](LICENSE) © kvvasuu
