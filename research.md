Here are a few techniques you can use to achieve homothety or similar effects:

1. Manual Geometric Scaling (Recommended for Visual Polish)
   Instead of scaling the canvas, you pass the zoom level into your drawing function. This ensures that a 3px stroke remains 3px regardless of how far you've zoomed out, preventing shapes from looking "thin" or "blurry" as they get smaller.

How it works: The homothety $H(C, k)$ is applied to the dimensions of the shape before drawing:

```typescript
// Inside GameCanvas.tsx, refactor drawShape to accept zoom
const drawShape = (
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  centerX: number,
  centerY: number,
  zoom: number // Add zoom here
) => {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(shape.rotation);

  // Apply the homothety ratio to the size
  const scaledSize = shape.size * zoom;
  ctx.beginPath();
  if (shape.type === "circle") {
    ctx.arc(0, 0, scaledSize / 2, 0, Math.PI * 2);
  } else if (shape.type === "square") {
    ctx.rect(-scaledSize / 2, -scaledSize / 2, scaledSize, scaledSize);
  }
  // ... and so on ...
  ctx.fill();

  // IMPORTANT: The line width stays constant!
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
};
```

2. The Transformation Matrix (setTransform)
   Instead of a sequence of translate -> scale -> translate, you can apply the homothety matrix directly. A homothety centered at $(x_0, y_0)$ with ratio $k$ is represented by the matrix:

$$ \begin{pmatrix} k & 0 & x_0(1-k) \ 0 & k & y_0(1-k) \ 0 & 0 & 1 \end{pmatrix} $$

In Canvas code, this is a "one-shot" transformation:

```typescript
const k = zoomRef.current;
const dx = centerX * (1 - k);
const dy = centerY * (1 - k);
// setTransform(a, b, c, d, e, f)
ctx.setTransform(k, 0, 0, k, dx, dy);
```

This is mathematically cleaner but still has the same visual side effects as ctx.scale.

3. Perspective Projection (Pseudo-3D)
   If you want to move beyond simple 2D homothety, you can use a Perspective Projection. Instead of scaling everything by the same zoom, you can give each shape a "depth" (Z-index).

Older shapes have a higher $Z$, and their scale is calculated as $1 / (1 + Z \cdot \text{perspectiveFactor})$. This makes the stack look like it's actually receding into the distance, which is a common effect in premium stacking games.

Example Logic:

```typescript
shapesRef.current.forEach((shape, index) => {
  const age = shapesRef.current.length - 1 - index;
  // Deepening effect: things further down look smaller and deeper
  const perspectiveZoom = zoomRef.current * (1 / (1 + age * 0.05));
  drawShape(ctx, shape, centerX, centerY, perspectiveZoom);
});
```

4. CSS-Based Homothety (Layered Approach)
   You could also apply the homothety to the entire canvas element using CSS transforms.

```css
canvas {
  transform: scale(var(--zoom));
  transform-origin: center;
}
```

This is extremely fast for the GPU but can lead to pixelation if you zoom in, as the browser is just scaling the bitmap image rather than re-rendering the vectors at the new size.
