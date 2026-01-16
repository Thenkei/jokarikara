# Jokarikara - Shape Stack Game

A minimalist, addictive shape-stacking game built with React, Vite, and the HTML5 Canvas API.

## 🕹️ Game Overview

In **Shape Stack**, the player's goal is to stack geometric shapes on top of each other. Each new shape starts small and grows automatically. The player must tap exactly when the active shape is fully contained within the perimeter of the previously placed shape.

### Key Mechanics

- **Automatic Growth**: The active shape grows at a variable speed (MIN: 25, MAX: 90 units/sec).
- **Rotation**: Shapes rotate, with speed increasing as the player's score rises.
- **Levels**: Every 5 successful stacks, the game levels up.
- **Shape Unlocks**: New levels unlock more complex shapes (Circle, Square, Pentagon → Hexagon → Octagon → Triangle → Rectangle).
- **Containment Check**: Precise collision detection ensures the active shape's vertices are all within the previous shape.
- **Audio**: Dynamic sound effects for stacking, level-ups, and failure.

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Rendering**: HTML5 Canvas API
- **Styling**: Vanilla CSS

## 📁 Project Structure

- `src/App.tsx`: Main entry point, manages high-level game state (Start, Playing, Game Over) and HUD.
- `src/components/GameCanvas.tsx`: The heart of the game. Contains the Canvas rendering loop, collision logic, and shape generation.
- `src/utils/audioManager.ts`: Handles sound effects and browser audio context management.
- `src/assets/`: Contains image assets (backgrounds/parallaxes) and sounds.
- `src/App.css`: Global styles and UI layouts.

## 🚀 Development

### Scripts

- `npm run dev`: Start the development server.
- `npm run build`: Build the project for production.
- `npm run lint`: Run ESLint to check for code quality.
- `npm run test`: Run unit tests with Vitest.
- `npm run test:e2e`: Run integration and snapshot tests with Playwright.
- `npm run test:e2e:ui`: Open Playwright UI for interactive testing.

## 🤖 AI Assistant Guidelines (Antigravity)

When working on this project, adhere to these principles:

1.  **Performance First**: The game runs in a `requestAnimationFrame` loop. Avoid expensive operations or object allocations inside the loop.
2.  **Type Safety**: Ensure all new game entities or state transitions are strictly typed. Avoid `any`.
3.  **Aesthetics**: Maintain the minimalist, "premium" feel. Use the established color palette and CSS variables.
4.  **Math Precision**: Collision detection is vertex-based. Be precise when adding new shapes or modified collision logic.
5.  **Integration Testing**: When adding new UI elements or changing layouts, update Playwright snapshots using `npm run test:e2e -- --update-snapshots`.
6.  **Audio Integration**: Always consider how new features interact with the `audioManager`.
7.  **Progressive Difficulty**: When adding mechanics, ensure they scale with `score` or `level` to maintain challenge.
8.  **Asset Management**: Use `src/assets` for images/sounds. If new assets are needed, use the `generate_image` tool for visual assets.
9.  **Documentation**: Keep `GAMEPLAY.md` updated with any changes to game mechanics, levels, or shape unlocks.

## 🎨 Design System

### Colors & Variables

- **Background**: `#0c0c0e` (Deep charcoal)
- **Text**: `#f0f0f4` (Off-white)
- **Accent**: `#3b82f6` (Vibrant blue)
- **Glassmorphism**: Use `.glass` class for blurred overlays (`backdrop-filter: blur(10px)`).

### Typography

- **Primary**: `Outfit`, `Inter`
- **Headings**: Semi-bold/Bold with negative letter spacing (`-0.02em`).

## 🧠 Technical Deep Dive

### Collision Detection

The game uses a **Vertex-in-Polygon** approach for collision detection. For each tap:

1.  All vertices of the **Active Shape** are calculated.
2.  Each vertex is transformed into the coordinate space of the **Previous Shape**.
3.  The game checks if every vertex lies within the boundaries of the previous shape.
4.  For circles, the perimeter is sampled into 12 points to approximate vertices.

### Dynamic Audio

The `audioManager` uses the Web Audio API to synthesize sounds on-the-fly:

- **Stack Sound**: A sine wave with a frequency that increases based on the score (`baseFreq * 2^(score/12)`), creating a musical progression as the stack grows.
- **Fail Sound**: A descending sawtooth wave for a "buzz" effect.

### Difficulty Scaling

- **Rotation**: `0.5 + min(score * 0.05, 1.5)` radians/sec.
- **Growth**: Randomized for each shape between `25` and `90` units/sec.
- **Opacity**: Shapes older than 10 layers deep start to fade out to maintain performance and visual clarity.
