import assert from "node:assert/strict";
import test from "node:test";
import { carWorldTransform, raceCarsFromRoom, sampleTrack, ROAD_HALF_WIDTH, ROAD_WORLD_LENGTH, smoothingFactor } from "../src/race-scene-model.js";

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
      assert.ok(Math.hypot(p.x - center.x, p.z - center.z) <= ROAD_HALF_WIDTH - 0.79);
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

test("frame interpolation is stable across different update rates", () => {
  assert.ok(smoothingFactor(1 / 30) > smoothingFactor(1 / 120));
  assert.equal(smoothingFactor(0), 0);
  assert.ok(smoothingFactor(1) < 1);
});
