# Shape Stack

A minimalist, high-intensity rhythm timing game developed with React, TypeScript, and the HTML5 Canvas API. Optimized for short mobile play sessions and one-touch interaction.

## Core Gameplay Concept

**Shape Stack** is a game of precision and rhythm. The goal is to stack as many geometric shapes as possible by tapping the screen at the exact right moment.

### Mechanics

- **Concentric Stacking**: Every successful tap creates a new shape that grows from the center, nested inside the previous ones.
- **Precise Collision Detection**: The game uses a custom geometric containment system. A tap is only successful if the new shape is strictly contained within the boundaries of the previous shape.
- **Difficulty Scaling**: As your stack grows, shapes scale up faster and rotate more aggressively, increasing the cognitive load and requiring faster reflexes.
- **Fail Conditions**: The game ends if you tap too early, too late, or if the growing shape's vertices breach the boundary of the existing stack.

## Technical Highlights

- **Pixel-Perfect Geometry**: Implements vertex-in-polygon and perimeter-sampling algorithms to ensure containment logic is "pixel-perfect" regardless of shape type (circle, square, triangle) or rotation.
- **Web Audio Engine**: Real-time sound synthesis using the Web Audio API. Pitches and tones shift dynamically based on your current score to reinforce the rhythmic flow.
- **High-Performance Rendering**: Custom `requestAnimationFrame` loop on Canvas for butter-smooth 60FPS animations.
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

## Technologies Used

- **React 19**
- **TypeScript**
- **Vite**
- **HTML5 Canvas API**
- **Web Audio API**
- **Vanilla CSS**
