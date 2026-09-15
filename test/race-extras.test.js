import test from "node:test";
import assert from "node:assert/strict";
import { updateRaceInputs, resolveRaceStart, mechanicFeedback, raceAward, recordLocalImpact } from "../shared/race-extras.js";
import { resetDriving } from "../shared/track-world.js";
import { DRIVING_STEP, stepKart } from "../shared/kart-driving.js";
import { createPlayerRaceTest, TEST_PLAYER_ID } from "../src/player-race-test-model.js";

function kart() { const car = { defectIds: [] }; resetDriving(car); return car; }
const gas = { accelerate: true };

test("timed launches reward the last press, stall early holds briefly and reset each race", () => {
  const boost = kart(), normal = kart(), early = kart();
  updateRaceInputs(boost, gas, 4700, 5000);
  updateRaceInputs(early, gas, 1000, 5000);
  for (const car of [boost, normal, early]) resolveRaceStart(car, gas, 5000);
  assert.equal(boost.startResult, "boost");
  assert.equal(early.startResult, "stall");
  assert.equal(normal.startResult, null);
  for (let i = 0; i < 60; i++) for (const car of [boost, normal, early]) stepKart(car, gas, DRIVING_STEP);
  assert.ok(boost.speed > normal.speed * 1.5);
  assert.equal(early.speed, 0);
  for (let i = 0; i < 120; i++) stepKart(early, gas, DRIVING_STEP);
  assert.ok(early.speed > 0, "stall must recover while gas stays held");
  resetDriving(boost);
  assert.equal(boost.launchBoostRemaining, 0);
  assert.equal(boost.launchResolved, false);
  updateRaceInputs(boost, gas, 1000, 5000);
  updateRaceInputs(boost, {}, 4300, 5000);
  updateRaceInputs(boost, gas, 4700, 5000);
  resolveRaceStart(boost, gas, 5000);
  assert.equal(boost.startResult, "boost");
  boost.defectIds = ["no_engine"];
  stepKart(boost, gas, DRIVING_STEP);
  assert.equal(boost.speed, 0, "launch bonus cannot repair a missing engine");
});

test("horn needs a new press and obeys its cooldown", () => {
  const car = kart();
  updateRaceInputs(car, { horn: true }, 100, 5000);
  updateRaceInputs(car, { horn: true }, 1800, 5000);
  assert.equal(car.hornSerial, 1);
  updateRaceInputs(car, {}, 1801, 5000);
  updateRaceInputs(car, { horn: true }, 1802, 5000);
  assert.equal(car.hornSerial, 2);
  updateRaceInputs(car, {}, 1803, 5000);
  updateRaceInputs(car, { horn: true }, 1804, 5000);
  assert.equal(car.hornSerial, 2);
});

test("feedback reports actual relative changes, repairs and remaining faults", () => {
  assert.equal(mechanicFeedback({ speed: 2, steering: 1 }, { speed: 2.1, steering: 0.9 }, ["Brakes"], 2), "Speed +5% · Steering -10% · Repaired: Brakes · 2 faults remain");
  assert.match(mechanicFeedback({}, {}, [], 0), /All faults fixed/);
});

test("awards use real stats and never invent an achievement", () => {
  assert.equal(raceAward([{ id: "a", car: { rank: 1, spawnIndex: 0 } }]), null);
  assert.equal(raceAward([{ id: "a", car: { collisionCount: 3 } }, { id: "b", car: { collisionCount: 7 } }]).playerId, "b");
  assert.match(raceAward([{ id: "a", car: { reverseMeters: 4.9 } }]).detail, /4m/);
  assert.match(raceAward([{ id: "a", car: { rank: 1, spawnIndex: 2 } }]).detail, /Gained 2 places/);
});

test("reverse stats count actual travel and wall contacts cannot inflate them", () => {
  const car = kart();
  for (let i = 0; i < 240; i++) stepKart(car, { brake: true }, DRIVING_STEP);
  assert.ok(car.reverseMeters > 1);
  const distance = car.reverseMeters;
  stepKart(car, { brake: true }, DRIVING_STEP, 0, { move: (previous) => ({ position: previous }) });
  assert.equal(car.reverseMeters, distance);
  recordLocalImpact(car, { impactSpeed: 5 }, 0);
  recordLocalImpact(car, { impactSpeed: 5 }, 100);
  assert.equal(car.collisionCount, 1);
  recordLocalImpact(car, { impactSpeed: 5 }, 500);
  assert.equal(car.collisionCount, 2);
});

test("player test uses the same launch and horn rules", () => {
  const model = createPlayerRaceTest();
  model.start(1000);
  model.setControls({ accelerate: true, horn: true }, 5700);
  model.step(0.1, 6000);
  const car = model.snapshot(6000).players.find((p) => p.id === TEST_PLAYER_ID).car;
  assert.equal(car.startResult, "boost");
  assert.equal(car.hornSerial, 1);
  assert.ok(car.speed > 0);
});
