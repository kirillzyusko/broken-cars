// Every remaining defect is active and visible at the same time.
export function discoverableDefectIds(car) {
  return [...new Set(car?.defectIds ?? car?.defects?.map((defect) => defect.id) ?? [])];
}
export function discoverableDefectId(car) {
  return discoverableDefectIds(car)[0] ?? null;
}
