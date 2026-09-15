import { DRIVING_STEP, stepKart } from "../shared/kart-driving.js";
import { resetDriving, updateLapProgress } from "../shared/track-world.js";
import { TRACK_LENGTH_METERS } from "../shared/race-config.js";

export const TEST_PLAYER_ID = "test-driver";
const EMPTY_CONTROLS = { accelerate: false, brake: false, left: false, right: false, stop: false };

export function createPlayerRaceTest(world) {
  let car;
  let controls = { ...EMPTY_CONTROLS };
  let startsAt = null;
  let accumulator = 0;
  let elapsedMs = 0;

  function reset(defectId = "") {
    const resetVersion = car?.resetVersion ?? 0;
    car = {
      name: "Test kart", color: "#2f6df5", resetVersion,
      defectIds: defectId ? [defectId] : [],
      defects: defectId ? [{ id: defectId }] : [],
      heat: 0, acceleratorStuck: false, oneWayTurn: "left", enginePowerIssue: "weak",
      finishedAtMs: null, rank: null, collisionCount: 0, lastCollision: null,
    };
    resetDriving(car);
    controls = { ...EMPTY_CONTROLS };
    startsAt = null;
    accumulator = 0;
    elapsedMs = 0;
  }

  function finish() {
    car.finishedAtMs = elapsedMs;
    car.rank = 1;
    car.speed = car.velocityX = car.velocityZ = car.angularVelocity = 0;
    car.throttle = 0;
    car.braking = false;
    controls = { ...EMPTY_CONTROLS };
  }

  reset();
  return {
    reset,
    start(now) { startsAt = now + 5000; },
    setControls(next) { controls = { ...next }; },
    finish,
    step(deltaSeconds, now) {
      if (startsAt === null || now < startsAt || car.finishedAtMs !== null) {
        accumulator = 0;
        car.throttle = car.finishedAtMs === null && controls.accelerate ? 1 : 0;
        return;
      }
      accumulator += Math.min(deltaSeconds, 0.1);
      while (accumulator + 1e-9 >= DRIVING_STEP) {
        const previous = { ...car.worldPosition };
        const resetVersion = car.resetVersion;
        stepKart(car, controls, DRIVING_STEP, elapsedMs, world);
        if (resetVersion === car.resetVersion) updateLapProgress(car, previous);
        accumulator -= DRIVING_STEP;
        elapsedMs += DRIVING_STEP * 1000;
        if (car.distance >= TRACK_LENGTH_METERS) { finish(); break; }
      }
    },
    snapshot(now) {
      return {
        id: "LOCAL-TEST", phase: startsAt === null || now < startsAt ? "countdown" : "racing",
        roundNumber: 1, startsAt, serverNow: now, receivedAt: now,
        trackLength: TRACK_LENGTH_METERS, defectsEnabled: true, obstacles: [],
        players: [{ id: TEST_PLAYER_ID, name: "Test driver", color: "blue", named: true, connected: true,
          car: { ...car, worldPosition: { ...car.worldPosition } } }],
      };
    },
  };
}
