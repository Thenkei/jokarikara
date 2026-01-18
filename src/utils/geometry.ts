export type ShapeType =
  | "circle"
  | "square"
  | "triangle"
  | "rectangle"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "star"
  | "diamond";

export interface Shape {
  type: ShapeType;
  size: number;
  rotation: number;
  color: string;
  opacity: number;
}

export interface Point {
  x: number;
  y: number;
}

// Helper to get vertices of regular polygons
export const getRegularPolygonVertices = (
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

// Helper to get vertices of a 5-pointed star
export const getStarVertices = (
  size: number,
  rotation: number,
  innerRatio: number = 0.4
): Point[] => {
  const vertices: Point[] = [];
  const radius = size / 2;
  const innerRadius = radius * innerRatio;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : innerRadius;
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2 + rotation;
    vertices.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  }
  return vertices;
};

// Helper to get vertices of a shape (for collision)
export const getVertices = (shape: Shape): Point[] => {
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
    return getRegularPolygonVertices(3, size, rot);
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
  } else if (shape.type === "star") {
    return getStarVertices(size, rot);
  } else if (shape.type === "diamond") {
    const halfW = size / 2;
    const halfH = (size * 0.7) / 2;
    const corners = [
      { x: 0, y: -halfH },
      { x: halfW, y: 0 },
      { x: 0, y: halfH },
      { x: -halfW, y: 0 },
    ];
    return corners.map((p) => ({
      x: p.x * Math.cos(rot) - p.y * Math.sin(rot),
      y: p.x * Math.sin(rot) + p.y * Math.cos(rot),
    }));
  }
  return [];
};

// Check if a point is inside a shape
export const isPointInShape = (point: Point, shape: Shape): boolean => {
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
  } else if (shape.type === "rectangle") {
    const halfW = size / 2;
    const halfH = (size * 0.6) / 2;
    return Math.abs(localX) <= halfW + 0.5 && Math.abs(localY) <= halfH + 0.5;
  } else if (
    shape.type === "pentagon" ||
    shape.type === "hexagon" ||
    shape.type === "octagon" ||
    shape.type === "triangle"
  ) {
    // For regular polygons, use inscribed circle approximation for quick check
    const sides =
      shape.type === "pentagon"
        ? 5
        : shape.type === "hexagon"
        ? 6
        : shape.type === "octagon"
        ? 8
        : 3;
    const radius = size / 2;
    // Inscribed circle radius for regular polygon
    const inRadius = radius * Math.cos(Math.PI / sides);
    const dist = Math.sqrt(localX * localX + localY * localY);

    // Quick rejection
    if (dist > radius + 0.5) return false;
    // Quick accept
    if (dist <= inRadius) return true;

    // Detailed check: use ray casting algorithm
    const vertices = getRegularPolygonVertices(sides, size + 1.0, 0); // 1px buffer
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
  } else if (shape.type === "diamond") {
    const halfW = size / 2;
    const halfH = (size * 0.7) / 2;
    // Normalized diamond: |x/w| + |y/h| <= 1
    return Math.abs(localX) / halfW + Math.abs(localY) / halfH <= 1.05; // 0.05 buffer
  } else if (shape.type === "star") {
    // Star detailed check using ray casting
    const vertices = getStarVertices(size + 1.0, 0, 0.4);
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
export const isContained = (child: Shape, parent: Shape): boolean => {
  const childVertices = getVertices(child);
  return childVertices.every((v) => isPointInShape(v, parent));
};
