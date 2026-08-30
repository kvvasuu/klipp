# Contributing

This repo is the library itself (`src/`, built with `tsc` into `dist/`). [`example/`](example) is a
separate Vite app used as a live testbed while developing - it resolves `klipp` straight to `src/` via a
Vite alias, so there's no build step in the loop while iterating.

## Setup

```bash
pnpm install
pnpm --filter example dev
```

## Scripts (run at the repo root)

- `pnpm run build` - compiles `src/` to `dist/` via `tsc`. Run this before relying on `dist/` (e.g. for
  type-checking the published shape).
- `pnpm run test` - the unit suite (`vitest`).
- `pnpm run lint` - `oxlint`.
- `pnpm run bench` - the performance benchmark suite (`@pmndrs/labs`).

## Project layout

- `src/` - the library, mirrored 1:1 by `test/` (`src/CameraState.ts` → `test/CameraState.test.ts`).
- `example/` - a Vite app covering every Body/Aim/Noise/Extension combination shipped so far; useful both
  as a live testbed and as a reference for how each piece is meant to be used.
