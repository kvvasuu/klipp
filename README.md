# Klipp 📹

[![Version](https://badgen.net/npm/v/@kvvasuu/klipp)](https://www.npmjs.com/package/@kvvasuu/klipp)
[![Docs](https://img.shields.io/static/v1?message=Docs&style=flat&colorA=000000&colorB=000000&label=&logo=googledocs&logoColor=ffffff)](https://kvvasuu.github.io/klipp/docs/)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Declarative virtual camera library for [React Three Fiber](https://github.com/pmndrs/react-three-fiber), inspired by Unity Cinemachine.

⚠️ Early-stage, experimental - API may change in future releases.

Camera code in a React Three Fiber scene usually ends up as a pile of `useFrame` callbacks doing manual lerps, look-ats, and ad-hoc shake. Klipp replaces that with small, independent, composable pieces instead - a camera's **position** (`Body`) and **rotation** (`Aim`) are computed separately, `Noise`/`Extension` stack shake and framing adjustments on top, and any number of `<VirtualCamera>`s can coexist while Klipp arbitrates priority and blends between them automatically.

```bash
npm install @kvvasuu/klipp
```

## What does it look like?

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

Mount a second `<VirtualCamera>` with a higher `priority` and Klipp blends into it automatically - no manual state machine required.

## Documentation

The [full documentation](https://kvvasuu.github.io/klipp/docs/) covers every `Body`/`Aim`/`Noise`/`Extension`, `CameraControls`, blending, debugging, and how to write your own custom pieces.

A live [examples site](https://kvvasuu.github.io/klipp/examples/) covers every piece of the API - the same code lives in [`examples/`](examples).

## Support

If this project helps you, consider supporting development.

- GitHub Sponsors: https://github.com/sponsors/kvvasuu

## License

[MIT](LICENSE) © kvvasuu
