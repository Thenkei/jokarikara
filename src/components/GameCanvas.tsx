import { useRef, useEffect, useCallback } from "react";
import { audioManager } from "../utils/audioManager";

import type { Shape } from "../utils/geometry";
import { isContained } from "../utils/geometry";
import { calculateNextZoom } from "../utils/gameLogic";
import {
  MIN_GROWTH_SPEED,
  MAX_GROWTH_SPEED,
  STACKS_PER_LEVEL,
  COLORS,
  getUnlockedShapes,
} from "../constants/game";

interface GameCanvasProps {
  onScore: (score: number) => void;
  onGameOver: (finalScore: number) => void;
  onLevelUp: (level: number) => void;
}

// Draw a regular polygon
const drawRegularPolygon = (
  ctx: CanvasRenderingContext2D,
  sides: number,
  size: number
) => {
  const radius = size / 2;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
};

export const GameCanvas = ({
  onScore,
  onGameOver,
  onLevelUp,
}: GameCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapesRef = useRef<Shape[]>([]);
  const activeShapeRef = useRef<Shape | null>(null);
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const lastTimeRef = useRef(0);
  const isGameOverRef = useRef(false);
  const currentSpeedRef = useRef(MIN_GROWTH_SPEED); // Store speed for the current active shape
  const zoomRef = useRef(1);
  const targetZoomRef = useRef(1);
  const initialSizeRef = useRef(0);

  const createNewActiveShape = useCallback(() => {
    const unlockedShapes = getUnlockedShapes(levelRef.current);
    const nextType =
      unlockedShapes[Math.floor(Math.random() * unlockedShapes.length)];

    // Get last color to avoid repetition
    const lastColor =
      shapesRef.current.length > 0
        ? shapesRef.current[shapesRef.current.length - 1].color
        : null;

    let nextColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    // If choice is same as last, pick the next index as fallback
    if (nextColor === lastColor) {
      const idx = COLORS.indexOf(nextColor);
      nextColor = COLORS[(idx + 1) % COLORS.length];
    }

    // Set a random speed for this specific shape instance (between min and max)
    currentSpeedRef.current =
      MIN_GROWTH_SPEED + Math.random() * (MAX_GROWTH_SPEED - MIN_GROWTH_SPEED);

    activeShapeRef.current = {
      type: nextType,
      size: 10,
      rotation: 0,
      color: nextColor,
      opacity: 0.8,
    };
  }, []);

  // Initialize first shape
  useEffect(() => {
    const startSize = Math.min(window.innerWidth, window.innerHeight) * 0.45;
    initialSizeRef.current = startSize;
    const firstShape: Shape = {
      type: "circle",
      size: startSize,
      rotation: 0,
      color: COLORS[0],
      opacity: 1,
    };
    shapesRef.current = [firstShape];
    createNewActiveShape();
  }, [createNewActiveShape]);

  const endGame = useCallback(() => {
    isGameOverRef.current = true;
    audioManager.playFailSound();
    onGameOver(scoreRef.current);
  }, [onGameOver]);

  const handleTap = useCallback(() => {
    if (isGameOverRef.current || !activeShapeRef.current) return;

    const activeShape = activeShapeRef.current;
    const lastShape = shapesRef.current[shapesRef.current.length - 1];

    // Precise Containment Check
    if (!isContained(activeShape, lastShape)) {
      endGame();
      return;
    }

    // Success: Add active shape to stack
    shapesRef.current.push({ ...activeShape, opacity: 1 });
    scoreRef.current += 1;
    onScore(scoreRef.current);
    audioManager.playStackSound(scoreRef.current);

    // Check for level up
    const newLevel = Math.floor(scoreRef.current / STACKS_PER_LEVEL) + 1;
    if (newLevel > levelRef.current) {
      levelRef.current = newLevel;
      onLevelUp(newLevel);
      audioManager.playStackSound(scoreRef.current * 2); // Double pitch for level up

      // Trigger zoom in
      // Calculate how much to zoom to keep shapes at a playable size
      targetZoomRef.current = calculateNextZoom(
        targetZoomRef.current,
        activeShape.size,
        initialSizeRef.current
      );
    }

    // Create next active shape
    createNewActiveShape();
  }, [onScore, onLevelUp, endGame, createNewActiveShape]);

  const drawShape = (
    ctx: CanvasRenderingContext2D,
    shape: Shape,
    x: number,
    y: number
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(shape.rotation);
    ctx.globalAlpha = shape.opacity;
    ctx.fillStyle = shape.color;

    const size = shape.size;

    ctx.beginPath();
    if (shape.type === "circle") {
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    } else if (shape.type === "square") {
      ctx.rect(-size / 2, -size / 2, size, size);
    } else if (shape.type === "triangle") {
      drawRegularPolygon(ctx, 3, size);
    } else if (shape.type === "rectangle") {
      const height = size * 0.6;
      ctx.rect(-size / 2, -height / 2, size, height);
    } else if (shape.type === "pentagon") {
      drawRegularPolygon(ctx, 5, size);
    } else if (shape.type === "hexagon") {
      drawRegularPolygon(ctx, 6, size);
    } else if (shape.type === "octagon") {
      drawRegularPolygon(ctx, 8, size);
    }

    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    const loop = (time: number) => {
      if (isGameOverRef.current) return;

      if (lastTimeRef.current === 0) {
        lastTimeRef.current = time;
        requestAnimationFrame(loop);
        return;
      }

      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      const pulse = (Math.sin(time / 500) + 1) / 2;

      if (activeShapeRef.current) {
        // Use the fixed random speed assigned to this shape
        activeShapeRef.current.size += currentSpeedRef.current * dt;

        // Add rotation based on score (capped to prevent dizziness)
        const rotationSpeed = 0.5 + Math.min(scoreRef.current * 0.05, 1.5);
        activeShapeRef.current.rotation += rotationSpeed * dt;

        const lastShape = shapesRef.current[shapesRef.current.length - 1];

        // Auto-fail if it starts poking out
        if (!isContained(activeShapeRef.current, lastShape)) {
          endGame();
        }
      }

      // Smoothly interpolate zoom
      const zoomLerpSpeed = 2; // Adjust for faster/slower zoom
      if (Math.abs(zoomRef.current - targetZoomRef.current) > 0.001) {
        zoomRef.current +=
          (targetZoomRef.current - zoomRef.current) * zoomLerpSpeed * dt;
      } else {
        zoomRef.current = targetZoomRef.current;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      ctx.save();
      // Apply zoom centered on the stack
      ctx.translate(centerX, centerY);
      ctx.scale(zoomRef.current, zoomRef.current);
      ctx.translate(-centerX, -centerY);

      ctx.beginPath();
      const grad = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        canvas.width * 0.8
      );
      grad.addColorStop(0, `rgba(255, 255, 255, ${0.03 + pulse * 0.02})`);
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      shapesRef.current.forEach((shape, index) => {
        const age = shapesRef.current.length - 1 - index;
        if (age > 10) {
          shape.opacity = Math.max(0, shape.opacity - 0.005);
        }

        shape.rotation += 0.005 * (index % 2 === 0 ? 1 : -1);

        drawShape(ctx, shape, centerX, centerY);
      });

      if (activeShapeRef.current) {
        drawShape(ctx, activeShapeRef.current, centerX, centerY);
      }

      ctx.restore();

      requestAnimationFrame(loop);
    };

    const animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [endGame]);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleTap}
      style={{ width: "100%", height: "100%", cursor: "pointer" }}
    />
  );
};
