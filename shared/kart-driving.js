import { recoverDriving } from "./track-world.js";
export const STANDARD_MAX_SPEED_MPS = 28;
export const DRIVING_STEP = 1 / 120;
// Our no-drift tuning, informed by Nintendo's driving guides. These are not
// extracted Mario Kart constants; see docs/driving-feel.md for the tradeoffs.
export const DRIVING_TUNING = Object.freeze({
  acceleration: 20,
  steeringResponseSlow: 14,
  steeringResponseFast: 10,
  steeringReturn: 26,
  steeringReverse: 30,
  minimumTurnRadius: 2.6,
  speedTurnRadius: 0.014,
  maximumYawRate: 170,
  turnResistance: 7,
  offRoadSpeed: 0.55,
  offRoadDeceleration: 20,
});

function accelerationFactor(ratio) {
  if (ratio < 0.5) return 1 - ratio * 0.36;
  if (ratio < 0.8) return 0.82 - (ratio - 0.5) * 1.4;
  return Math.max(0.14, 0.4 - (ratio - 0.8) * 1.3);
}
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const moveToward = (value, target, delta) => value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);

// World metres, clockwise heading in degrees, forward along negative Z.
// No vertical velocity, jump, drift input or automatic track steering.
export function stepKart(car, controls, dt, raceElapsedMs = 0, world = null) {
  const previous = { ...car.worldPosition };
  const defects = new Set(car.defectIds);
  let acceleratePressed = controls.accelerate;
  let brakePressed = controls.brake;
  if (defects.has("swapped_pedals")) {
    [acceleratePressed, brakePressed] = [brakePressed, acceleratePressed];
  }
  if (defects.has("stuck_accelerator") && acceleratePressed) {
    car.acceleratorStuck = true;
  }
  const wantsAcceleration = acceleratePressed || car.acceleratorStuck;

  let steerInput = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  if (defects.has("reversed_steering")) steerInput *= -1;
  if (
    defects.has("one_way_steering")
    && ((car.oneWayTurn === "left" && steerInput > 0)
      || (car.oneWayTurn === "right" && steerInput < 0))
  ) {
    steerInput = 0;
  }
  const steering = defects.has("no_steering") ? 0 : steerInput;

  let maxSpeed = STANDARD_MAX_SPEED_MPS;
  let engineAcceleration = DRIVING_TUNING.acceleration;
  let tireGrip = 30;
  let rollingDrag = wantsAcceleration
    ? 0.35 + 0.0012 * car.speed ** 2
    : 2.4 + 0.025 * car.speed;

  if (defects.has("no_engine")) engineAcceleration = 0;
  if (defects.has("no_wheels")) {
    engineAcceleration *= 0.22;
    maxSpeed = 8;
    tireGrip = 0.45;
    rollingDrag = 5.5;
  }
  if (defects.has("square_wheels")) {
    engineAcceleration *= 0.72;
    maxSpeed = Math.min(maxSpeed, 23);
    rollingDrag += 1.8 + Math.abs(Math.sin(raceElapsedMs / 115)) * 2.2;
  }
  if (defects.has("loose_wheel")) maxSpeed *= 0.86;
  if (defects.has("sideways_wheels")) {
    engineAcceleration *= 0.34;
    maxSpeed = Math.min(maxSpeed, 12);
    tireGrip = 0.8;
    rollingDrag += 4.5;
  }
  if (defects.has("bad_engine_power")) {
    if (car.enginePowerIssue === "weak") {
      engineAcceleration *= 0.32;
      maxSpeed = Math.min(maxSpeed, 17);
    } else {
      engineAcceleration *= 2.15;
      maxSpeed = Math.max(maxSpeed, 42);
    }
  }
  if (defects.has("no_grip")) {
    engineAcceleration *= 0.82;
    tireGrip = 0.65;
    rollingDrag *= 0.45;
  }
  if (defects.has("no_seatbelt") && steering !== 0 && car.speed > 18) {
    engineAcceleration *= 0.28;
  }

  if (defects.has("no_cooling")) {
    const heatDelta = wantsAcceleration ? 0.17 * dt : -0.1 * dt;
    car.heat = clamp(car.heat + heatDelta, 0, 1);
    if (car.heat > 0.65) {
      engineAcceleration *= Math.max(0.08, 1 - (car.heat - 0.65) * 2.4);
    }
  } else {
    car.heat = Math.max(0, car.heat - 0.25 * dt);
  }


  if (car.offRoad) { maxSpeed *= DRIVING_TUNING.offRoadSpeed; engineAcceleration *= 0.8; rollingDrag += 2; }
  const speedRatio = clamp(car.speed / maxSpeed, 0, 1);
  const radians = car.heading * Math.PI / 180;
  const forwardX = Math.sin(radians), forwardZ = -Math.cos(radians);
  let forwardSpeed = car.velocityX * forwardX + car.velocityZ * forwardZ;
  let lateralSpeed = car.velocityX * -forwardZ + car.velocityZ * forwardX;
  const canBrake = !defects.has("no_brakes");
  car.reverseHeld = brakePressed && !wantsAcceleration && Math.abs(forwardSpeed) < 0.2
    ? (car.reverseHeld ?? 0) + dt : forwardSpeed < -0.2 && brakePressed ? car.reverseHeld : 0;
  const reversing = brakePressed && !wantsAcceleration && car.reverseHeld >= 0.25 && canBrake;
  const braking = canBrake && (controls.stop || (brakePressed && !reversing));
  car.throttle = wantsAcceleration || reversing ? 1 : 0;
  car.braking = !!braking;
  if (braking) forwardSpeed = moveToward(forwardSpeed, 0, 28 * dt);
  else if (reversing) forwardSpeed = Math.max(-6, forwardSpeed - engineAcceleration * 0.55 * dt);
  else if (wantsAcceleration) {
    const direction = defects.has("backwards_engine") ? -1 : 1;
    forwardSpeed += direction * engineAcceleration * accelerationFactor(speedRatio) * dt;
  }
  const steeringLimit = 38 - 12 * speedRatio;
  const reversingSteer = steering * car.steeringAngle < 0;
  const response = steering === 0 ? DRIVING_TUNING.steeringReturn
    : reversingSteer ? DRIVING_TUNING.steeringReverse
    : DRIVING_TUNING.steeringResponseSlow + (DRIVING_TUNING.steeringResponseFast - DRIVING_TUNING.steeringResponseSlow) * speedRatio;
  car.steeringAngle += (steering * steeringLimit - car.steeringAngle) * (1 - Math.exp(-response * dt));
  const steeringStrength = Math.min(1, Math.abs(car.steeringAngle) / steeringLimit) ** 1.25;
  // Turning costs some speed without creating a sideways slide. Lifting or
  // braking reduces the radius, giving tight corners a clear speed tradeoff.
  const turnResistance = DRIVING_TUNING.turnResistance * steeringStrength ** 2 * speedRatio ** 2;
  forwardSpeed = moveToward(forwardSpeed, 0, (rollingDrag + turnResistance) * dt);
  if (car.offRoad && Math.abs(forwardSpeed) > maxSpeed) {
    forwardSpeed = moveToward(forwardSpeed, Math.sign(forwardSpeed) * maxSpeed, DRIVING_TUNING.offRoadDeceleration * dt);
  } else {
    forwardSpeed = clamp(forwardSpeed, -maxSpeed, maxSpeed);
  }
  // Scale the turn rate by steering input AFTER computing the full-lock rate.
  // The old bicycle-rate clamp gave tiny inputs nearly the same rate as full lock.
  const turnRadius = DRIVING_TUNING.minimumTurnRadius + DRIVING_TUNING.speedTurnRadius * forwardSpeed ** 2;
  const fullYawRate = Math.min(Math.abs(forwardSpeed) / turnRadius * 180 / Math.PI, DRIVING_TUNING.maximumYawRate);
  const yawRate = fullYawRate * steeringStrength;
  car.heading += (Math.sign(car.steeringAngle) * Math.sign(forwardSpeed) * yawRate + car.angularVelocity) * dt;
  car.angularVelocity *= Math.exp(-8 * dt);
  lateralSpeed *= Math.exp(-tireGrip * dt);
  if (Math.abs(lateralSpeed) < 1e-4) lateralSpeed = 0;
  if (defects.has("loose_wheel")) car.heading += Math.sin(raceElapsedMs / 180) * car.speed * 0.15 * dt;
  if (defects.has("no_grip")) lateralSpeed += steering * car.speed * 0.3 * dt;
  if (defects.has("bad_engine_power") && car.enginePowerIssue === "overpowered" && wantsAcceleration) car.heading += Math.sin(raceElapsedMs / 95) * car.speed * 0.25 * dt;
  const angle = car.heading * Math.PI / 180;
  car.velocityX = Math.sin(angle) * forwardSpeed + Math.cos(angle) * lateralSpeed;
  car.velocityZ = -Math.cos(angle) * forwardSpeed + Math.sin(angle) * lateralSpeed;
  car.speed = Math.hypot(car.velocityX, car.velocityZ);
  const desired = { ...previous, x: previous.x + car.velocityX * dt, z: previous.z + car.velocityZ * dt };
  const result = world?.move(previous, desired, car.heading);
  if (result?.recover) { recoverDriving(car); return; }
  car.worldPosition = result?.position ?? desired;
  car.offRoad = result?.offRoad ?? false;
  if (result?.hit) {
    const sourceNormal = result.hit.normal;
    const length = Math.hypot(sourceNormal.x, sourceNormal.z);
    const normal = { x: sourceNormal.x / length, y: 0, z: sourceNormal.z / length };
    result.hit.normal = normal;
    const into = car.velocityX * normal.x + car.velocityZ * normal.z;
    result.hit.impactSpeed = Math.max(0, -into);
    if (into < 0) {
      car.velocityX -= normal.x * into;
      car.velocityZ -= normal.z * into;
      car.velocityX *= 0.5; car.velocityZ *= 0.5;
      car.speed = Math.hypot(car.velocityX, car.velocityZ);
    }
  }
  return result?.hit;
}
