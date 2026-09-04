export const SHAKE_DISTANCE_REQUIRED = 620
const MAX_SHAKE_SEGMENT = 90

export type PointerPoint = { x: number; y: number }

export function addShakeMovement(
  currentDistance: number,
  previousPoint: PointerPoint,
  nextPoint: PointerPoint,
): number {
  const segmentDistance = Math.hypot(
    nextPoint.x - previousPoint.x,
    nextPoint.y - previousPoint.y,
  )

  return Math.min(
    SHAKE_DISTANCE_REQUIRED,
    currentDistance + Math.min(segmentDistance, MAX_SHAKE_SEGMENT),
  )
}
