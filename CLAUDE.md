# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jokarikara (Shape Stack) is a minimalist rhythm timing game built with React 19, TypeScript, and HTML5 Canvas. Players stack geometric shapes by tapping at precise moments, with shapes that must be fully contained within the previous shape's boundary.

## Commands

```bash
npm run dev          # Start development server (Vite)
npm run build        # TypeScript compile + Vite production build
npm run lint         # ESLint
npm run test         # Vitest unit tests (src/**/*.test.{ts,tsx})
npm run test:e2e     # Playwright E2E tests (tests/*.spec.ts)
npm run test:e2e:ui  # Playwright with UI
```

Run a single unit test file:
```bash
npx vitest run src/utils/geometry.test.ts
```

Run a single E2E test:
```bash
npx playwright test tests/gameplay.spec.ts
```

## Architecture

### State Management Pattern
The game uses a functional, immutable state pattern without external state libraries:
- `src/types.ts` - Core interfaces (`GameState`, `GameMode`, `GameCallbacks`)
- `src/core/gameState.ts` - Pure functions that take state and return new state (e.g., `updateActiveShape`, `stackActiveShape`, `handleMiss`)
- State is held in a ref (`stateRef`) inside `GameCanvas` and updated each frame

### Game Loop
`GameCanvas.tsx` orchestrates a `requestAnimationFrame` loop that:
1. Calculates delta time
2. Applies state transformations (active shape growth, zoom interpolation, rotation drift)
3. Checks containment constraints
4. Renders via extracted drawing functions

### Module Responsibilities
- `src/shapes/` - Shape factory functions (`createActiveShape`, `createInitialShape`)
- `src/utils/geometry.ts` - Containment logic using vertex-in-polygon and ray casting algorithms
- `src/rendering/shapeRenderer.ts` - Pure drawing functions (no state mutation)
- `src/constants/game.ts` - Game balance constants, world mechanics, boss configurations, shape unlocks
- `src/utils/audioManager.ts` - Web Audio engine (procedural voices → compressor; mute = no allocation)
- `src/audio/music.ts` - Pure music theory (pentatonic melody, per-world keys, quality harmony)
- `src/audio/soundtrack.ts` + `src/audio/musicEngine.ts` - Dynamic soundtrack: pure layer/tempo rules and the engine (ambient drone + pulse/arpeggio layers on a lookahead scheduler)
- `src/rendering/effects.ts` - Pure, dt-based canvas juice (rings, particles, shake, flash); never touches gameplay state
- `src/gameplay/reverse.ts` - Reverse Stack (world 9): outward containment, arena limit, zoom-out camera
- `src/gameplay/heartbeat.ts` - Heartbeat (world 10): beat-phase growth multiplier (mean 1) and visual pulse
- `src/gameplay/guide.ts` - PERFECT ghost guide rules (Zen + first level; reverse-aware)
- `src/modes/daily.ts` - Daily Challenge helpers (date key, seed, share text)
- `src/utils/storage.ts` - localStorage: per-mode high scores, daily records, settings, achievements (all validated on read)
- `src/progression/achievements.ts` - Achievement catalogue, named thresholds, pure `evaluate(run, lifetime)` and run/lifetime reducers; `useAchievements.ts` is the React glue (run state in refs, fed by `GameCanvas`'s `onStack`/`onMiss`, re-renders only on unlock)

### World Mechanics (src/gameplay/config.ts)
Each world (1-10) introduces cumulative effects (each has a `tagline` shown on entry):
- World 2: Breathing (size oscillation)
- World 3: Accelerating growth pattern + fracture windows
- World 4: Wave (horizontal sway)
- World 5: Color shift (hue rotation)
- World 6: Eclipse, World 7: Gravity drift, World 8: Rotation inversion
- World 9: Reverse Stack (outward; arena limit), World 10: Heartbeat (beat-synced growth)

Effects only apply to stacked shapes, not the active shape, for fair gameplay.

### Game Modes
- **CLASSIC**: Standard fail-on-miss gameplay
- **ZEN**: No fail state, restart/undo buttons available
- **TIME_ATTACK**: 60-second timer, perfect stacks add bonus time
- **Daily Challenge**: not a `GameMode` but a run variant (CLASSIC rules, date-derived `runSeed`), handled in `App.tsx`

### Loop invariants
- Simulation is time-based: every per-frame change must scale with `dt` (clamped to `MAX_FRAME_DT`).
- Keep React state updates out of the per-frame path (e.g. the Time Attack timer only reports when the displayed second changes).
- The loop effect must stay single-instance (per-effect `cancelled` flag + `rafIdRef`).

### Testing Strategy
- **Unit tests** (Vitest + jsdom): Core logic in `src/**/*.test.ts` - geometry, game state, rendering
- **E2E tests** (Playwright): Visual regression and gameplay flows in `tests/*.spec.ts`
- Canvas mocking via `vitest-canvas-mock`
- E2E drives the game through `window.__GAME_TEST__` (src/utils/testBridge.ts), only installed when `VITE_E2E=true`
