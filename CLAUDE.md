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
- `src/utils/audioManager.ts` - Web Audio API wrapper for procedural sound

### World Mechanics (src/constants/game.ts)
Each world (1-5) introduces cumulative effects:
- World 2: Breathing (size oscillation)
- World 3: Accelerating growth pattern
- World 4: Wave (horizontal sway)
- World 5: Color shift (hue rotation)

Effects only apply to stacked shapes, not the active shape, for fair gameplay.

### Game Modes
- **CLASSIC**: Standard fail-on-miss gameplay
- **ZEN**: No fail state, restart/undo buttons available
- **TIME_ATTACK**: 60-second timer, perfect stacks add bonus time

### Testing Strategy
- **Unit tests** (Vitest + jsdom): Core logic in `src/**/*.test.ts` - geometry, game state, rendering
- **E2E tests** (Playwright): Visual regression and gameplay flows in `tests/*.spec.ts`
- Canvas mocking via `vitest-canvas-mock`
