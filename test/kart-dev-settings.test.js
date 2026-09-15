import assert from "node:assert/strict";
import test from "node:test";
import { applyKartSettings, DEFAULT_KART_SETTINGS } from "../src/kart-dev-settings.js";
import { stepKart, DRIVING_STEP } from "../shared/kart-driving.js";
import { resetDriving } from "../shared/track-world.js";

test("dev settings drive the real part IDs and explicit fault variants", () => {
  const car = { heat: 0 };
  resetDriving(car);
  applyKartSettings(car, { ...DEFAULT_KART_SETTINGS, wheels: "square_wheels", engine: "backwards_engine", steering: "left", power: "weak" });
  assert.deepEqual(car.defectIds, ["square_wheels", "backwards_engine", "one_way_steering", "bad_engine_power"]);
  assert.equal(car.oneWayTurn, "left");
  assert.equal(car.enginePowerIssue, "weak");
  // Test reverse drive separately: weak power plus square-tire drag can stall.
  applyKartSettings(car, { ...DEFAULT_KART_SETTINGS, engine: "backwards_engine", steering: "left" });
  stepKart(car, { accelerate: true, right: true }, DRIVING_STEP);
  assert.equal(car.steeringAngle, 0);
  assert.ok(car.velocityZ > 0, "backwards engine must affect the shared driving code");
});

test("restoring parts clears latched throttle and heat without resetting position", () => {
  const car = { heat: 0.9, acceleratorStuck: true };
  resetDriving(car);
  const position = car.worldPosition;
  applyKartSettings(car, { ...DEFAULT_KART_SETTINGS, faults: ["no_cooling", "stuck_accelerator"], engine: "no_engine" });
  assert.equal(car.heat, 0.9);
  assert.equal(car.acceleratorStuck, true);
  applyKartSettings(car, DEFAULT_KART_SETTINGS);
  assert.deepEqual(car.defectIds, []);
  assert.equal(car.heat, 0);
  assert.equal(car.acceleratorStuck, false);
  assert.equal(car.worldPosition, position);
  stepKart(car, {}, DRIVING_STEP);
  assert.equal(car.speed, 0);
});
