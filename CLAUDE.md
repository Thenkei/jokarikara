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
node scripts/generate-icons.mjs  # Re-render PNG app icons after editing public/icon.svg
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
- `build/sw/` + `src/pwa/registerServiceWorker.ts` - Offline PWA: build-only Vite plugin emits `<base>sw.js` (precaches all of `dist/` into `shape-stack-<content hash>`; navigations network-first 3 s → cached index.html, `assets/` cache-first, rest stale-while-revalidate; no skipWaiting, so a new deploy plays offline once every tab closes); registered only in PROD non-`VITE_E2E` builds; offline proof `npm run test:offline` (production build + `vite preview` :6771, CI e2e shard 1)
- `src/modes/daily.ts` - Daily Challenge helpers (date key, seed, share text)
- `src/modes/dailyStreak.ts` - Daily habit loop: pure streak chip selection (≥2 days; kept vs at risk), next-local-midnight countdown (from date parts, DST-safe) and the Daily button view; `useWallClock.ts` ticks once a minute only while a countdown is shown (stops at midnight, then the button flips to the new day)
- `src/modes/share.ts` - Share text for regular runs (mode, score, proportional emoji quality bar, game URL); reuses the Daily emoji legend
- `src/modes/runInsights.ts` - Game over insights: why the run ended, stack quality breakdown
- `src/modes/endFeedback.ts` - Run endings, pure: `selectEndFeedback(reason, mode, medal)` → cue (fail buzz / Time Attack `playTimeUp(world, medal)` / Zen finish chord), effect (`triggerFail` / calm `triggerTimeUp` ring + flash in the world colour), haptic and hold before `onGameOver` (fail 400 ms, time-up 1 s, finish 0; 0 under E2E); GameCanvas's `endRun` is its only caller. A Time Attack clock at 0 is always "timeout", even when a miss penalty drained it (that miss plays its own miss sound first). The TIME! moment reaches App via `onTimeUp` (banner, "Time! Score N[. Medal]" announcement, pause ignored during the hold); game over headline via `getGameOverHeadline`. E2E: `__GAME_AUDIO__.getEndSoundCalls()`
- `src/modes/missMargin.ts` - Wording for how far a miss was off (`MissMargin`, computed by `getMissMargin` in `core/gameState.ts`): an untapped overflow is time since PERFECT opened (`perfectBandEnteredAt`, tracked in `updateActiveShape`; "Late by 0.4 s"), a tap that doesn't fit is a size % (solvers in `geometry.ts`/`reverse.ts`; < 1 % reads "by a hair"); game over headline + hint, mid-run MISS pop label (Zen/Time Attack), announcement; strings cached per bucket
- `src/modes/personalBest.ts` - "Chase your best": pure previous-best selection (mode top score; today's Daily best for a Daily; none for Zen/practice or a best of 0) and the one-shot crossing (strictly above); App keeps it in a ref, shows the HUD `BEST n` target, and on the crossing shows the banner, gold score pill, `playRecord` cue, `record` haptic and announcement once per run
- `src/modes/medals.ts` - Time Attack medals (Bronze 1000 / Silver 1500 / Gold 2200, calibrated by simulating the real game functions): pure `getMedal`/`getNextMedal`, a one-shot run latch (App ref; HUD goal, lane pill, cue, `medal` haptic, announcement once per medal), `selectHudGoal` (one HUD goal chip: the nearer of `BEST n` and the next medal), game over medal, share label; best medal derived from the stored top score (no storage)
- `src/utils/audioManager.ts` - Web Audio engine (procedural voices → compressor; mute = no allocation); `playUi` for menu sounds. Idle suspension: one timer suspends the context once the last voice + reverb tail + grace have passed and no music/run keeps it awake (pure rules in `src/audio/idle.ts`); every sound/music start resumes it first; off for offline contexts. E2E reads it via `__GAME_AUDIO__.getContextState()`
- `src/audio/music.ts` - Pure music theory (pentatonic melody, per-world keys, quality harmony)
- `src/audio/palette.ts` - Per-world sound palettes (timbre, envelope, lowpass, chorus, vibrato/tremolo, glide, mirrored intervals) applied to stack/levelUp/worldUp voices; world 1 is the unshaped baseline, every world kept within ±2 dB of it by `tests/audio-levels.spec.ts`
- `src/audio/soundtrack.ts` + `src/audio/musicEngine.ts` - Dynamic soundtrack: pure layer/tempo rules and the engine (ambient drone + pulse/arpeggio layers on a lookahead scheduler, one eighth-note grid per session). Time Attack tension (`getMusicTension`: last 10 s, one step per displayed second, pushed by GameCanvas via `setMusicTension` with the timer report; intent-only, never wakes audio) opens the drone filter, adds a grid-locked tremolo, a dominant pedal and the forced bass pulse, and eases out after a bonus; recolours, not louder (`tests/audio-levels.spec.ts` renders tension 0/1 with the scheduler live)
- `src/audio/reverb.ts` + `src/audio/reverbBus.ts` - Reverb send bus: pure seeded IR generator (stereo damped noise tail) and the convolver send/return into the master; per-effect send amounts in `src/audio/mix.ts`; built on idle after `init()` (sounds before it play dry); degrades to dry
- `src/audio/mix.ts` - Central gain table for every voice; `tests/audio-levels.spec.ts` guards relative levels
- `src/utils/haptics.ts` - Vibration helper (respects the haptics setting)
- `src/utils/storage.ts` - localStorage: per-mode top-5 high scores, daily records, settings, achievements (all validated on read)
- `src/progression/achievements.ts` - Achievement catalogue, named thresholds, pure `evaluate(run, lifetime)` and run/lifetime reducers; `useAchievements.ts` is the React glue (run state in refs, fed by `GameCanvas`'s `onStack`/`onMiss`, re-renders only on unlock)
- `src/gameplay/atlas.ts` + `src/components/WorldAtlas.tsx` - World atlas (start screen `WORLDS n/10`, App's `startPanel` next to achievements; closing returns focus to the entry): per-world one-sentence how-to lines (keep in sync with the mechanics), worlds above `lifetime.bestWorld` locked as "???", PRACTICE goes through `startRun`'s Zen practice path (`practiceFrom`)
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
- **ZEN**: No fail state, restart/undo buttons available; pause menu FINISH RUN (`src/modes/finishRun.ts`, `finishRun` in gameState) ends the run as a game over with `EndReason` "finished" (scores saved; MAIN MENU still abandons); can start from any world already reached (practice)
- **TIME_ATTACK**: 60-second timer; PERFECT +5s, GREAT +2s, miss −5s
- **Daily Challenge**: not a `GameMode` but a run variant (CLASSIC rules, date-derived `runSeed`), handled in `App.tsx`

### HUD layout (App.tsx + App.css)
- Row 1 `.hud-top`: the score pill holds only the score and the vital readout (Time Attack timer / Zen lives); its `::before`/`::after` spacers reserve PAUSE's fixed-width corner (`--pause-width`, `--pause-reserve`), so the pill is centred while it fits and slides left, never under PAUSE.
- Row 2 `.hud-meta` (always visible, below PAUSE, wraps): goal chip, W, L, DAILY. Row 3 `.hud-secondary`: auto-revealed STYLE/COMBO (Zen controls). New HUD chips go in row 2 or 3, not row 1. `tests/hud-layout.spec.ts` guards 320/375 px.

### Loop invariants
- Simulation is time-based: every per-frame change must scale with `dt` (clamped to `MAX_FRAME_DT`).
- Keep React state updates out of the per-frame path (e.g. the Time Attack timer only reports when the displayed second changes).
- The loop effect must stay single-instance (per-effect `cancelled` flag + `rafIdRef`).
- Player resume = 3·2·1 countdown (`src/gameplay/resumeCountdown.ts` pure + `useResumeCountdown.ts` timer driver in GameCanvas): the loop stays paused until "go", one React update per digit; re-pause/unmount cancel it. E2E: `finishResumeCountdown()` after Escape/RESUME (bridge `pause()`/`resume()` manual mode is unaffected).
- First-visit world intro (`src/gameplay/worldIntro.ts` pure + `useWorldIntroHold.ts` driver in GameCanvas): entering a world above `lifetime.bestWorld` (read fresh at run start, prop `introTaughtThrough`) shows the atlas how-to line and holds the game: `tick` keeps rendering but skips the simulation (also under bridge `step`) until a tap/Space/Enter after a 600 ms grace (taps only dismiss), 9 s, pause or a Zen action. E2E specs that cross worlds for other reasons `seedBestWorld(page, ALL_WORLDS_REACHED)` (`tests/bridgeHelpers.ts`); bridge `getState().worldIntro` / `dismissWorldIntro()` / `setWorldIntroMaxHold(ms)` (WebKit in CI can outlast the real 9 s).

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
- **Accessibility**: `tests/axe.spec.ts` scans every screen with axe-core (WCAG 2.1 A/AA, any impact fails) plus a color-contrast pass with the decorative backdrop/canvas hidden (axe can't see through image nodes); add a scan when you add a screen. Seed-dependent HUD chip tints are swept in `src/visual/hudChipContrast.test.ts` (parses App.css).
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
