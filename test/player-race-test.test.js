import test from "node:test";
import assert from "node:assert/strict";
import { createPlayerRaceTest } from "../src/player-race-test-model.js";

const gas = { accelerate: true, brake: false, left: false, right: false, stop: false };
const car = (model, now = 6000) => model.snapshot(now).players[0].car;

test("player test waits for the track and countdown before driving", () => {
  const model = createPlayerRaceTest(null);
  model.setControls(gas);
  const position = car(model).worldPosition;
  model.step(1, 1000);
  assert.deepEqual(car(model).worldPosition, position);
  model.start(1000);
  model.step(1, 5999);
  assert.equal(model.snapshot(5999).phase, "countdown");
  assert.deepEqual(car(model).worldPosition, position);
  for (let i = 0; i < 60; i++) model.step(1 / 60, 6000 + i * 1000 / 60);
  assert.equal(model.snapshot(7000).phase, "racing");
  assert.ok(car(model).speed > 0);
  assert.notDeepEqual(car(model).worldPosition, position);
});

test("player test applies faults to physics and publishes them for the player messages", () => {
  const model = createPlayerRaceTest(null);
  model.reset("no_engine");
  model.start(0);
  model.setControls(gas);
  for (let i = 0; i < 120; i++) model.step(1 / 60, 5000 + i * 1000 / 60);
  assert.equal(car(model).speed, 0);
  assert.deepEqual(car(model).defects, [{ id: "no_engine" }]);
  assert.deepEqual(car(model).defectIds, ["no_engine"]);
});

test("finishing stops the kart and reset clears the result, faults and held controls", () => {
  const model = createPlayerRaceTest(null);
  model.start(0);
  model.setControls(gas);
  model.step(0.1, 5000);
  const before = car(model);
  model.finish();
  model.setControls(gas);
  model.step(0.1, 6000);
  assert.equal(car(model).rank, 1);
  assert.equal(car(model).speed, 0);
  assert.deepEqual(car(model).worldPosition, before.worldPosition);
  model.reset();
  model.start(6000);
  model.step(0.1, 11000);
  assert.equal(car(model).speed, 0);
  assert.equal(car(model).finishedAtMs, null);
  assert.equal(car(model).rank, null);
  assert.deepEqual(car(model).defects, []);
  assert.ok(car(model).resetVersion > before.resetVersion);
  assert.notDeepEqual(car(model).worldPosition, before.worldPosition);
});
