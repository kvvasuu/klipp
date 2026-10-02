# Klipp 📹

[![Version](https://badgen.net/npm/v/@kvvasuu/klipp)](https://www.npmjs.com/package/@kvvasuu/klipp)
[![Examples](https://img.shields.io/static/v1?message=Examples&style=flat&colorA=000000&colorB=000000&label=&logo=threedotjs&logoColor=ffffff)](https://kvvasuu.github.io/klipp/examples/)
[![Docs](https://img.shields.io/static/v1?message=Docs&style=flat&colorA=000000&colorB=000000&label=&logo=googledocs&logoColor=ffffff)](https://kvvasuu.github.io/klipp/docs/)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A camera toolkit for the web, inspired by Unity Cinemachine. Describe the shots you want, and klipp picks the right one and blends between them.

The core is a complete camera system that runs anywhere: virtual cameras, priority, blending, framing, shake and input, with no renderer or framework attached. Integrations are thin layers on top: three.js and React Three Fiber today, with more to come, like TresJS. Your engine can be one too. Underneath, every piece is also plain data and functions for when you want full control.

### 👉 [See it in action on the examples site](https://kvvasuu.github.io/klipp/examples/)

```bash
npm install @kvvasuu/klipp
```

⚠️ Early-stage, experimental - API may change in future releases.

## Core

A follow camera with no framework, for any renderer. Keep the targets up to date, and put `klipp.shot` on your camera after every update:

```ts
import { vec3 } from 'math';
import { Klipp, FollowBody, HardLookAtAim, createTargetPose } from '@kvvasuu/klipp';

const klipp = new Klipp();
const player = createTargetPose();

const follow = klipp.addCamera('follow', { priority: 10 });
follow.body = new FollowBody(player, { offset: [0, 3, 8], damping: 0.5 });
follow.aim = new HardLookAtAim(player);

// every frame
vec3.copy(player.position, engine.playerPosition);
klipp.update(dt);
engineCamera.setPosition(klipp.shot.position);
engineCamera.setRotation(klipp.shot.quaternion);
```

## React Three Fiber

```tsx
import { Klipp, VirtualCamera, Body, Aim } from '@kvvasuu/klipp/react';

<Klipp>
  <VirtualCamera name="follow" priority={10}>
    <Body.Follow target={playerRef} offset={[0, 3, 8]} damping={0.5} />
    <Aim.HardLookAt target={playerRef} />
  </VirtualCamera>

  <VirtualCamera name="cutscene" priority={20} active={isCutscene}>
    <Body.HardLockToTarget target={[10, 2, 0]} />
    <Aim.HardLookAt target={playerRef} />
  </VirtualCamera>
</Klipp>;
```

Every `<VirtualCamera>` is a shot. The one with the highest `priority` is on screen. When `isCutscene` turns on, klipp blends over to the cutscene camera, and back again when it turns off.

## What's inside

- **Virtual cameras**: any number of shots, the one with the highest priority is on screen.
- **Body** decides where the camera is: follow a target, lock onto it, keep it at a spot on screen, or orbit.
- **Aim** decides where it looks: at a target, with a dead zone, or wherever the user drags.
- **Extension** adjusts the shot: keep a group in view, change the lens.
- **Noise** and **Impulse** add camera shake, continuous or from events like explosions.
- **Blending** between cameras with curves, damping, per-camera rules and blend hints.
- **Debugging**: framing zones on screen and camera frustums in the scene.

## Packages

| Entry point            | For                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `@kvvasuu/klipp`       | The core: the whole camera system, plus the data and functions it is built from. Built on [`math`](https://github.com/pmndrs/math). |
| `@kvvasuu/klipp/react` | React Three Fiber components.                                                                                                       |
| `@kvvasuu/klipp/three` | three.js: the core classes, ending in `Three`, reading `Object3D` targets and driving a `PerspectiveCamera`.                        |
| `@kvvasuu/klipp/dom`   | Mouse, touch and wheel input, and debug overlays.                                                                                   |

## Documentation

The [documentation](https://kvvasuu.github.io/klipp/docs/) shows every piece with the core and each integration.

## Support

If this project helps you, consider supporting development.

- GitHub Sponsors: https://github.com/sponsors/kvvasuu

## License

[MIT](LICENSE) © kvvasuu
