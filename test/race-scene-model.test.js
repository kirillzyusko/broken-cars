import assert from "node:assert/strict";
import test from "node:test";
import {
  carWorldTransform,
  raceCarsFromRoom,
  smoothingFactor,
} from "../src/race-scene-model.js";

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
        car: { color: "#ff0000", distance: 12, speed: 4, lane: 0, rank: null },
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
});

test("frame interpolation is stable across different update rates", () => {
  assert.ok(smoothingFactor(1 / 30) > smoothingFactor(1 / 120));
  assert.equal(smoothingFactor(0), 0);
  assert.ok(smoothingFactor(1) < 1);
});
