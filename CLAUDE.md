# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jokarikara (Shape Stack) is a minimalist rhythm timing game built with React 19, TypeScript, and HTML5 Canvas. Players stack geometric shapes by tapping at precise moments, with shapes that must be fully contained within the previous shape's boundary. Deployed to GitHub Pages under the base path `/jokarikara/` (installable PWA).

## Commands

```bash
npm run dev               # Start development server (Vite)
npm run build             # TypeScript compile + Vite production build
npm run lint              # ESLint
npm run test              # Vitest unit tests (src/**/*.test.{ts,tsx})
npm run test:e2e          # Playwright E2E, targeted matrix (see Testing)
npm run test:e2e:chromium # Playwright, Chromium only (fastest local loop)
npm run test:e2e:full     # Playwright, every spec on every browser/device
npm run test:e2e:ui       # Playwright with UI
npm run perf              # Render FPS benchmark (tests/perf/render.perf.ts)
```

Run a single unit test file:
```bash
npx vitest run src/utils/geometry.test.ts
```

Run a single E2E test (E2E server defaults to port 6173; override with `E2E_PORT` if it is taken):
```bash
E2E_PORT=6471 npx playwright test tests/gameplay.spec.ts --project=chromium
```

## Architecture

### State Management Pattern
The game uses a functional, immutable state pattern without external state libraries:
- `src/types.ts` - Core interfaces (`GameState`, `GameMode`, `GameCallbacks`, `MissReason`/`EndReason`)
- `src/core/gameState.ts` - Pure functions that take state and return new state (e.g., `updateActiveShape`, `stackActiveShape`, `handleMiss`)
- State is held in a ref (`stateRef`) inside `GameCanvas` and updated each frame

### Game Loop
`GameCanvas.tsx` orchestrates a `requestAnimationFrame` loop that:
1. Calculates delta time (clamped to `MAX_FRAME_DT`) and advances a pausable game clock (`elapsedTime` / `advanceClock`)
2. Applies state transformations (active shape growth, zoom interpolation, rotation drift)
3. Checks containment constraints
4. Renders via extracted drawing functions

### Module Responsibilities
- `src/shapes/` - Shape factory functions (`createActiveShape`, `createInitialShape`)
- `src/utils/geometry.ts` - Containment logic using vertex-in-polygon and ray casting algorithms
- `src/rendering/shapeRenderer.ts` - Pure drawing functions (no state mutation); glow uses `FAUX_GLOW` strokes, never `shadowBlur`
- `src/rendering/effects.ts` - Pure, dt-based canvas juice (rings, particles, shake, flash); never touches gameplay state
- `src/constants/game.ts` - Game balance constants, world mechanics, boss configurations, shape unlocks
- `src/gameplay/config.ts` - Per-world mechanics and taglines; `builder.ts`, `fracture.ts`, `selectors.ts` support them
- `src/gameplay/reverse.ts` - Reverse Stack (world 9): outward containment, arena limit, zoom-out camera
- `src/gameplay/heartbeat.ts` - Heartbeat (world 10): beat-phase growth multiplier (mean 1) and visual pulse
- `src/gameplay/guide.ts` - PERFECT ghost guide rules (Zen + first level; reverse-aware)
- `src/gameplay/timingCue.ts` - Opt-in timing cue (setting `timingCue`): pure reading/curve/stepper on the game clock, ticks via `playCue`; off in Heartbeat (its beat is the cue)
- `src/gameplay/combo.ts` - Combo milestones (fanfare, banner, haptics)
- `src/modes/daily.ts` - Daily Challenge helpers (date key, seed, share text)
- `src/modes/dailyStreak.ts` - Daily habit loop: pure streak chip selection (≥2 days; kept vs at risk), next-local-midnight countdown (from date parts, DST-safe) and the Daily button view; `useWallClock.ts` ticks once a minute only while a countdown is shown (stops at midnight, then the button flips to the new day)
- `src/modes/share.ts` - Share text for regular runs (mode, score, proportional emoji quality bar, game URL); reuses the Daily emoji legend
- `src/modes/runInsights.ts` - Game over insights: why the run ended, stack quality breakdown
- `src/modes/personalBest.ts` - "Chase your best": pure previous-best selection (mode top score; today's Daily best for a Daily; none for Zen/practice or a best of 0) and the one-shot crossing (strictly above); App keeps it in a ref, shows the HUD `BEST n` target, and on the crossing shows the banner, gold score pill, `playRecord` cue, `record` haptic and announcement once per run
- `src/modes/medals.ts` - Time Attack medals (Bronze 1000 / Silver 1500 / Gold 2200, calibrated by simulating the real game functions): pure `getMedal`/`getNextMedal`, a one-shot run latch (App ref; HUD goal, lane pill, cue, `medal` haptic, announcement once per medal), `selectHudGoal` (one HUD goal chip: the nearer of `BEST n` and the next medal), game over medal, share label; best medal derived from the stored top score (no storage)
- `src/utils/audioManager.ts` - Web Audio engine (procedural voices → compressor; mute = no allocation); `playUi` for menu sounds. Idle suspension: one timer suspends the context once the last voice + reverb tail + grace have passed and no music/run keeps it awake (pure rules in `src/audio/idle.ts`); every sound/music start resumes it first; off for offline contexts. E2E reads it via `__GAME_AUDIO__.getContextState()`
- `src/audio/music.ts` - Pure music theory (pentatonic melody, per-world keys, quality harmony)
- `src/audio/palette.ts` - Per-world sound palettes (timbre, envelope, lowpass, chorus, vibrato/tremolo, glide, mirrored intervals) applied to stack/levelUp/worldUp voices; world 1 is the unshaped baseline, every world kept within ±2 dB of it by `tests/audio-levels.spec.ts`
- `src/audio/soundtrack.ts` + `src/audio/musicEngine.ts` - Dynamic soundtrack: pure layer/tempo rules and the engine (ambient drone + pulse/arpeggio layers on a lookahead scheduler)
- `src/audio/reverb.ts` + `src/audio/reverbBus.ts` - Reverb send bus: pure seeded IR generator (stereo damped noise tail) and the convolver send/return into the master; per-effect send amounts in `src/audio/mix.ts`; built on idle after `init()` (sounds before it play dry); degrades to dry
- `src/audio/mix.ts` - Central gain table for every voice; `tests/audio-levels.spec.ts` guards relative levels
- `src/utils/haptics.ts` - Vibration helper (respects the haptics setting)
- `src/utils/storage.ts` - localStorage: per-mode top-5 high scores, daily records, settings, achievements (all validated on read)
- `src/progression/achievements.ts` - Achievement catalogue, named thresholds, pure `evaluate(run, lifetime)` and run/lifetime reducers; `useAchievements.ts` is the React glue (run state in refs, fed by `GameCanvas`'s `onStack`/`onMiss`, re-renders only on unlock)
- `src/progression/stats.ts` - Pure `LifetimeStats` → ordered display rows (perfect rate, daily streak from an injected "today"), shown in the achievements panel
- `src/components/SettingsSheet.tsx` - Settings dialog (labelled `role="switch"` rows) opened from the start screen gear and the pause menu; owns focus (first switch on open, Tab trap, Escape in document capture so it never reaches the pause handler, focus back to the opener); App makes the background `inert` and ignores game keys while it is open. E2E helpers in `tests/settingsHelpers.ts`
- `src/components/StartBackdrop.tsx` - Animated start screen backdrop; layer data lives in `startBackdropLayers.ts` (non-component exports stay out of component modules for Fast Refresh); `flourish` plays a CSS-only burst on per-layer wrappers
- `src/utils/secrets.ts` - Start screen easter eggs (keep out of user-facing docs): pure matchers for 7 quick title taps (backdrop flourish + `playChime`) and the ↑↑↓↓←→←→ key sequence (toggles the session-only Mono look: `getWorldTheme(..., mono)` + `toMonoColor` in the renderer, a CSS filter on DOM layers only, never on the canvas; danger signals stay red-orange: `theme.danger` on the canvas, and DOM `.danger-signal` / `.critical` elements are kept out of the filter). Both unlock the hidden `curious-mind` achievement (`hidden: true`, shown as "???", counted in the total, granted via `useAchievements().unlock`)
- `src/components/GameOverScreen.tsx` - Presentational game over: score hero, run cards in a scrolling body, and an action bar (RETRY / share / menu) that never scrolls away; achievement toasts drop into a lane reserved above the hero (never over the title or the action bar)

### localStorage keys
Bump the version suffix on any incompatible schema change and migrate from the previous key (see `LEGACY_STORAGE_KEY`):
- `shape-stack-high-scores-v3` (per-mode top 5; migrates from v2)
- `shape-stack-settings` (`reducedFx`, `muted`, `music`, `haptics`, `timingCue`, ...)
- `shape-stack-daily-v1`
- `shape-stack-achievements-v1`

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
- **ZEN**: No fail state, restart/undo buttons available; can start from any world already reached (practice)
- **TIME_ATTACK**: 60-second timer; PERFECT +5s, GREAT +2s, miss −5s
- **Daily Challenge**: not a `GameMode` but a run variant (CLASSIC rules, date-derived `runSeed`), handled in `App.tsx`

### Loop invariants
- Simulation is time-based: every per-frame change must scale with `dt` (clamped to `MAX_FRAME_DT`).
- Keep React state updates out of the per-frame path (e.g. the Time Attack timer only reports when the displayed second changes).
- The loop effect must stay single-instance (per-effect `cancelled` flag + `rafIdRef`).

### Performance rules
Measured with `npm run perf` and Chromium DevTools at 4× CPU throttle:
- Never use canvas `shadowBlur`/`shadowColor` in the render path: on a full world-5 stack it dropped to ~13 FPS vs ~50 FPS with faux glow strokes. Fake glows with wider translucent strokes.
- Cap the canvas device pixel ratio at 2 and keep `GLOW_LAYER_DEPTH` limited (only the top stacked layers glow).
- Cache derived colours (hsl strings) rather than rebuilding them per frame.
- HUD `backdrop-filter` and the background gradient were profiled and are not bottlenecks; don't optimise them blindly.
- Input uses `pointerdown` (no click delay).

## Testing Strategy
- **Unit tests** (Vitest + jsdom): Core logic in `src/**/*.test.ts(x)` - geometry, game state, rendering, audio, progression
- Canvas mocking via `vitest-canvas-mock`; Web Audio via `src/audio/mockAudioContext.testutil.ts`
- **E2E tests** (Playwright): gameplay flows and visual regression in `tests/*.spec.ts`
  - Drive the game through `window.__GAME_TEST__` (`src/utils/testBridge.ts`: pause, step, forceStack(ratio), setActiveSize, setTimeRemaining, tap, getState), only installed when `VITE_E2E=true`. Helpers in `tests/bridgeHelpers.ts`.
  - Import `test` from `tests/fixtures.ts`: it clears localStorage on each navigation, so seed state with an `addInitScript` registered after the fixture.
  - Prefer deterministic bridge control (pause + step) over wall-clock waits; the dev machine is often loaded and timings are noisy.
- **Tiers**: by default Chromium runs every spec, other browsers/devices run only specs tagged `@cross-browser`. `E2E_FULL=1` runs the full matrix.
- **Snapshots**: darwin baselines only; snapshot assertions are ignored on Linux CI. Update locally with `--update-snapshots` and review the diff images.

## CI / Deploy (.github/workflows)
- `ci.yml`: lint + build + unit tests, then E2E in the official Playwright container (version read from the lockfile), 2 shards. PRs run the targeted tier; pushes to `main` (or a manual `full_matrix` run) run the full matrix.
- `deploy.yml`: GitHub Pages deploy triggered by `workflow_run` and only when CI succeeded on a push to `main`.

## Workflow conventions
- Branch per change (`<type>/<short-desc>`), conventional commits in English (`perf(render): ...`), one PR per improvement, squash-merge.
- Run before pushing: `npm run lint`, `npm run test`, `npm run build`, and the relevant E2E specs. Check each command's own exit code; never judge success through a pipe (`npm run lint | tail` hides failures).
- Merge only when `gh pr checks <n>` itself exits 0. Poll while it returns 8 (pending); 1 = failure. Don't use `gh pr checks --watch` (it exits early in non-TTY shells):
  ```bash
  until gh pr checks <n> >/dev/null 2>&1; rc=$?; [ $rc -ne 8 ]; do sleep 15; done; [ $rc -eq 0 ] && gh pr merge <n> --squash --delete-branch
  ```
- After merging, confirm CI on `main` and the Pages deploy both succeed.
- Don't commit `.claude/` or temporary specs.
