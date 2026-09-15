export const TRACK_LENGTH_METERS = 500;
export const DISTANCE_TO_WORLD = 0.22;
export const LANE_TO_WORLD = 3.3;
export const ROAD_HALF_WIDTH = 6;
export const ROAD_WORLD_LENGTH = TRACK_LENGTH_METERS * DISTANCE_TO_WORLD;

export const CAR_SIZE_WORLD = Object.freeze({ x: 1.5, y: 0.72, z: 1.05 });
export const CAR_FRONT_AXLE_OFFSET_WORLD = CAR_SIZE_WORLD.z * 0.32;

const GRID_COLUMN_OFFSET = 1.35;
const GRID_ROW_OFFSET = 1.2;

export const TRACK_OBSTACLES = Object.freeze([
  Object.freeze({
    id: "left-barrier",
    label: "Left lane barrier",
    distance: 115,
    lane: -0.62,
    width: 0.34,
    length: 6,
    color: "#f7c948",
  }),
  Object.freeze({
    id: "center-barrier",
    label: "Center lane barrier",
    distance: 250,
    lane: 0,
    width: 0.34,
    length: 6,
    color: "#ff5a36",
  }),
  Object.freeze({
    id: "right-barrier",
    label: "Right lane barrier",
    distance: 385,
    lane: 0.62,
    width: 0.34,
    length: 6,
    color: "#f7c948",
  }),
]);

export function startingGridWorldOffset(index, carCount) {
  if (carCount <= 1) return { x: 0, z: 0 };
  return {
    x: index % 2 === 0 ? -GRID_COLUMN_OFFSET : GRID_COLUMN_OFFSET,
    z: Math.floor(index / 2) * GRID_ROW_OFFSET,
  };
}

export function carPositionToWorld(car, index, carCount) {
  const grid = startingGridWorldOffset(index, carCount);
  return {
    x: grid.x + car.lane * LANE_TO_WORLD,
    y: CAR_SIZE_WORLD.y / 2 + 0.1,
    z: grid.z - car.distance * DISTANCE_TO_WORLD,
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
