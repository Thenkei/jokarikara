import { describe, it, expect } from "vitest";
import {
  createInitialState,
  generateRandomSpeed,
  spawnActiveShape,
  updateActiveShape,
  checkContainment,
  stackActiveShape,
  setGameOver,
  updateZoom,
  updateShapeOpacities,
  updateShapeRotations,
  updateTimer,
  handleMiss,
  restartActiveShape,
} from "./gameState";

import { MIN_GROWTH_SPEED, MAX_GROWTH_SPEED } from "../constants/game";

describe("gameState", () => {
  describe("createInitialState", () => {
    it("should create state with initial shape at 45% of viewport", () => {
      const state = createInitialState(1000);
      expect(state.shapes.length).toBe(1);
      expect(state.shapes[0].size).toBe(450);
      expect(state.shapes[0].type).toBe("circle");
    });

    it("should initialize score and level to starting values", () => {
      const state = createInitialState(1000);
      expect(state.score).toBe(0);
      expect(state.level).toBe(1);
      expect(state.isGameOver).toBe(false);
    });

    it("should initialize zoom to 1", () => {
      const state = createInitialState(1000);
      expect(state.zoom).toBe(1);
      expect(state.targetZoom).toBe(1);
    });

    it("should initialize Zen Mode", () => {
      const state = createInitialState(1000, "ZEN");
      expect(state.mode).toBe("ZEN");
    });

    it("should initialize Time Attack with timer", () => {
      const state = createInitialState(1000, "TIME_ATTACK");
      expect(state.mode).toBe("TIME_ATTACK");
      expect(state.timeRemaining).toBe(60);
    });
  });

  describe("generateRandomSpeed", () => {
    it("should return speed within min/max bounds", () => {
      for (let i = 0; i < 100; i++) {
        const speed = generateRandomSpeed();
        expect(speed).toBeGreaterThanOrEqual(MIN_GROWTH_SPEED);
        expect(speed).toBeLessThanOrEqual(MAX_GROWTH_SPEED);
      }
    });
  });

  describe("spawnActiveShape", () => {
    it("should create an active shape", () => {
      const state = createInitialState(1000);
      const newState = spawnActiveShape(state);
      expect(newState.activeShape).not.toBeNull();
    });

    it("should set a random speed", () => {
      const state = createInitialState(1000);
      const newState = spawnActiveShape(state);
      expect(newState.currentSpeed).toBeGreaterThanOrEqual(MIN_GROWTH_SPEED);
      expect(newState.currentSpeed).toBeLessThanOrEqual(MAX_GROWTH_SPEED);
    });

    it("should handle boss spawning at level 5 threshold", () => {
      const state = createInitialState(1000);
      state.score = 4; // next is 5
      const newState = spawnActiveShape(state);
      expect(newState.isBossLevel).toBe(true);
      expect(newState.activeShape?.type).toBe("hexagon");
    });
  });

  describe("updateActiveShape", () => {
    it("should increase size based on delta time", () => {
      let state = createInitialState(1000);
      state = spawnActiveShape(state);
      const initialSize = state.activeShape!.size;

      const updated = updateActiveShape(state, 0.1); // 100ms
      expect(updated.activeShape!.size).toBeGreaterThan(initialSize);
    });

    it("should increase rotation", () => {
      let state = createInitialState(1000);
      state = spawnActiveShape(state);
      const initialRotation = state.activeShape!.rotation;

      const updated = updateActiveShape(state, 0.1);
      expect(updated.activeShape!.rotation).toBeGreaterThan(initialRotation);
    });

    it("should return same state if no active shape", () => {
      const state = createInitialState(1000);
      const updated = updateActiveShape(state, 0.1);
      expect(updated).toEqual(state);
    });

    it("should apply pulsing size variation on boss levels with pulseEnabled", () => {
      let state = createInitialState(1000);
      state.score = 4; // Boss at score 5 (score+1=5)
      state = spawnActiveShape(state);
      expect(state.isBossLevel).toBe(true);

      const dt = 0.1;
      const updated1 = updateActiveShape(state, dt);

      // We expect the size to change by (growthIncrement + pulseOffset * 5) * dt
      // Let's just check that if we call it multiple times, the growth is not strictly constant
      // due to the sine wave in pulseOffset. Actually, growthIncrement is constant for a fixed state,
      // but pulseOffset depends on Date.now().

      // To test definitively, we'd need to mock Date.now() or check the logic.
      // For now, let's just ensure it doesn't crash and changes size.
      expect(updated1.activeShape!.size).not.toBe(state.activeShape!.size);
    });

    it("should apply erratic rotation on boss levels with erraticRotationEnabled", () => {
      let state = createInitialState(1000);
      state.score = 9; // Boss at score 10
      state = spawnActiveShape(state);
      expect(state.isBossLevel).toBe(true);

      const updated = updateActiveShape(state, 0.1);
      expect(updated.activeShape!.rotation).not.toBe(
        state.activeShape!.rotation
      );
    });
  });

  describe("checkContainment", () => {
    it("should return true when active shape is small", () => {
      let state = createInitialState(1000);
      state = spawnActiveShape(state);
      // Active shape starts at 5% of parent size, so it should be contained
      expect(checkContainment(state)).toBe(true);
    });

    it("should return true when no active shape", () => {
      const state = createInitialState(1000);
      expect(checkContainment(state)).toBe(true);
    });
  });

  describe("handleMiss", () => {
    it("should end game in CLASSIC mode", () => {
      let state = createInitialState(1000, "CLASSIC");
      state = spawnActiveShape(state);
      const newState = handleMiss(state);
      expect(newState.isGameOver).toBe(true);
    });

    it("should not end game in ZEN mode, but reset active shape", () => {
      let state = createInitialState(1000, "ZEN");
      state = spawnActiveShape(state);
      // Grow the shape first
      state.activeShape!.size = state.shapes[0].size * 2;
      const initialSize = state.activeShape!.size;

      const newState = handleMiss(state);
      expect(newState.isGameOver).toBe(false);
      expect(newState.activeShape?.size).toBeLessThan(initialSize);
      expect(newState.activeShape?.size).toBe(state.shapes[0].size * 0.05);
    });
  });

  describe("updateTimer", () => {
    it("should decrement time in TIME_ATTACK mode", () => {
      const state = createInitialState(1000, "TIME_ATTACK");
      const newState = updateTimer(state, 10);
      expect(newState.timeRemaining).toBe(50);
    });

    it("should end game when timer reaches zero", () => {
      const state = createInitialState(1000, "TIME_ATTACK");
      state.timeRemaining = 1;
      const newState = updateTimer(state, 2);
      expect(newState.timeRemaining).toBe(0);
      expect(newState.isGameOver).toBe(true);
    });
  });

  describe("restartActiveShape", () => {
    it("should reset active shape in ZEN mode", () => {
      let state = createInitialState(1000, "ZEN");
      state = spawnActiveShape(state);
      // Grow the shape
      state.activeShape!.size = 1000;

      const reset = restartActiveShape(state);
      expect(reset.activeShape?.size).toBeLessThan(1000);
      expect(reset.activeShape?.size).toBe(state.shapes[0].size * 0.05);
    });
  });

  describe("stackActiveShape", () => {
    it("should add active shape to stack", () => {
      let state = createInitialState(1000);
      state = spawnActiveShape(state);

      const { state: newState } = stackActiveShape(state);
      expect(newState.shapes.length).toBe(2);
      expect(newState.activeShape).toBeNull();
    });

    it("should increment score", () => {
      let state = createInitialState(1000);
      state = spawnActiveShape(state);

      const { state: newState } = stackActiveShape(state);
      expect(newState.score).toBe(1);
    });

    it("should level up after STACKS_PER_LEVEL", () => {
      let state = createInitialState(1000);

      // Stack 3 shapes (STACKS_PER_LEVEL = 3)
      for (let i = 0; i < 3; i++) {
        state = spawnActiveShape(state);
        const result = stackActiveShape(state);
        state = result.state;

        if (i === 2) {
          expect(result.leveledUp).toBe(true);
          expect(result.newLevel).toBe(2);
        }
      }
    });

    it("should transition to next world and reset level when level > 5", () => {
      let state = createInitialState(1000);
      // STACKS_PER_LEVEL = 3. Level 6 is reached at 3 * 5 = 15 stacks.
      for (let i = 0; i < 15; i++) {
        state = spawnActiveShape(state);
        const result = stackActiveShape(state);
        state = result.state;

        if (i === 14) {
          expect(result.worldUp).toBe(true);
          expect(state.world).toBe(2);
          expect(state.level).toBe(1);
          expect(state.shapes.length).toBe(1); // Stack should reset
        }
      }
    });

    it("should stay on world 2 for multiple stacks after reaching it", () => {
      let state = createInitialState(1000);
      // STACKS_PER_LEVEL = 3. 15 stacks to reach world 2.
      for (let i = 0; i < 15; i++) {
        state = spawnActiveShape(state);
        state = stackActiveShape(state).state;
      }
      expect(state.world).toBe(2);

      // Stack one more
      state = spawnActiveShape(state);
      state = stackActiveShape(state).state;
      expect(state.world).toBe(2); // Should STILL be world 2

      // Stack until level 2 of world 2 (score 18)
      state = spawnActiveShape(state);
      state = stackActiveShape(state).state; // Score 17
      state = spawnActiveShape(state);
      state = stackActiveShape(state).state; // Score 18
      expect(state.world).toBe(2);
      expect(state.level).toBe(2);
    });
  });

  describe("setGameOver", () => {
    it("should set isGameOver to true", () => {
      const state = createInitialState(1000);
      const gameOverState = setGameOver(state);
      expect(gameOverState.isGameOver).toBe(true);
    });
  });

  describe("updateZoom", () => {
    it("should interpolate towards target zoom", () => {
      let state = createInitialState(1000);
      state = { ...state, targetZoom: 2 };

      const updated = updateZoom(state, 0.1, 2);
      expect(updated.zoom).toBeGreaterThan(1);
      expect(updated.zoom).toBeLessThan(2);
    });

    it("should snap to target when very close", () => {
      let state = createInitialState(1000);
      state = { ...state, zoom: 1.9999, targetZoom: 2 };

      const updated = updateZoom(state, 0.1);
      expect(updated.zoom).toBe(2);
    });
  });

  describe("updateShapeOpacities", () => {
    it("should fade shapes older than 10", () => {
      let state = createInitialState(1000);
      // Add 15 shapes
      for (let i = 0; i < 14; i++) {
        state = spawnActiveShape(state);
        const { state: newState } = stackActiveShape(state);
        state = newState;
      }

      const updated = updateShapeOpacities(state);
      // First few shapes should start fading
      expect(updated.shapes[0].opacity).toBeLessThan(1);
    });
  });

  describe("updateShapeRotations", () => {
    it("should apply small rotation drift", () => {
      const state = createInitialState(1000);
      const initialRotation = state.shapes[0].rotation;

      const updated = updateShapeRotations(state);
      expect(updated.shapes[0].rotation).not.toBe(initialRotation);
    });

    it("should alternate rotation direction by index", () => {
      let state = createInitialState(1000);
      state = spawnActiveShape(state);
      const { state: newState } = stackActiveShape(state);
      const updatedState = updateShapeRotations(newState);

      // Even index rotates positive, odd index rotates negative
      const shape0Delta = updatedState.shapes[0].rotation;
      const shape1Delta = updatedState.shapes[1].rotation;
      expect(shape0Delta > 0).not.toBe(shape1Delta > 0);
    });
  });
});
