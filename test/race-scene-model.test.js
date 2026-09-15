import assert from "node:assert/strict";
import test from "node:test";
import {
  carWorldTransform,
  frontAxleWorldPosition,
  raceCarsFromRoom,
  raceObstaclesFromRoom,
  smoothingFactor,
} from "../src/race-scene-model.js";
import {
  CAR_FRONT_AXLE_OFFSET_WORLD,
  TRACK_OBSTACLES,
} from "../shared/race-config.js";

test("server distance and steering map to forward and lateral box movement", () => {
  const start = carWorldTransform({ distance: 0, lane: 0 }, 0, 1);
  const moved = carWorldTransform({ distance: 100, lane: -0.5 }, 0, 1);

  assert.equal(start.x, 0);
  assert.equal(start.z, 0);
  assert.ok(moved.x < start.x);
  assert.ok(moved.z < start.z);
});

test("multiple synchronized cars occupy visible starting-grid positions", () => {
  const room = {
    players: [
      {
        id: "one",
        name: "Driver 1",
        car: {
          color: "#ff0000",
          distance: 12,
          speed: 4,
          velocityX: -1.5,
          velocityZ: 3.7,
          lane: 0,
          heading: -8,
          steeringAngle: -12,
          angularVelocity: 18,
          massKg: 1_000,
          rank: null,
        },
      },
      {
        id: "two",
        name: "Driver 2",
        car: { color: "#00ff00", distance: 12, speed: 4, lane: 0, rank: null },
      },
    ],
  };
  const cars = raceCarsFromRoom(room, "two");

  assert.equal(cars.length, 2);
  assert.notEqual(cars[0].position.x, cars[1].position.x);
  assert.equal(cars[1].isCurrent, true);
  assert.equal(cars[0].distance, cars[1].distance);
  assert.equal(cars[0].heading, -8);
  assert.equal(cars[0].steeringAngle, -12);
  assert.equal(cars[0].velocityX, -1.5);
  assert.equal(cars[0].velocityZ, 3.7);
  assert.equal(cars[0].angularVelocity, 18);
  assert.equal(cars[0].massKg, 1_000);
});

test("visual yaw is anchored at the front axle instead of the body centre", () => {
  const bodyCentre = { x: 2, y: 0.5, z: -10 };
  const straightAxle = frontAxleWorldPosition(bodyCentre, 0);
  const turnedAxle = frontAxleWorldPosition(bodyCentre, 24);

  assert.equal(straightAxle.x, bodyCentre.x);
  assert.equal(straightAxle.z, bodyCentre.z - CAR_FRONT_AXLE_OFFSET_WORLD);
  assert.ok(turnedAxle.x < bodyCentre.x);
  assert.ok(Math.abs(Math.hypot(
    bodyCentre.x - turnedAxle.x,
    bodyCentre.z - turnedAxle.z,
  ) - CAR_FRONT_AXLE_OFFSET_WORLD) < 1e-10);
});

test("server obstacles map to visible PlayCanvas transforms", () => {
  const obstacles = raceObstaclesFromRoom({ obstacles: TRACK_OBSTACLES });

  assert.equal(obstacles.length, 3);
  assert.ok(obstacles[0].position.x < 0);
  assert.ok(obstacles[1].position.z < obstacles[0].position.z);
  assert.ok(obstacles.every((obstacle) => obstacle.size.x > 0 && obstacle.size.z > 0));
});

test("frame interpolation is stable across different update rates", () => {
  assert.ok(smoothingFactor(1 / 30) > smoothingFactor(1 / 120));
  assert.equal(smoothingFactor(0), 0);
  assert.ok(smoothingFactor(1) < 1);
});
