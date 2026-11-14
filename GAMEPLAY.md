# Jokarikara - Gameplay Guide

Welcome to **Shape Stack** (codename _Jokarikara_), a minimalist shape-stacking timing game. This guide explains the rules, modes, mechanics and progression.

## 🕹️ Core Objective

**Stack geometric shapes inside each other for as long as you can.**

A new shape grows from the centre of the screen. Tap while it is as large as possible but still **fully contained** inside the shape below it. The closer you get to the edge, the more points you earn.

## 🎮 Controls

| Action | Touch / Mouse | Keyboard |
| --- | --- | --- |
| Stack the growing shape | Tap / left click (registers on press, not release) | `Space` or `Enter` |
| Pause / resume | `PAUSE` button | `Esc` or `P` |
| Start / retry from a menu | Buttons | `Enter` |

The game pauses automatically when you switch tabs or the window loses focus, and it never resumes on its own.

## 🧭 Game Modes

| Mode | Rules |
| --- | --- |
| **Classic** | One miss ends the run. |
| **Zen** | 10 lives; each miss costs one life and resets the growing shape. `UNDO` and `RESTART` are available. Taps before the shape reaches 30% of the container are ignored, with a soft cue. **Practice**: once you have reached a world in any run, Zen can start directly at that world (‹ › picker on the start screen). Practice runs skip leaderboards and achievements. |
| **Time Attack** | 60 seconds on the clock. **PERFECT +5 s**, **GREAT +2 s**. A miss costs **−5 s** and resets the growing shape instead of ending the run, so the run ends only when the clock hits zero. The timer turns red at 10 s, and the last 5 seconds tick audibly. |
| **Daily Challenge** | Classic rules on a **seed derived from today's date**, so everyone gets the same sequence of shapes, colours and speeds. Your best score and number of tries are kept per day, and **SHARE RESULT** copies a spoiler-free summary (score plus quality trail). Daily scores stay out of the Classic leaderboard. |

Best scores are tracked separately for Classic, Zen and Time Attack (top 5 each).

## ⭐ Scoring

Each stack is graded by its size relative to the container:

| Quality | Size ratio | Points |
| --- | --- | --- |
| PERFECT | ≥ 97% | 140 |
| GREAT | ≥ 92% | 90 |
| GOOD | ≥ 82% | 50 |
| OK | below 82% | 25 |

Outside Zen, consecutive stacks build a **combo**. Combos of **×5, ×10, ×20, ×30, ×50** (then every 25) trigger a milestone: a rising fanfare in the world's key, a COMBO banner and a haptic pulse. The **style score** adds a streak bonus on top of the quality points, and a miss resets the combo.

## ⚙️ Mechanics

### 📏 Growth

Each shape grows at a random speed between **35 and 80 units per second**. Growth is normalised to your screen size, and it gets slightly faster as the stack gets taller.

### 🔄 Rotation

Growing shapes rotate, faster as your stack count rises (with a cap). Stacked shapes keep drifting slowly, alternating direction layer by layer. All motion is time-based, so 60 Hz and 120 Hz screens play identically.

### 🔍 Dynamic Zoom

The camera zooms in with each level so the shapes stay playable as the stack narrows.

### 🌫️ Fading

Layers more than 10 deep slowly fade out to keep the scene readable.

## 📈 Progression

- A new **level** every **3 stacks**, and a new **world** every **5 levels** (15 stacks).
- On a world change the stack resets to its base shape. Each world gets its own seeded palette and musical key.

### 🔷 Shape Unlocks

| Level | Unlocks |
| --- | --- |
| 1 | Circle, Octagon |
| 2 | Pentagon, Hexagon |
| 3 | Square |
| 4 | Triangle (sharp vertices!) |
| 5 | Rectangle |

### 👑 Boss Stacks

Some stacks are boss shapes: they are white, cycle through hues, grow faster and spin harder.

| Stack # | Boss | Twist |
| --- | --- | --- |
| 5 | Hexagon | Pulsing growth |
| 10 | Octagon | Erratic rotation |
| 15 | Diamond | Pulsing growth |
| 20 | Star | Pulsing + erratic rotation |

### 🌍 World Mechanics

Effects are **cumulative**, and visual distortions only apply to stacked shapes, never to the shape you are timing. Each new world opens with its name and a one-line rule reminder. Worlds past 10 keep the Heartbeat rules.

| World | Effect | Description |
| --- | --- | --- |
| **1** | Baseline | No special effects. |
| **2** | 🫁 Breathing | Stacked shapes gently pulse in size. |
| **3** | 🚀 Acceleration + 🧨 Fractures | Growth speeds up within each level. Rotating unsafe sectors on the container's rim block taps near the edge (Classic/Time/Daily only; disabled on boss stacks). |
| **4** | 🌊 Wave | Stacked shapes sway horizontally. |
| **5** | 🌈 Color Shift | Stacked shapes cycle through hues. |
| **6** | 🌑 The Eclipse | Near-black scene; the container is almost invisible except for a pulsing outline. |
| **7** | 🧲 Gravity Drift | The growing shape slowly drifts downward. |
| **8** | ↔️ Rotation Inversion | Stack rotation flips on even levels and during boss stacks. |
| **9** | 🔄 Reverse Stack | Shapes grow **outward**: tap once the growing shape fully wraps the previous one, before it crosses the circular arena. PERFECT means a tight wrap. The camera zooms out after each stack. Fractures and the eclipse are off here. |
| **10** | 💓 Heartbeat | Growth surges on a 90 BPM beat and nearly rests between beats, so you tap in rhythm. Each beat is audible (a soft thump) and visible (the scene pulses), both driven by the same game clock as the growth. Average speed is unchanged. |

## 🎵 Audio & Feel

- **Stacks** play notes of a major pentatonic scale in the current world's key. The melody climbs with your combo, and better quality adds richer harmony (PERFECT adds a bell sparkle).
- **Level up** plays an arpeggio, a **new world** plays a sustained chord, a **Zen miss** plays a soft drop and **game over** plays a low buzz.
- **Visual feedback**: rings and particles on PERFECT/GREAT stacks, screen shake and a red flash on failure, a zoom punch on level up and a flash on a new world.
- **Haptics** on supported phones.
- **Settings** (saved):
  - `SOUND: ON/OFF`.
  - `MUSIC: ON/OFF` (background soundtrack only).
  - `HAPTICS: ON/OFF` (shown on devices that can vibrate).
  - `FX: FULL/LOW`. LOW removes shake and particles and tones down glow. It defaults to LOW when your OS asks for reduced motion.

## 🏆 Achievements

Twelve achievements unlock as you play. Most unlock **live**, the moment you earn them, with a small `ACHIEVEMENT · Title` toast at the bottom of the screen (it never blocks taps). The rest are checked at game over. The game over screen lists everything unlocked during that run, and `ACHIEVEMENTS n/12` on the start screen opens the full list with progress counters.

| Achievement | How to unlock |
| --- | --- |
| First Stack | Land your first shape. |
| Perfect Alignment | 10 **PERFECT** stacks in a row (a lower grade, a Zen miss or an undo resets the count). |
| Unbroken | Reach a x25 combo. |
| New Horizons / Fault Lines / Prismatic | Reach World 2 / 3 / 5. |
| Speed Demon | Reach level 5 in under 30 seconds of play (paused time does not count). |
| Giant Slayer | Stack a boss shape. |
| Zen Master | 30 stacks in a single Zen run. |
| Time Lord | 3000 points in Time Attack. |
| Daily Devotee | Play the Daily Challenge on 3 different days. |
| Architect | 1000 stacks in total, across all modes. |

Lifetime totals include runs you leave from the pause menu. Unlocks and lifetime totals are stored on the device.

---

_Master the rhythm, time your taps, and build the ultimate shape stack!_

## Developer Notes: Extending Gameplay

Gameplay configuration lives in `src/gameplay/config.ts` and is built with
`GameplayBuilder`. Add new worlds, levels or bosses by extending that builder chain.

```ts
// src/gameplay/config.ts
builder.world(9, (w) =>
  w
    .inheritFrom(8)
    .name("New World")
    .mechanics({
      breathingEffect: true,
      breathingAmplitude: 0.04,
      breathingSpeed: 2.5,
    }),
);

builder.level(6, { zoom: 16, unlocks: ["star"] });
builder.boss(25, {
  type: "star",
  growthSpeedMultiplier: 2.8,
  rotationSpeedMultiplier: 3.8,
  hueShift: true,
});
```
