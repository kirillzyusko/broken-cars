import track from "../public/maps/corsica-gp/track.json" with { type: "json" };
import { CAR_SIZE_WORLD, ROAD_WORLD_LENGTH, TRACK_LENGTH_METERS, carPositionToWorld } from "./race-config.js";

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
    distance: 0, lane: 0, routeDistance: null, finishCrossingAtMs: null, nextGate: 0, reverseHeld: 0, offRoad: false, throttle: 0, braking: false, drifting: false, driftSlip: 0,
    collisionCount: 0, lastCollision: null, impactReadyAt: null, startGasAt: null, startGasHeld: false, launchResolved: false, startResult: null,
    launchBoostRemaining: 0, startStallRemaining: 0, reverseMeters: 0, hornHeld: false, hornReadyAt: null,
    spawnIndex: index, resetVersion: (car.resetVersion ?? 0) + 1 });
}
export function recoverDriving(car) {
  const pose = car.nextGate > 0 ? sampleTrack((car.nextGate - 1) * gateSpacing) : null;
  car.worldPosition = pose ? { x: pose.x, y: pose.y + CAR_SIZE_WORLD.y / 2, z: pose.z } : drivingSpawn(car.spawnIndex);
  car.routeDistance = pose ? (car.nextGate - 1) * gateSpacing : null;
  car.heading = pose ? -pose.yaw : 0;
  car.speed = car.velocityX = car.velocityZ = car.angularVelocity = car.steeringAngle = 0;
  car.resetVersion = (car.resetVersion ?? 0) + 1;
}
// Use the authored route segments, rather than long chords between checkpoints.
const routeSegments = track.points.slice(0, -1).map((a, index) => {
  const b = track.points[index + 1];
  const dx = b[0] - a[0], dz = b[2] - a[2];
  return { x: a[0], z: a[2], dx, dz, lengthSquared: dx * dx + dz * dz,
    start: track.distances[index], length: track.distances[index + 1] - track.distances[index] };
});

function projectOntoRoute(position, reference) {
  let nearest = null;
  for (const segment of routeSegments) {
    if (!segment.lengthSquared) continue;
    const t = Math.max(0, Math.min(1, ((position.x - segment.x) * segment.dx + (position.z - segment.z) * segment.dz) / segment.lengthSquared));
    const x = segment.x + segment.dx * t, z = segment.z + segment.dz * t;
    const error = (position.x - x) ** 2 + (position.z - z) ** 2;
    const wrapped = segment.start + segment.length * t;
    const distance = wrapped + Math.round((reference - wrapped) / ROAD_WORLD_LENGTH) * ROAD_WORLD_LENGTH;
    if (!nearest || error < nearest.error - 1e-8 || (Math.abs(error - nearest.error) < 1e-8 && Math.abs(distance - reference) < Math.abs(nearest.distance - reference))) {
      const length = Math.sqrt(segment.lengthSquared);
      nearest = { error, distance, lane: (-segment.dz * (position.x - x) + segment.dx * (position.z - z)) / length / 1.35 };
    }
  }
  return nearest;
}

export function updateLapProgress(car, previous) {
  if (car.nextGate > LAP_GATES) return;
  const reference = car.routeDistance ?? Math.max(0, car.nextGate - 1) * gateSpacing;
  const before = projectOntoRoute(previous, reference);
  const after = projectOntoRoute(car.worldPosition, before.distance);
  const travel = Math.hypot(car.worldPosition.x - previous.x, car.worldPosition.z - previous.z);
  const progress = after.distance - before.distance;
  car.routeDistance = after.distance;
  car.lane = after.lane;
  // Count checkpoints along continuous travel, including grass detours. A jump
  // across the island cannot satisfy missing checkpoints or finish the lap.
  if (travel <= gateSpacing * 2 && progress > 0 && progress <= travel + gateSpacing * 2) {
    while (car.nextGate <= LAP_GATES && before.distance <= car.nextGate * gateSpacing + 1e-6
      && after.distance >= car.nextGate * gateSpacing) {
      car.nextGate++;
    }
  }
  if (car.nextGate > LAP_GATES) {
    car.distance = TRACK_LENGTH_METERS;
    return Math.max(0, Math.min(1, (ROAD_WORLD_LENGTH - before.distance) / progress));
  }
  car.distance = Math.min(after.distance, car.nextGate * gateSpacing - 0.001) / ROAD_WORLD_LENGTH * TRACK_LENGTH_METERS;
}
