/**
 * Calculates the next zoom level for the game camera.
 *
 * @param currentZoom - The current zoom factor
 * @param currentSize - The size of the shape that triggered the zoom
 * @param referenceSize - The target size we want the shape to appear as (e.g. initial start size)
 * @param factor - A scaling factor to apply (e.g. 0.8 to keep some margin)
 * @returns The new target zoom factor
 */
export const calculateNextZoom = (
  currentZoom: number,
  currentSize: number,
  referenceSize: number,
  factor: number = 0.8
): number => {
  if (currentSize <= 0) return currentZoom;
  return currentZoom * (referenceSize / currentSize) * factor;
};
