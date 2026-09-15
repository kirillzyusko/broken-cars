import assert from "node:assert/strict";
import test from "node:test";
import { stepKart, DRIVING_STEP, STANDARD_MAX_SPEED_MPS } from "../shared/kart-driving.js";
import { resetDriving, updateLapProgress, sampleTrack, LAP_GATES, carWorldTransform } from "../shared/track-world.js";
import { createGroundedMovement } from "../shared/driving-world.js";
import { CAR_SIZE_WORLD, ROAD_WORLD_LENGTH, TRACK_LENGTH_METERS } from "../shared/race-config.js";
import { getDrivingWorld } from "../server/driving-world.js";
import { GameEngine } from "../server/game-engine.js";
import { startRepairedRace } from "./helpers/repaired-race.js";

function kart() {
  const car = { defectIds: [], heat: 0 };
  resetDriving(car);
  return car;
}
function run(car, controls, seconds, world) {
  for (let i = 0; i < Math.round(seconds / DRIVING_STEP); i++) stepKart(car, controls, DRIVING_STEP, i * DRIVING_STEP * 1000, world);
}

test("free driving can turn a full circle and leave the old lane bounds", () => {
  const car = kart();
  let furthestX = 0;
  for (let i = 0; i < 5 / DRIVING_STEP; i++) {
    stepKart(car, { accelerate: true, right: true }, DRIVING_STEP);
    furthestX = Math.max(furthestX, Math.abs(car.worldPosition.x));
  }
  assert.ok(car.heading > 360);
  assert.ok(furthestX > 3);
  run(car, { accelerate: true }, 0.5);
  const heading = car.heading;
  run(car, { accelerate: true }, 1);
  assert.ok(Math.abs(car.heading - heading) < 0.01);
  const pose = carWorldTransform(car);
  assert.equal(pose.x, car.worldPosition.x);
  assert.equal(pose.z, car.worldPosition.z);
  assert.ok(Math.abs(car.velocityX * pose.forward.z - car.velocityZ * pose.forward.x) < 1e-6);
  assert.equal(car.worldPosition.y, CAR_SIZE_WORLD.y / 2);
});

test("braking stops promptly, holding brake reverses, and Space only stops", () => {
  const car = kart();
  run(car, { accelerate: true }, 3);
  assert.ok(car.speed > STANDARD_MAX_SPEED_MPS * 0.9);
  // Stop sooner at the lower limit, before holding brake engages reverse.
  for (let i = 0; i < 1 / DRIVING_STEP && car.speed >= 0.2; i++) {
    run(car, { brake: true }, DRIVING_STEP);
  }
  assert.ok(car.speed < 0.2);
  run(car, { brake: true }, 1);
  assert.ok(car.velocityZ > 0 && car.speed <= 6);
  const heading = car.heading;
  run(car, { brake: true, right: true }, 0.5);
  assert.ok(car.heading < heading, "steering direction reverses when backing up");
  run(car, { stop: true }, 2);
  assert.equal(car.speed, 0);
  const stopped = { ...car.worldPosition };
  run(car, { stop: true, accelerate: true }, 2);
  assert.deepEqual(car.worldPosition, stopped);
});

test("holding brake reverses from grass across the real curb onto the road", () => {
  const world = getDrivingWorld();
  for (const side of [-1, 1]) {
    const car = kart();
    const ground = world.raycast({ x: side * 4.8, y: 1, z: 8 }, { x: side * 4.8, y: -1, z: 8 }, true);
    car.worldPosition = { x: side * 4.8, y: ground.point.y + CAR_SIZE_WORLD.y / 2, z: 8 };
    car.heading = side * 90;
    run(car, {}, DRIVING_STEP, world);
    assert.equal(car.offRoad, true);
    const version = car.resetVersion;
    run(car, { brake: true }, 2.5, world);
    assert.equal(car.resetVersion, version, "reverse must drive out, not reset the kart");
    assert.ok(Math.abs(car.worldPosition.x) < 3, "reverse must cross the curb onto the road");
    assert.ok(car.velocityX * side < 0, "the kart must move backwards toward the road");
    assert.equal(car.offRoad, false);
    assert.ok(car.speed > 0 && car.speed <= 6);
  }
});

test("world rendering never derives a driving car's position from progress", () => {
  const car = kart();
  car.worldPosition = { x: 80, y: 0.25, z: 45 };
  car.heading = 90;
  const before = carWorldTransform(car);
  car.distance = 300; car.lane = -999;
  assert.deepEqual(carWorldTransform(car), before);
  assert.equal(before.yaw, -90);
  assert.ok(before.forward.x > 0.999);
});

test("a lap needs ordered forward gate crossings; shortcuts and reverse do not finish", () => {
  const car = kart();
  const moveTo = (distance) => {
    const previous = { ...car.worldPosition };
    const pose = sampleTrack(distance);
    car.worldPosition = { x: pose.x, y: CAR_SIZE_WORLD.y / 2, z: pose.z };
    updateLapProgress(car, previous);
  };
  moveTo(-1); moveTo(1);
  assert.equal(car.nextGate, 1);
  moveTo(ROAD_WORLD_LENGTH - 1); moveTo(1);
  assert.equal(car.nextGate, 1);
  assert.ok(car.distance < TRACK_LENGTH_METERS);
  for (let distance = 2; distance < ROAD_WORLD_LENGTH + 1; distance += 0.25) moveTo(distance);
  assert.equal(car.nextGate, LAP_GATES + 1);
  assert.equal(car.distance, TRACK_LENGTH_METERS);
});

test("grounded movement stops at scenery and recovers beyond supported ground", () => {
  const world = createGroundedMovement((a, b, groundOnly) => {
    if (groundOnly) return b.x < 20 ? { point: { ...b, y: 0 }, road: true } : null;
    if (a.x < 3 && b.x >= 3) return { fraction: (3 - a.x) / (b.x - a.x), normal: { x: -1, y: 0, z: 0 } };
    return null;
  });
  const car = kart();
  car.heading = 90;
  run(car, { accelerate: true }, 2, world);
  assert.ok(car.worldPosition.x + CAR_SIZE_WORLD.z / 2 <= 3);
  assert.ok(car.speed < 0.2);
  const version = car.resetVersion;
  car.worldPosition.x = 25;
  run(car, {}, DRIVING_STEP, world);
  assert.equal(car.resetVersion, version + 1);
  assert.equal(car.speed, 0);
});

test("the real exported map supports the grid and permits driving off the road", () => {
  const world = getDrivingWorld();
  const road = world.raycast({ x: 0, y: 0.2, z: 0 }, { x: 0, y: -0.5, z: 0 }, true);
  assert.ok(road?.road);
  assert.ok(Math.abs(road.point.y) < 1e-5);
  const car = kart();
  run(car, { accelerate: true }, 3, world);
  assert.equal(car.resetVersion, 1);
  assert.ok(car.worldPosition.z < -15);
  assert.ok(Math.abs(car.worldPosition.y - CAR_SIZE_WORLD.y / 2) < 1e-5);
  // Find an open grass patch by the grid, outside the former lane limit.
  let patch;
  for (const x of [-5, -4, 4, 5]) for (const z of [-5, 0, 5]) {
    const hit = world.raycast({ x, y: 0.2, z }, { x, y: -0.6, z }, true);
    if (hit && !hit.road) patch = { x, y: hit.point.y + CAR_SIZE_WORLD.y / 2, z };
  }
  assert.ok(patch);
  car.worldPosition = patch;
  run(car, {}, DRIVING_STEP, world);
  assert.equal(car.resetVersion, 1);
  assert.equal(car.offRoad, true);
  assert.equal(car.worldPosition.x, patch.x);
});

test("exported curb tops support the kart even when their triangles face downward", () => {
  const world = getDrivingWorld();
  for (const x of [-3.5, 3.5]) {
    const curb = world.raycast({ x, y: 0.2, z: 8 }, { x, y: -0.6, z: 8 }, true);
    assert.ok(curb && curb.point.y > 0.02 && curb.point.y < 0.04, "find the curb top, not the grass beneath it");
    assert.ok(curb.normal.y > 0.99);
  }
});

test("the whole kart clears the curb when its centre is on the grass or road", () => {
  const world = getDrivingWorld();
  const halfHeight = CAR_SIZE_WORLD.y / 2;
  for (const side of [-1, 1]) for (const heading of [0, 45, 90]) {
    let position = { x: side * 2.4, y: halfHeight, z: 8 };
    // Cross the curb in both directions, then stop with wheels on the curb.
    const path = Array.from({ length: 48 }, (_, i) => 2.4 + i * 0.05);
    for (const x of [...path, ...path.toReversed(), 4.1]) {
      const desired = { ...position, x: side * x };
      const result = world.move(position, desired, heading);
      assert.ok(!result.recover && !result.hit, "a low curb must remain driveable");
      position = result.position;
      const angle = heading * Math.PI / 180;
      for (const localX of [-CAR_SIZE_WORLD.x / 2, 0, CAR_SIZE_WORLD.x / 2]) {
        for (const localZ of [-CAR_SIZE_WORLD.z / 2, 0, CAR_SIZE_WORLD.z / 2]) {
          const point = { x: position.x + Math.cos(angle) * localX - Math.sin(angle) * localZ,
            z: position.z + Math.sin(angle) * localX + Math.cos(angle) * localZ };
          const ground = world.raycast({ ...point, y: 1 }, { ...point, y: -0.6 }, true);
          assert.ok(position.y - halfHeight >= ground.point.y - 1e-6, "no part of the footprint sinks into the curb");
        }
      }
    }
    const stopped = world.move(position, position, heading);
    assert.ok(Math.abs(stopped.position.y - position.y) < 1e-6, "support must remain stable at rest");
  }
});

test("server ticks and sandbox steps produce the same handling at different frame rates", async () => {
  const engine = new GameEngine({ buildDurationMs: 1, startCountdownMs: 0, drivingWorld: null });
  const room = engine.createRoom(0);
  engine.joinPlayer(room.id, "driver", 0);
  engine.startPrompting(room.id, room.hostToken, 0);
  engine.submitPrompt(room.id, "driver", "Kart", 0);
  await startRepairedRace(engine, room, 2);
  engine.tick(2);
  engine.setControls(room.id, "driver", { accelerate: true, right: true });
  for (let now = 52; now <= 1002; now += 50) engine.tick(now);
  const server = room.players.get("driver").car;
  for (const fps of [30, 60, 144]) {
    const local = kart();
    let accumulator = 0;
    for (let frame = 0; frame < fps; frame++) {
      accumulator += 1 / fps;
      while (accumulator + 1e-9 >= DRIVING_STEP) {
        stepKart(local, { accelerate: true, right: true }, DRIVING_STEP);
        accumulator -= DRIVING_STEP;
      }
    }
    assert.deepEqual(local.worldPosition, server.worldPosition);
    assert.equal(local.heading, server.heading);
    assert.equal(local.speed, server.speed);
  }
});

test("map impacts provide the same numeric HUD fields as car and barrier impacts", async () => {
  const engine = new GameEngine({ buildDurationMs: 1, startCountdownMs: 0, drivingWorld: {
    move(previous, desired) {
      return { position: previous, hit: { fraction: 0, normal: { x: 0, y: 0, z: 1 } } };
    },
  } });
  const room = engine.createRoom(0);
  engine.joinPlayer(room.id, "driver", 0);
  engine.startPrompting(room.id, room.hostToken, 0);
  engine.submitPrompt(room.id, "driver", "Kart", 0);
  await startRepairedRace(engine, room, 2);
  engine.tick(2);
  engine.setControls(room.id, "driver", { accelerate: true });
  engine.tick(52);
  const impact = engine.serialize(room).players[0].car.lastCollision;
  assert.equal(impact.targetId, "map");
  assert.ok(impact.impactSpeed > 0);
  assert.ok(Number.isFinite(impact.impulseNs));
  assert.ok(Number.isFinite(impact.velocityAfter.z));
  assert.doesNotThrow(() => impact.impactSpeed.toFixed(1));
});


test("short steering taps give fine control at full speed; releasing and countersteering respond quickly", () => {
  const car = kart();
  car.speed = STANDARD_MAX_SPEED_MPS; car.velocityZ = -STANDARD_MAX_SPEED_MPS;
  run(car, { accelerate: true, right: true }, 0.1);
  assert.ok(car.heading > 2 && car.heading < 6, `100 ms tap turned ${car.heading} degrees`);
  run(car, { accelerate: true, right: true }, 0.4);
  const heldAngle = car.steeringAngle;
  run(car, { accelerate: true }, 0.1);
  assert.ok(Math.abs(car.steeringAngle) < heldAngle * 0.1);
  run(car, { accelerate: true, right: true }, 0.4);
  run(car, { accelerate: true, left: true }, 0.1);
  assert.ok(car.steeringAngle < 0, "opposite input must not keep steering the old way");
});

test("slowing down tightens the turning circle without lateral drift", () => {
  const radiusAt = (speed) => {
    const car = kart();
    car.speed = speed; car.velocityZ = -speed;
    car.steeringAngle = 38 - 12 * speed / STANDARD_MAX_SPEED_MPS;
    stepKart(car, { accelerate: true, right: true }, DRIVING_STEP);
    const yawRate = car.heading * Math.PI / 180 / DRIVING_STEP;
    const forward = carWorldTransform(car).forward;
    assert.ok(Math.abs(car.velocityX * forward.z - car.velocityZ * forward.x) < 1e-8);
    return car.speed / yawRate;
  };
  assert.ok(radiusAt(STANDARD_MAX_SPEED_MPS) > radiusAt(STANDARD_MAX_SPEED_MPS / 2) * 1.35);
  assert.ok(radiusAt(6) < 4);
});

test("held turns trade speed for grip and acceleration recovers promptly on the straight", () => {
  const turn = kart(), straight = kart();
  for (const car of [turn, straight]) { car.speed = STANDARD_MAX_SPEED_MPS; car.velocityZ = -STANDARD_MAX_SPEED_MPS; }
  run(turn, { accelerate: true, right: true }, 2);
  run(straight, { accelerate: true }, 2);
  assert.ok(straight.speed - turn.speed > 2);
  assert.ok(turn.speed > STANDARD_MAX_SPEED_MPS * 0.7);
  const cornerSpeed = turn.speed;
  run(turn, { accelerate: true }, 1);
  assert.ok(turn.speed > cornerSpeed + 2);
});

test("grass slows the kart over time rather than cutting its speed in a single frame", () => {
  const car = kart();
  car.speed = STANDARD_MAX_SPEED_MPS; car.velocityZ = -STANDARD_MAX_SPEED_MPS; car.offRoad = true;
  const grass = { move: (previous, desired) => ({ position: desired, offRoad: true }) };
  stepKart(car, { accelerate: true }, DRIVING_STEP, 0, grass);
  assert.ok(car.speed > STANDARD_MAX_SPEED_MPS - 1 && car.speed < STANDARD_MAX_SPEED_MPS);
  run(car, { accelerate: true }, 1, grass);
  assert.ok(car.speed < STANDARD_MAX_SPEED_MPS * 0.6);
  const grassSpeed = car.speed;
  run(car, { accelerate: true }, 1);
  assert.ok(car.speed > grassSpeed + STANDARD_MAX_SPEED_MPS * 0.3);
});

test("acceleration gives a fast low-speed recovery and tapers toward the speed limit", () => {
  const car = kart();
  run(car, { accelerate: true }, 1.3);
  assert.ok(car.speed > STANDARD_MAX_SPEED_MPS * 0.65 && car.speed < STANDARD_MAX_SPEED_MPS * 0.8);
  const earlySpeed = car.speed;
  run(car, { accelerate: true }, 1.3);
  assert.ok(car.speed > STANDARD_MAX_SPEED_MPS * 0.9 && car.speed <= STANDARD_MAX_SPEED_MPS);
  assert.ok(car.speed - earlySpeed < earlySpeed / 2);
});

test("sideways wheels drive across the chassis, brake, reverse and repair", () => {
  const car = kart();
  car.heading = 0;
  car.defectIds = ["sideways_wheels"];
  const start = { ...car.worldPosition };
  run(car, { accelerate: true }, 3);
  assert.ok(car.worldPosition.x > start.x + 10);
  assert.ok(Math.abs(car.worldPosition.z - start.z) < 1e-6);
  assert.equal(car.heading, 0);
  run(car, { brake: true }, 3);
  assert.ok(car.velocityX < -1, "holding brake reverses sideways");
  run(car, { stop: true }, 2);
  assert.equal(car.speed, 0);
  run(car, { accelerate: true, right: true }, 1);
  assert.ok(car.heading > 0, "steering still turns the chassis");
  run(car, { stop: true }, 2);
  car.defectIds = [];
  const heading = car.heading * Math.PI / 180;
  run(car, { accelerate: true }, 2);
  assert.ok(car.velocityX * Math.sin(heading) - car.velocityZ * Math.cos(heading) > 1);
  assert.ok(Math.abs(car.velocityX * Math.cos(heading) + car.velocityZ * Math.sin(heading)) < 1e-6);
});
