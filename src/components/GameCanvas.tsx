import { useRef, useEffect, useCallback } from 'react';
import { audioManager } from '../utils/audioManager';

interface Shape {
  type: 'circle' | 'square' | 'triangle';
  size: number;
  rotation: number;
  color: string;
  opacity: number;
}

interface GameCanvasProps {
  onScore: (score: number) => void;
  onGameOver: (finalScore: number) => void;
}

interface Point {
  x: number;
  y: number;
}

const COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
];

// Helper to get vertices of a shape (for collision)
const getVertices = (shape: Shape): Point[] => {
  const size = shape.size;
  const rot = shape.rotation;
  const vertices: Point[] = [];

  if (shape.type === 'circle') {
    // For circles, we sample the perimeter to simulate vertices
    const samples = 12;
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2 + rot;
      vertices.push({
        x: Math.cos(angle) * (size / 2),
        y: Math.sin(angle) * (size / 2),
      });
    }
  } else if (shape.type === 'square') {
    const half = size / 2;
    const corners = [
      { x: -half, y: -half },
      { x: half, y: -half },
      { x: half, y: half },
      { x: -half, y: half },
    ];
    corners.forEach(p => {
      vertices.push({
        x: p.x * Math.cos(rot) - p.y * Math.sin(rot),
        y: p.x * Math.sin(rot) + p.y * Math.cos(rot),
      });
    });
  } else if (shape.type === 'triangle') {
    const h = size * 0.866;
    const points = [
      { x: 0, y: -h / 2 },
      { x: size / 2, y: h / 2 },
      { x: -size / 2, y: h / 2 },
    ];
    points.forEach(p => {
      vertices.push({
        x: p.x * Math.cos(rot) - p.y * Math.sin(rot),
        y: p.x * Math.sin(rot) + p.y * Math.cos(rot),
      });
    });
  }
  return vertices;
};

// Check if a point is inside a shape
const isPointInShape = (point: Point, shape: Shape): boolean => {
  const size = shape.size;
  const rot = shape.rotation;

  // Transform point to shape's local space (undo rotation)
  const localX = point.x * Math.cos(-rot) - point.y * Math.sin(-rot);
  const localY = point.x * Math.sin(-rot) + point.y * Math.cos(-rot);

  if (shape.type === 'circle') {
    const dist = Math.sqrt(localX * localX + localY * localY);
    return dist <= size / 2 + 0.5; // Small buffer
  } else if (shape.type === 'square') {
    const half = size / 2;
    return Math.abs(localX) <= half + 0.5 && Math.abs(localY) <= half + 0.5;
  } else if (shape.type === 'triangle') {
    const h = size * 0.866;
    const halfW = size / 2;
    
    // Triangle bounds in local space:
    // Top: (0, -h/2), Bottom Right: (halfW, h/2), Bottom Left: (-halfW, h/2)
    // barycentric coordinates or simple edge tests
    if (localY < -h / 2 || localY > h / 2) return false;
    
    // Edges are:
    // Bottom: y = h/2
    // Left: (y - h/2) / ((-h/2) - h/2) = (x - (-halfW)) / (0 - (-halfW))
    // (y - h/2) / (-h) = (x + halfW) / halfW
    // (y - h/2) * halfW / (-h) - halfW = x
    const xLimit = (h / 2 - localY) * (halfW / h);
    return Math.abs(localX) <= xLimit + 0.5;
  }
  return false;
};

// Check if child is fully contained in parent
const isContained = (child: Shape, parent: Shape): boolean => {
  const childVertices = getVertices(child);
  return childVertices.every(v => isPointInShape(v, parent));
};

export const GameCanvas = ({ onScore, onGameOver }: GameCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapesRef = useRef<Shape[]>([]);
  const activeShapeRef = useRef<Shape | null>(null);
  const scoreRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isGameOverRef = useRef(false);

  // Initialize first shape
  useEffect(() => {
    const startSize = Math.min(window.innerWidth, window.innerHeight) * 0.45;
    const firstShape: Shape = {
      type: 'circle',
      size: startSize,
      rotation: 0,
      color: COLORS[0],
      opacity: 1,
    };
    shapesRef.current = [firstShape];
    createNewActiveShape();
  }, []);

  const createNewActiveShape = () => {
    const nextType = (['circle', 'square', 'triangle'] as const)[Math.floor(Math.random() * 3)];
    
    // Get last color to avoid repetition
    const lastColor = shapesRef.current.length > 0 
      ? shapesRef.current[shapesRef.current.length - 1].color 
      : null;

    let nextColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    // If choice is same as last, pick the next index as fallback
    if (nextColor === lastColor) {
      const idx = COLORS.indexOf(nextColor);
      nextColor = COLORS[(idx + 1) % COLORS.length];
    }
    
    activeShapeRef.current = {
      type: nextType,
      size: 10,
      rotation: 0,
      color: nextColor,
      opacity: 0.8,
    };
  };

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

    // Create next active shape
    createNewActiveShape();
  }, [onScore]);

  const endGame = () => {
    isGameOverRef.current = true;
    audioManager.playFailSound();
    onGameOver(scoreRef.current);
  };

  const drawShape = (ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(shape.rotation);
    ctx.globalAlpha = shape.opacity;
    ctx.fillStyle = shape.color;

    const size = shape.size;

    ctx.beginPath();
    if (shape.type === 'circle') {
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    } else if (shape.type === 'square') {
      ctx.rect(-size / 2, -size / 2, size, size);
    } else if (shape.type === 'triangle') {
      const h = size * 0.866;
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(size / 2, h / 2);
      ctx.lineTo(-size / 2, h / 2);
      ctx.closePath();
    }
    
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    
    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
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
        const growthSpeed = 40 + (scoreRef.current * 3);
        activeShapeRef.current.size += growthSpeed * dt;
        
        // Add rotation based on score
        const rotationSpeed = 0.5 + (scoreRef.current * 0.1);
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
      const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, canvas.width * 0.8);
      grad.addColorStop(0, `rgba(255, 255, 255, ${0.03 + pulse * 0.02})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
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
      window.removeEventListener('resize', resize);
    };
  }, [onGameOver]);

  return (
    <canvas 
      ref={canvasRef} 
      onClick={handleTap}
      style={{ width: '100%', height: '100%', cursor: 'pointer' }}
    />
  );
};
