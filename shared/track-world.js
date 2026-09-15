import track from "../public/maps/corsica-gp/track.json" with { type: "json" };
import { CAR_SIZE_WORLD, ROAD_WORLD_LENGTH, TRACK_LENGTH_METERS, ROAD_HALF_WIDTH, carPositionToWorld } from "./race-config.js";

// Distances are measured along the closed centerline, including behind the grid.
export function sampleTrack(distance) {
  const s = ((distance % ROAD_WORLD_LENGTH) + ROAD_WORLD_LENGTH) % ROAD_WORLD_LENGTH;
  let low = 0;
  let high = track.distances.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (track.distances[mid] <= s) low = mid;
    else high = mid;
  }
  const a = track.points[low];
  const b = track.points[high];
  const t = (s - track.distances[low]) / (track.distances[high] - track.distances[low]);
  const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const forward = { x: (b[0] - a[0]) / length, z: (b[2] - a[2]) / length };
  return {
    x: a[0] + (b[0] - a[0]) * t,
    y: a[1] + (b[1] - a[1]) * t,
    z: a[2] + (b[2] - a[2]) * t,
    forward,
    yaw: Math.atan2(-forward.x, -forward.z) * 180 / Math.PI,
  };
}

export function circuitTransform(position) {
  const pose = sampleTrack(-position.z);
  return {
    x: pose.x - pose.forward.z * position.x,
    y: pose.y + position.y,
    z: pose.z + pose.forward.x * position.x,
    yaw: pose.yaw,
    forward: pose.forward,
  };
}

export function carWorldTransform(car, index = 0, carCount = 1) {
  if (car.worldPosition) {
    const radians = (car.heading ?? 0) * Math.PI / 180;
    return { ...car.worldPosition, yaw: -(car.heading ?? 0), forward: { x: Math.sin(radians), z: -Math.cos(radians) } };
  }
  const pose = circuitTransform(carPositionToWorld(car, index, carCount));
  return { ...pose, yaw: pose.yaw - (car.heading ?? 0) };
}


// Gates measure a lap. They never constrain the kart's position or heading.
export const LAP_GATES = 80;
const gateSpacing = ROAD_WORLD_LENGTH / LAP_GATES;
export function drivingSpawn(index = 0) {
  return { x: index % 2 === 0 ? 1.47711 : -1.47711,
    y: CAR_SIZE_WORLD.y / 2, z: 3.01336 + (index % 2) * 0.53098 + Math.floor(index / 2) * 2.75148 };
}
export function resetDriving(car, index = 0) {
  Object.assign(car, { worldPosition: drivingSpawn(index), heading: 0, speed: 0,
    velocityX: 0, velocityZ: 0, steeringAngle: 0, angularVelocity: 0,
    distance: 0, lane: 0, nextGate: 0, reverseHeld: 0, offRoad: false, throttle: 0, braking: false, drifting: false, driftSlip: 0,
    collisionCount: 0, lastCollision: null, impactReadyAt: null, startGasAt: null, startGasHeld: false, launchResolved: false, startResult: null,
    launchBoostRemaining: 0, startStallRemaining: 0, reverseMeters: 0, hornHeld: false, hornReadyAt: null,
    spawnIndex: index, resetVersion: (car.resetVersion ?? 0) + 1 });
}
export function recoverDriving(car) {
  const pose = car.nextGate > 0 ? sampleTrack((car.nextGate - 1) * gateSpacing) : null;
  car.worldPosition = pose ? { x: pose.x, y: pose.y + CAR_SIZE_WORLD.y / 2, z: pose.z } : drivingSpawn(car.spawnIndex);
  car.heading = pose ? -pose.yaw : 0;
  car.speed = car.velocityX = car.velocityZ = car.angularVelocity = car.steeringAngle = 0;
  car.resetVersion = (car.resetVersion ?? 0) + 1;
}
export function updateLapProgress(car, previous) {
  if (car.nextGate > LAP_GATES) return;
  const gate = sampleTrack(car.nextGate * gateSpacing);
  const before = (previous.x - gate.x) * gate.forward.x + (previous.z - gate.z) * gate.forward.z;
  const after = (car.worldPosition.x - gate.x) * gate.forward.x + (car.worldPosition.z - gate.z) * gate.forward.z;
  if (before <= 0 && after > 0) {
    const t = -before / (after - before);
    const x = previous.x + (car.worldPosition.x - previous.x) * t - gate.x;
    const z = previous.z + (car.worldPosition.z - previous.z) * t - gate.z;
    if (Math.abs(-gate.forward.z * x + gate.forward.x * z) < ROAD_HALF_WIDTH + 1.5) car.nextGate++;
  }
  if (car.nextGate > LAP_GATES) { car.distance = TRACK_LENGTH_METERS; return; }
  // Project onto nearby track segments so overtakes and reversing change order.
  // Ordered gates still cap progress and prevent shortcuts from completing a lap.
  let nearest = null;
  for (let segment = Math.max(-6, car.nextGate - 7); segment < Math.max(1, car.nextGate); segment++) {
    const startDistance = segment * gateSpacing;
    const a = sampleTrack(startDistance);
    const b = sampleTrack(startDistance + gateSpacing);
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((car.worldPosition.x - a.x) * dx + (car.worldPosition.z - a.z) * dz) / (dx * dx + dz * dz)));
    const x = a.x + dx * t, z = a.z + dz * t;
    const error = (car.worldPosition.x - x) ** 2 + (car.worldPosition.z - z) ** 2;
    if (!nearest || error < nearest.error) nearest = { error, distance: startDistance + t * gateSpacing, pose: a };
  }
  car.distance = Math.min(nearest.distance, car.nextGate * gateSpacing - 0.001) / ROAD_WORLD_LENGTH * TRACK_LENGTH_METERS;
  car.lane = (-nearest.pose.forward.z * (car.worldPosition.x - nearest.pose.x) + nearest.pose.forward.x * (car.worldPosition.z - nearest.pose.z)) / 1.35;
}
