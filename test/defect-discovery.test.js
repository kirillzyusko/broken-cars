import assert from "node:assert/strict";
import test from "node:test";
import { discoverableDefectIds } from "../shared/defect-discovery.js";
import { detectShouts } from "../src/lib/shouts.js";

test("all remaining defects are visible together, without a legacy active selection", () => {
  assert.deepEqual(discoverableDefectIds({ activeDefectId: "no_engine", defectIds: ["no_engine", "no_brakes", "no_engine"] }), ["no_engine", "no_brakes"]);
  assert.deepEqual(discoverableDefectIds({ defects: [{ id: "no_grip" }] }), ["no_grip"]);
  assert.deepEqual(discoverableDefectIds(null), []);
});
test("hints can discover several faults when their symptoms occur together", () => {
  const context = { car: { defectIds: ["no_engine", "no_brakes"], speed: 10 }, controls: { accelerate: true, brake: true }, timers: new Map(), alreadyShouted: new Set() };
  assert.deepEqual(detectShouts({ ...context, now: 0 }), []);
  assert.deepEqual(detectShouts({ ...context, now: 4000 }), ["no_engine", "no_brakes"]);
  context.alreadyShouted.add("no_engine");
  assert.deepEqual(detectShouts({ ...context, now: 5000 }), ["no_brakes"]);
});
