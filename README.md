# Klipp 📹

[![Version](https://badgen.net/npm/v/@kvvasuu/klipp)](https://www.npmjs.com/package/@kvvasuu/klipp)
[![Examples](https://img.shields.io/static/v1?message=Examples&style=flat&colorA=000000&colorB=000000&label=&logo=threedotjs&logoColor=ffffff)](https://kvvasuu.github.io/klipp/examples/)
[![Docs](https://img.shields.io/static/v1?message=Docs&style=flat&colorA=000000&colorB=000000&label=&logo=googledocs&logoColor=ffffff)](https://kvvasuu.github.io/klipp/docs/)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A camera toolkit for the web, inspired by Unity Cinemachine. Describe the shots you want, and klipp picks the right one and blends between them.

The core runs anywhere, with no renderer or framework attached. Integrations are thin layers on top: three.js and React Three Fiber today, with more to come, like TresJS.

```bash
npm install @kvvasuu/klipp
```

⚠️ Early-stage, experimental - the API may change.

## Core

```ts
import { Klipp, FollowBody, HardLookAtAim, createTargetPose } from '@kvvasuu/klipp';

const klipp = new Klipp();
const player = createTargetPose(); // keep player.position up to date

const follow = klipp.addCamera('follow', { priority: 10 });
follow.body = new FollowBody(player, { offset: [0, 3, 8], damping: 0.5 });
follow.aim = new HardLookAtAim(player);

// every frame
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

## What's inside

- **Virtual cameras** with priorities, and **blending** between them.
- **Body** and **Aim**: follow, frame or look at targets, or let the user orbit and look around.
- **Extension**, **Noise** and **Impulse**: group framing, lens, and camera shake.
- **Debugging**: framing zones and camera frustums.

## Packages

| Entry point            | For                                                          |
| ---------------------- | ------------------------------------------------------------ |
| `@kvvasuu/klipp`       | The core, built on [`math`](https://github.com/pmndrs/math). |
| `@kvvasuu/klipp/three` | three.js classes, ending in `Three`.                         |
| `@kvvasuu/klipp/react` | React Three Fiber components.                                |
| `@kvvasuu/klipp/dom`   | Mouse, touch and wheel input, and debug overlays.            |

## Links

- [Documentation](https://kvvasuu.github.io/klipp/docs/)
- [Examples](https://kvvasuu.github.io/klipp/examples/)
- [GitHub Sponsors](https://github.com/sponsors/kvvasuu), if this project helps you

## License

[MIT](LICENSE) © kvvasuu
