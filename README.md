# Klipp 📹

[![Version](https://badgen.net/npm/v/@kvvasuu/klipp)](https://www.npmjs.com/package/@kvvasuu/klipp)
[![Examples](https://img.shields.io/static/v1?message=Examples&style=flat&colorA=000000&colorB=000000&label=&logo=threedotjs&logoColor=ffffff)](https://kvvasuu.github.io/klipp/examples/)
[![Docs](https://img.shields.io/static/v1?message=Docs&style=flat&colorA=000000&colorB=000000&label=&logo=googledocs&logoColor=ffffff)](https://kvvasuu.github.io/klipp/docs/)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Declarative virtual cameras for [React Three Fiber](https://github.com/pmndrs/react-three-fiber), inspired by Unity Cinemachine.

Describe the shots you want as components. Klipp picks the right one and smoothly blends between them.

### 👉 [See it in action on the examples site](https://kvvasuu.github.io/klipp/examples/)

Every feature has a live, interactive example. The source for all of them is in [`examples/`](examples).

```bash
npm install @kvvasuu/klipp
```

⚠️ Early-stage, experimental - API may change in future releases.

## What does it look like?

```tsx
import { Klipp, VirtualCamera, Body, Aim } from '@kvvasuu/klipp/react';

function Cameras({ playerRef, isCutscene }) {
  return (
    <Klipp>
      <VirtualCamera name="follow" priority={10}>
        <Body.Follow target={playerRef} offset={[0, 3, 8]} damping={0.5} />
        <Aim.HardLookAt target={playerRef} />
      </VirtualCamera>

      <VirtualCamera name="cutscene" priority={20} active={isCutscene}>
        <Body.HardLockToTarget target={[10, 2, 0]} />
        <Aim.HardLookAt target={playerRef} />
      </VirtualCamera>
    </Klipp>
  );
}
```

Every `<VirtualCamera>` is a shot. The one with the highest `priority` is on screen. When `isCutscene` turns on, Klipp blends over to the cutscene camera, and back again when it turns off.

## What's inside

- **Body** decides where the camera is: follow a target, lock onto it, or keep it at a spot on screen.
- **Aim** decides where it looks: at a target, with a dead zone, or wherever the user drags.
- **Noise** and **Impulse** add camera shake, continuous or from events like explosions.
- **Extension** adjusts the shot: keep a group in view, change the lens.
- **Blending** between cameras with curves, damping and per-camera rules.

## Documentation

Start with the [documentation](https://kvvasuu.github.io/klipp/docs/) for a short introduction, a step-by-step first camera, and the full API.

## Support

If this project helps you, consider supporting development.

- GitHub Sponsors: https://github.com/sponsors/kvvasuu

## License

[MIT](LICENSE) © kvvasuu
