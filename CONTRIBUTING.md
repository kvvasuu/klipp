# Contributing

This project uses semantic commits and semver.

This repo is the library itself (`src/`, built with `tsc` into `dist/`). [`examples/`](examples) is a
separate Vite app used as a live testbed while developing. It resolves `@kvvasuu/klipp` straight to `src/`
via a Vite alias, so there's no build step in the loop while iterating.

## Setup

```bash
pnpm install
pnpm --filter examples dev
```

## Scripts (run at the repo root)

- `pnpm run build` - compiles `src/` to `dist/` via `tsc`.
- `pnpm run test` - the unit suite (`vitest`), including the golden trajectory tests.
- `pnpm run lint` - `oxlint`, which also enforces the layer boundaries below.
- `pnpm run typecheck` - `tsc` over `src/` and, via `test/tsconfig.json`, the tests.
- `pnpm run format` - `prettier`.
- `pnpm run bench` - the performance benchmark suite (`@pmndrs/labs`).

## Layers

`src/` is split into layers. Each one may only import from the layers below it:

- `src/core/` - camera logic as plain data and functions, on [`math`](https://github.com/pmndrs/math)
  only. No three.js, React or DOM.
- `src/three/` - classes that read `Object3D` targets and write three.js cameras.
- `src/dom/` - pointer and keyboard input, and debug overlays. Depends on `core` only.
- `src/react/` - React Three Fiber components.

Core modules follow one pattern: an `XParams` type for settings, an `XState` type with `createXState()`
for memory, and `updateX(out, state, params, ...)`. Classes are thin wrappers that pass their own fields
as params. Hot paths don't allocate: reuse module-level scratch values instead.

## Tests

- `test/` mirrors `src/`. `test/core/` imports only `math`, like `src/core/`.
- One test per behavior. Keep tests that guard a real bug and say so in the name.
- React tests cover wiring only (registration, props, unmount). Behavior is tested on the class.
- `test/golden/` compares every piece frame by frame to recorded fixtures. If a change there is intended,
  re-record on Node 22 with `pnpm vitest run test/golden --mode golden-record` and commit the fixtures
  separately.

## Project layout

- `src/` - the library, see [Layers](#layers).
- `examples/` - a Vite app covering every feature; useful both as a live testbed and as a reference for
  how each piece is meant to be used.
- `docs/` - the documentation site content (MDX).
