# Shape Stack

A minimalist, high-intensity rhythm timing game developed with React, TypeScript, and the HTML5 Canvas API. Optimized for short mobile play sessions and one-touch interaction.

## Core Gameplay Concept

**Shape Stack** is a game of precision and rhythm. The goal is to stack as many geometric shapes as possible by tapping the screen at the exact right moment.

### Mechanics

- **Concentric Stacking**: Every successful tap creates a new shape that grows from the center, nested inside the previous ones.
- **Precise Collision Detection**: The game uses a custom geometric containment system. A tap is only successful if the new shape is strictly contained within the boundaries of the previous shape.
- **Difficulty Scaling**: As your stack grows, shapes scale up faster and rotate more aggressively, increasing the cognitive load and requiring faster reflexes.
- **Quality Scoring**: The closer to the edge you stack, the more you score (PERFECT / GREAT / GOOD / OK), and consecutive stacks build a combo.
- **Fail Conditions**: In Classic, the run ends as soon as the growing shape breaches the boundary of the shape below it.

### Modes

- **Classic**: one miss ends the run.
- **Zen**: 10 lives, with undo and restart.
- **Time Attack**: 60 seconds against the clock. PERFECT +5 s, GREAT +2 s, a miss −5 s.
- **Daily Challenge**: everyone plays the same seeded run each day, and the result can be shared.

Controls: tap or `Space`/`Enter` to stack, `Esc`/`P` to pause. See [GAMEPLAY.md](GAMEPLAY.md) for the full rules, worlds and bosses.

## Technical Highlights

- **Pixel-Perfect Geometry**: Implements vertex-in-polygon and perimeter-sampling algorithms to ensure containment logic is "pixel-perfect" regardless of shape type (circle, square, triangle) or rotation.
- **Web Audio Engine**: Procedural synthesis only, no audio files. Stack notes follow a pentatonic melody in a per-world key, and harmony tracks stack quality. Everything goes through a compressor.
- **Deterministic Runs**: A seeded RNG drives shapes, colours and speeds; the Daily Challenge seeds it from the date.
- **High-Performance Rendering**: A `requestAnimationFrame` loop on Canvas with frame-rate-independent simulation (identical on 60/120 Hz), a clamped frame delta, a capped device pixel ratio, glow limited to recent layers, and React updates throttled out of the hot path.
- **Installable**: A web app manifest and mobile meta tags let it run fullscreen from the home screen.
- **Responsive Design**: Designed primarily for mobile portrait view with a premium "glassmorphism" aesthetic.

## Development

### Setup

```bash
npm install
```

### Run Locally

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Test

```bash
npm run lint
npm run test               # Vitest unit tests (~2 s)
npm run test:e2e:chromium  # every E2E spec, Chromium only (fastest loop)
npm run test:e2e           # Chromium: all specs; Firefox/WebKit/mobile: @cross-browser specs only
npm run test:e2e:full      # every spec on all 5 projects
npm run perf               # render/simulation benchmark (Chromium, not in CI)
```

Gameplay E2E specs drive deterministic state through the test bridge, so they run on Chromium only. Specs tagged `@cross-browser` (canvas rendering, responsive layout) run on every engine.

CI (`.github/workflows/ci.yml`):
- **Pull requests**: lint, build, unit tests and the targeted E2E matrix, sharded over 2 jobs in the official Playwright container. The image version comes from `package-lock.json`, so browsers always match.
- **Pushes to `main`**: the full matrix; GitHub Pages deploys only after CI passes.
- Visual snapshot baselines are macOS-only, so CI on Linux skips those assertions.

## Technologies Used

- **React 19**
- **TypeScript**
- **Vite**
- **HTML5 Canvas API**
- **Web Audio API**
- **Vanilla CSS**
