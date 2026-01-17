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
