import { useRef, useEffect, useCallback } from "react";
import { audioManager } from "../utils/audioManager";

type ShapeType =
  | "circle"
  | "square"
  | "triangle"
  | "rectangle"
  | "pentagon"
  | "hexagon"
  | "octagon";

interface Shape {
  type: ShapeType;
  size: number;
  rotation: number;
  color: string;
  opacity: number;
}

interface GameCanvasProps {
  onScore: (score: number) => void;
  onGameOver: (finalScore: number) => void;
  onLevelUp: (level: number) => void;
}

interface Point {
  x: number;
  y: number;
}

// Game constants
const MIN_GROWTH_SPEED = 25;
const MAX_GROWTH_SPEED = 90;
const STACKS_PER_LEVEL = 10;

// Shape unlocks by level
const SHAPE_UNLOCKS: Record<number, ShapeType[]> = {
  1: ["circle", "square", "triangle"],
  2: ["rectangle"],
  3: ["pentagon"],
  4: ["hexagon"],
  5: ["octagon"],
};

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
];

// Get unlocked shapes for a given level
const getUnlockedShapes = (level: number): ShapeType[] => {
  const unlocked: ShapeType[] = [];
  for (let i = 1; i <= level; i++) {
    if (SHAPE_UNLOCKS[i]) {
      unlocked.push(...SHAPE_UNLOCKS[i]);
    }
  }
  return unlocked;
};

// Helper to get vertices of regular polygons
const getRegularPolygonVertices = (
  sides: number,
  size: number,
  rotation: number
): Point[] => {
  const vertices: Point[] = [];
  const radius = size / 2;
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2 + rotation;
    vertices.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }
  return vertices;
};

// Helper to get vertices of a shape (for collision)
const getVertices = (shape: Shape): Point[] => {
  const size = shape.size;
  const rot = shape.rotation;

  if (shape.type === "circle") {
    // For circles, we sample the perimeter to simulate vertices
    const samples = 12;
    const vertices: Point[] = [];
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2 + rot;
      vertices.push({
        x: Math.cos(angle) * (size / 2),
        y: Math.sin(angle) * (size / 2),
      });
    }
    return vertices;
  } else if (shape.type === "square") {
    const half = size / 2;
    const corners = [
      { x: -half, y: -half },
      { x: half, y: -half },
      { x: half, y: half },
      { x: -half, y: half },
    ];
    return corners.map((p) => ({
      x: p.x * Math.cos(rot) - p.y * Math.sin(rot),
      y: p.x * Math.sin(rot) + p.y * Math.cos(rot),
    }));
  } else if (shape.type === "triangle") {
    const h = size * 0.866;
    const points = [
      { x: 0, y: -h / 2 },
      { x: size / 2, y: h / 2 },
      { x: -size / 2, y: h / 2 },
    ];
    return points.map((p) => ({
      x: p.x * Math.cos(rot) - p.y * Math.sin(rot),
      y: p.x * Math.sin(rot) + p.y * Math.cos(rot),
    }));
  } else if (shape.type === "rectangle") {
    const halfW = size / 2;
    const halfH = (size * 0.6) / 2;
    const corners = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ];
    return corners.map((p) => ({
      x: p.x * Math.cos(rot) - p.y * Math.sin(rot),
      y: p.x * Math.sin(rot) + p.y * Math.cos(rot),
    }));
  } else if (shape.type === "pentagon") {
    return getRegularPolygonVertices(5, size, rot);
  } else if (shape.type === "hexagon") {
    return getRegularPolygonVertices(6, size, rot);
  } else if (shape.type === "octagon") {
    return getRegularPolygonVertices(8, size, rot);
  }
  return [];
};

// Check if a point is inside a shape
const isPointInShape = (point: Point, shape: Shape): boolean => {
  const size = shape.size;
  const rot = shape.rotation;

  // Transform point to shape's local space (undo rotation)
  const localX = point.x * Math.cos(-rot) - point.y * Math.sin(-rot);
  const localY = point.x * Math.sin(-rot) + point.y * Math.cos(-rot);

  if (shape.type === "circle") {
    const dist = Math.sqrt(localX * localX + localY * localY);
    return dist <= size / 2 + 0.5; // Small buffer
  } else if (shape.type === "square") {
    const half = size / 2;
    return Math.abs(localX) <= half + 0.5 && Math.abs(localY) <= half + 0.5;
  } else if (shape.type === "triangle") {
    const h = size * 0.866;
    const halfW = size / 2;

    if (localY < -h / 2 || localY > h / 2) return false;

    const xLimit = (h / 2 - localY) * (halfW / h);
    return Math.abs(localX) <= xLimit + 0.5;
  } else if (shape.type === "rectangle") {
    const halfW = size / 2;
    const halfH = (size * 0.6) / 2;
    return Math.abs(localX) <= halfW + 0.5 && Math.abs(localY) <= halfH + 0.5;
  } else if (
    shape.type === "pentagon" ||
    shape.type === "hexagon" ||
    shape.type === "octagon"
  ) {
    // For regular polygons, use inscribed circle approximation for quick check
    const sides =
      shape.type === "pentagon" ? 5 : shape.type === "hexagon" ? 6 : 8;
    const radius = size / 2;
    // Inscribed circle radius for regular polygon
    const inRadius = radius * Math.cos(Math.PI / sides);
    const dist = Math.sqrt(localX * localX + localY * localY);

    // Quick rejection
    if (dist > radius + 0.5) return false;
    // Quick accept
    if (dist <= inRadius) return true;

    // Detailed check: use ray casting algorithm
    const vertices = getRegularPolygonVertices(sides, size, 0);
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x,
        yi = vertices[i].y;
      const xj = vertices[j].x,
        yj = vertices[j].y;

      if (
        yi > localY !== yj > localY &&
        localX < ((xj - xi) * (localY - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }
    return inside;
  }
  return false;
};

// Check if child is fully contained in parent
const isContained = (child: Shape, parent: Shape): boolean => {
  const childVertices = getVertices(child);
  return childVertices.every((v) => isPointInShape(v, parent));
};

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
      const h = size * 0.866;
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(size / 2, h / 2);
      ctx.lineTo(-size / 2, h / 2);
      ctx.closePath();
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

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

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
