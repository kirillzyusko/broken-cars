import track from "../public/maps/corsica-gp/track.json" with { type: "json" };
import kart from "../public/models/kart/kart.json" with { type: "json" };

export const TRACK_LENGTH_METERS = track.serverRaceDistance;
export const DISTANCE_TO_WORLD = track.lapLength / TRACK_LENGTH_METERS;
export const LANE_TO_WORLD = 1.35;
export const ROAD_HALF_WIDTH = track.roadHalfWidth;
export const ROAD_WORLD_LENGTH = TRACK_LENGTH_METERS * DISTANCE_TO_WORLD;

const { min: kartMin, max: kartMax } = kart.geometry.bounds;
const CAR_LENGTH_WORLD = 1.4;
export const KART_SCALE = CAR_LENGTH_WORLD / (kartMax[2] - kartMin[2]);
export const CAR_SIZE_WORLD = Object.freeze({
  x: (kartMax[0] - kartMin[0]) * KART_SCALE,
  y: (kartMax[1] - kartMin[1]) * KART_SCALE,
  z: CAR_LENGTH_WORLD,
});
export const CAR_FRONT_AXLE_OFFSET_WORLD = ((kartMin[2] + kartMax[2]) / 2 - kart.geometry.frontAxle[2]) * KART_SCALE;

const GRID_COLUMN_OFFSET = 0.9;
const GRID_ROW_OFFSET = 3;

// Scenery collisions come from the island mesh, without prototype lane blocks.
export const TRACK_OBSTACLES = Object.freeze([]);

// The map tour still accepts a distance and lane. Driving uses worldPosition.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const GRID_FADE_DISTANCE = 40;

export function startingGridWorldOffset(index = 0, carCount = 1) {
  return {
    x: carCount > 1 ? (index % 2 === 0 ? -GRID_COLUMN_OFFSET : GRID_COLUMN_OFFSET) : 0,
    z: 4 + Math.floor(index / 2) * GRID_ROW_OFFSET,
  };
}

export function clampCarLane(lane, index = 0, carCount = 1) {
  const grid = startingGridWorldOffset(index, carCount);
  const limit = ROAD_HALF_WIDTH - CAR_SIZE_WORLD.x / 2 - 0.175;
  return clamp(lane, Math.max(-1, (-limit - grid.x) / LANE_TO_WORLD), Math.min(1, (limit - grid.x) / LANE_TO_WORLD));
}

export function carPositionToWorld(car, index = 0, carCount = 1) {
  if (car.worldPosition) return { ...car.worldPosition };
  const grid = startingGridWorldOffset(index, carCount);
  return {
    x: grid.x + clampCarLane(car.lane ?? 0, index, carCount) * LANE_TO_WORLD,
    y: CAR_SIZE_WORLD.y / 2,
    z: grid.z * Math.max(0, 1 - car.distance / GRID_FADE_DISTANCE) - car.distance * DISTANCE_TO_WORLD,
  };
}

// Invert the fading grid offset when collision resolution corrects a position.
export function worldPositionToCar(position, index = 0, carCount = 1) {
  const grid = startingGridWorldOffset(index, carCount);
  const progress = -position.z;
  const distance = progress < GRID_FADE_DISTANCE * DISTANCE_TO_WORLD
    ? (progress + grid.z) / (DISTANCE_TO_WORLD + grid.z / GRID_FADE_DISTANCE)
    : progress / DISTANCE_TO_WORLD;
  return {
    lane: clampCarLane((position.x - grid.x) / LANE_TO_WORLD, index, carCount),
    distance: clamp(distance, 0, TRACK_LENGTH_METERS),
  };
}

export function obstaclePositionToWorld(obstacle) {
  return {
    x: obstacle.lane * LANE_TO_WORLD,
    y: 0.55,
    z: -obstacle.distance * DISTANCE_TO_WORLD,
  };
}

export function obstacleSizeToWorld(obstacle) {
  return {
    x: obstacle.width * LANE_TO_WORLD,
    y: 1,
    z: obstacle.length * DISTANCE_TO_WORLD,
  };
}
