import assert from "node:assert/strict";
import test from "node:test";
import { discoverableDefectId } from "../shared/defect-discovery.js";
import { detectShouts } from "../src/lib/shouts.js";

test("server selection overrides lists and never exposes queued defects", () => {
  const car = {
    activeDefectId: "no_engine",
    defectIds: ["no_brakes", "no_engine"],
    _queuedDefectIds: ["square_wheels"],
  };
  assert.equal(discoverableDefectId(car), "no_engine");
  assert.equal(discoverableDefectId({ ...car, activeDefectId: null }), null);
  assert.equal(discoverableDefectId({ _queuedDefectIds: ["square_wheels"] }), null);
});

test("older snapshots and local tests expose only the first active defect", () => {
  assert.equal(discoverableDefectId({ defectIds: ["no_engine", "no_brakes"] }), "no_engine");
  assert.equal(discoverableDefectId({ defects: [{ id: "no_steering" }, { id: "no_grip" }] }), "no_steering");
  assert.equal(discoverableDefectId({ defectIds: [], defects: [{ id: "no_engine" }] }), null);
  assert.equal(discoverableDefectId(null), null);
});

test("driver hints reveal only the active defect even when other triggers fire", () => {
  const context = {
    car: { activeDefectId: "no_engine", defectIds: ["no_engine", "no_brakes"], speed: 10 },
    controls: { accelerate: true, brake: true },
    timers: new Map(), alreadyShouted: new Set(),
  };
  assert.deepEqual(detectShouts({ ...context, now: 0 }), []);
  assert.deepEqual(detectShouts({ ...context, now: 1000 }), ["no_engine"]);
  context.alreadyShouted.add("no_engine");
  assert.deepEqual(detectShouts({ ...context, now: 2000 }), []);
  context.car.activeDefectId = "no_brakes";
  assert.deepEqual(detectShouts({ ...context, now: 3000 }), []);
  assert.deepEqual(detectShouts({ ...context, now: 4000 }), ["no_brakes"]);
});

test("an undiscovered active fault cannot be skipped for an easier later fault", () => {
  const context = {
    car: { activeDefectId: "no_steering", defectIds: ["no_steering", "no_engine"] },
    controls: { accelerate: true, left: false, right: false },
    timers: new Map(), alreadyShouted: new Set(),
  };
  assert.deepEqual(detectShouts({ ...context, now: 0 }), []);
  assert.deepEqual(detectShouts({ ...context, now: 2000 }), []);
});
