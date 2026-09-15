// The server chooses the active defect in severity order. Never inspect the queue.
export function discoverableDefectId(car) {
  if (!car) return null;
  if (Object.hasOwn(car, "activeDefectId")) return car.activeDefectId;
  // Older snapshots and local driving tests expose the active defect first.
  if (car.defectIds) return car.defectIds[0] ?? null;
  return car.defects?.[0]?.id ?? null;
}
