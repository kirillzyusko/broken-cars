import assert from "node:assert/strict";
import test from "node:test";
import { frontAxleWorldPosition, raceObstaclesFromRoom, carWorldTransform, raceCarsFromRoom, sampleTrack, ROAD_HALF_WIDTH, ROAD_WORLD_LENGTH, smoothingFactor } from "../src/race-scene-model.js";

import { CAR_FRONT_AXLE_OFFSET_WORLD, CAR_SIZE_WORLD, TRACK_OBSTACLES, carPositionToWorld, worldPositionToCar } from "../shared/race-config.js";

test("the complete 500m race follows a closed, curved lap", () => {
  const start = sampleTrack(0);
  const finish = sampleTrack(ROAD_WORLD_LENGTH);
  assert.ok(Math.hypot(start.x, start.z) < 0.001);
  assert.deepEqual(start, finish);
  assert.ok(Math.abs(ROAD_WORLD_LENGTH - 500) < 0.02);
  const samples = Array.from({ length: 500 }, (_, i) => sampleTrack(i));
  assert.ok(Math.max(...samples.map((p) => p.x)) - Math.min(...samples.map((p) => p.x)) > 40);
  for (let i = 1; i < samples.length; i++) {
    assert.ok(Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z) <= 1.001);
    assert.ok(Math.abs(samples[i].y) < 0.001);
    assert.ok(Math.abs(Math.hypot(samples[i].forward.x, samples[i].forward.z) - 1) < 1e-6);
  }
});

test("grid starts behind the gantry and racers reach the finish at the same server distance", () => {
  for (let i = 0; i < 8; i++) {
    const start = carWorldTransform({ distance: 0, lane: 0 }, i, 8);
    assert.ok(start.z > 3);
    const end = carWorldTransform({ distance: 500, lane: 0 }, i, 8);
    assert.ok(Math.hypot(end.x, end.z) < 1);
  }
});

test("steering stays within road width through the corners", () => {
  for (let distance = 40; distance < 500; distance += 1) {
    const center = sampleTrack(distance * ROAD_WORLD_LENGTH / 500);
    for (const lane of [-1, 0, 1]) {
      const p = carWorldTransform({ distance, lane }, 0, 2);
      assert.ok(Math.hypot(p.x - center.x, p.z - center.z) <= ROAD_HALF_WIDTH - CAR_SIZE_WORLD.x / 2 - 0.175 + 1e-9);
    }
  }
});

test("multiple synchronized cars occupy distinct grid columns", () => {
  const room = { players: ["one", "two"].map((id) => ({ id, name: id, car: { color: "#ff0000", distance: 12, speed: 4, lane: 0, rank: null } })) };
  const cars = raceCarsFromRoom(room, "two");
  assert.equal(cars.length, 2);
  assert.notEqual(cars[0].position.x, cars[1].position.x);
  assert.equal(cars[1].isCurrent, true);
  assert.equal(cars[0].distance, cars[1].distance);
});

test("visual defect IDs follow the latest server repair snapshot", () => {
  const car = { distance: 0, speed: 0, defectIds: ["no_engine", "square_wheels"] };
  const room = { players: [{ id: "one", name: "One", car }] };
  const before = raceCarsFromRoom(room)[0];
  assert.deepEqual(before.defectIds, ["no_engine", "square_wheels"]);
  assert.notEqual(before.defectIds, car.defectIds);
  car.defectIds = [];
  assert.deepEqual(raceCarsFromRoom(room)[0].defectIds, []);
  delete car.defectIds;
  car.defects = [{ id: "no_steering" }];
  assert.deepEqual(raceCarsFromRoom(room)[0].defectIds, ["no_steering"]);
});

test("frame interpolation is stable across different update rates", () => {
  assert.ok(smoothingFactor(1 / 30) > smoothingFactor(1 / 120));
  assert.equal(smoothingFactor(0), 0);
  assert.ok(smoothingFactor(1) < 1);
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


test("the map contains no prototype barrier visuals", () => {
  assert.deepEqual(raceObstaclesFromRoom({ obstacles: TRACK_OBSTACLES }), []);
});

test("collision correction round-trips all grid rows across the grid fade and finish", () => {
  for (let index = 0; index < 8; index++) {
    for (const distance of [0, 12, 39.99, 40, 40.01, 100, 500]) {
      const car = { distance, lane: 0.25 };
      const physics = carPositionToWorld(car, index, 8);
      const corrected = worldPositionToCar(physics, index, 8);
      assert.ok(Math.abs(corrected.distance - distance) < 1e-9);
      assert.ok(Math.abs(corrected.lane - car.lane) < 1e-9);
      const pose = carWorldTransform(car, index, 8);
      const center = sampleTrack(-physics.z);
      assert.ok(Math.abs(Math.hypot(pose.x - center.x, pose.z - center.z) - Math.abs(physics.x)) < 1e-9);
    }
  }
});

test("steering and collision yaw turn the car relative to the circuit tangent", () => {
  for (const distance of [70, 200, 380]) {
    const straight = carWorldTransform({ distance, lane: 0, heading: 0 });
    const turned = carWorldTransform({ distance, lane: 0, heading: 24 });
    assert.equal(turned.yaw, straight.yaw - 24);
    assert.equal(turned.x, straight.x);
    assert.equal(turned.z, straight.z);
    const axle = frontAxleWorldPosition(turned, turned.yaw);
    const radians = turned.yaw * Math.PI / 180;
    assert.ok(Math.abs(axle.x + Math.sin(radians) * CAR_FRONT_AXLE_OFFSET_WORLD - turned.x) < 1e-9);
    assert.ok(Math.abs(axle.z + Math.cos(radians) * CAR_FRONT_AXLE_OFFSET_WORLD - turned.z) < 1e-9);
  }
});

test("server lane bounds keep every grid column's car body within the road", () => {
  for (let index = 0; index < 8; index++) {
    for (const lane of [-2, -1, 0, 1, 2]) {
      const pose = carPositionToWorld({ distance: 100, lane }, index, 8);
      assert.ok(Math.abs(pose.x) + CAR_SIZE_WORLD.x / 2 < ROAD_HALF_WIDTH);
      const corrected = worldPositionToCar({ x: lane * 10, z: -100 }, index, 8);
      assert.ok(Math.abs(carPositionToWorld(corrected, index, 8).x) + CAR_SIZE_WORLD.x / 2 < ROAD_HALF_WIDTH);
    }
  }
});
