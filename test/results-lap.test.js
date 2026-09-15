import assert from "node:assert/strict";
import test from "node:test";
import { resultsLapPose } from "../src/results-lap.js";
import { ROAD_WORLD_LENGTH } from "../shared/race-config.js";

test("results karts keep moving on a looping route with separate positions", () => {
  const start = resultsLapPose(500, 0, 0);
  const moved = resultsLapPose(500, 0, 1);
  assert.ok(Math.hypot(moved.x - start.x, moved.z - start.z) > 5);
  const loop = resultsLapPose(500, 0, ROAD_WORLD_LENGTH / 7);
  assert.ok(Math.hypot(loop.x - start.x, loop.z - start.z) < 1e-6);
  const other = resultsLapPose(500, 1, 0);
  assert.ok(Math.hypot(other.x - start.x, other.z - start.z) > 2);
  for (let i = 0; i < 100; i++) {
    const pose = resultsLapPose(500, 3, i);
    assert.ok([pose.x, pose.y, pose.z, pose.yaw].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(pose.forward.x, pose.forward.z) - 1) < 1e-6);
  }
});
