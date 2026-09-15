import { drivingSpawn, sampleTrack, circuitTransform } from "../shared/track-world.js";
import assert from "node:assert/strict";
import test from "node:test";
import { DEFECTS, defectTestUtils, selectDefects } from "../server/defects.js";
import {
  CAR_MASS_KG,
  GameEngine,
  STANDARD_MAX_SPEED_MPS,
  TRACK_LENGTH_METERS,
} from "../server/game-engine.js";
import {
  CAR_SIZE_WORLD,
  DISTANCE_TO_WORLD,
  LANE_TO_WORLD,
  TRACK_OBSTACLES,
  carPositionToWorld,
  startingGridWorldOffset,
  obstaclePositionToWorld,
} from "../shared/race-config.js";
import { startRepairedRace } from "./helpers/repaired-race.js";

test("players wait for the host before the shared prompt minute starts", () => {
  const engine = new GameEngine({ buildDurationMs: 100 });
  const room = engine.createRoom(1_000);
  const player = engine.joinPlayer(room.id, "player-1", 1_010);

  assert.equal(room.phase, "waiting");
  assert.equal(room.promptDeadline, null);
  assert.throws(
    () => engine.submitPrompt(room.id, player.id, "Too early", 1_015),
    /closed/,
  );

  engine.startPrompting(room.id, room.hostToken, 1_020);
  assert.equal(room.phase, "prompting");
  assert.equal(room.promptDeadline, 1_120);
  engine.submitPrompt(room.id, player.id, "  Rocket shopping cart  ", 1_020);
  assert.equal(player.prompt, "Rocket shopping cart");
  assert.throws(
    () => engine.submitPrompt(room.id, player.id, "Too late", 1_121),
    /closed/,
  );
  assert.throws(() => engine.joinPlayer(room.id, "player-2", 1_021), /no longer/);
});

test("host cannot start the build before a driver joins", () => {
  const engine = new GameEngine({ buildDurationMs: 100 });
  const room = engine.createRoom(1_000);

  assert.throws(
    () => engine.startPrompting(room.id, room.hostToken, 1_010),
    /connected driver/,
  );
  assert.throws(
    () => engine.startPrompting(room.id, "wrong", 1_010),
    /credentials/,
  );
  engine.joinPlayer(room.id, "player-1", 1_020);
  engine.disconnectPlayer(room.id, "player-1");
  assert.throws(
    () => engine.startPrompting(room.id, room.hostToken, 1_030),
    /connected driver/,
  );
});

test("host cannot start early and invalid host credentials are rejected", async () => {
  const engine = new GameEngine({ buildDurationMs: 100 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_010);
  engine.startPrompting(room.id, room.hostToken, 1_020);
  engine.submitPrompt(room.id, "player-1", "Moon buggy", 1_020);

  await assert.rejects(
    engine.startRoom(room.id, room.hostToken, selectDefects, 1_100),
    /not over/,
  );
  await assert.rejects(
    engine.startRoom(room.id, "wrong", selectDefects, 1_121),
    /credentials/,
  );
});

test("every car leaves the garage broken and server-authoritative controls move it", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Fast banana", 1_000);
  let selectorCalled = false;
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => {
      selectorCalled = true;
      return { "player-1": ["no_brakes", "no_seatbelt", "no_steering", "loose_wheel"] };
    },
    1_002,
  );

  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);
  engine.setControls(room.id, "player-1", { accelerate: true });
  for (let now = 2_050; now <= 5_000; now += 50) engine.tick(now);

  const car = room.players.get("player-1").car;
  assert.equal(selectorCalled, true);
  assert.deepEqual(car.defectIds, ["no_steering", "no_brakes", "no_seatbelt", "loose_wheel"]);
  assert.ok(car.speed > 0);
  assert.ok(car.speed > STANDARD_MAX_SPEED_MPS * 0.8, `expected full acceleration, received ${car.speed}`);
  assert.ok(car.distance > 0);
  assert.ok(car.distance < TRACK_LENGTH_METERS);
  assert.ok(car.speed <= STANDARD_MAX_SPEED_MPS, `expected believable acceleration, received ${car.speed}`);
  assert.ok(car.distance < 80, `expected a long 500m road, received ${car.distance}m`);
  car.speed = STANDARD_MAX_SPEED_MPS;
  engine.tick(5_050);
  assert.ok(car.speed <= STANDARD_MAX_SPEED_MPS);
});

test("steering input cannot move or rotate a stationary car", async () => {
  const engine = new GameEngine({ buildDurationMs: 1, drivingWorld: null });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Bicycle-model box", 1_000);
  await startRepairedRace(engine, room);
  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);

  engine.setControls(room.id, "player-1", { right: true });
  for (let now = 2_050; now <= 2_500; now += 50) engine.tick(now);
  const car = room.players.get("player-1").car;
  assert.equal(car.worldPosition.x, drivingSpawn().x);
  assert.equal(car.worldPosition.z, drivingSpawn().z);
  assert.equal(car.heading, 0);
  assert.ok(car.steeringAngle > 0);

  engine.setControls(room.id, "player-1", { accelerate: true, right: true });
  for (let now = 2_550; now <= 3_500; now += 50) engine.tick(now);
  assert.ok(Math.hypot(car.worldPosition.x - drivingSpawn().x, car.worldPosition.z - drivingSpawn().z) > 1);
  assert.ok(car.heading > 0);
  assert.ok(car.lane > 0);
});

test("standard kart holds its chosen heading with strong grip and no jumping", async () => {
  const engine = new GameEngine({ buildDurationMs: 1, drivingWorld: null });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Grip-test kart", 1_000);
  await startRepairedRace(engine, room);
  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);

  engine.setControls(room.id, "player-1", { accelerate: true });
  for (let now = 2_050; now <= 3_200; now += 50) engine.tick(now);
  engine.setControls(room.id, "player-1", { accelerate: true, right: true });
  for (let now = 3_250; now <= 3_600; now += 50) engine.tick(now);

  const car = room.players.get("player-1").car;
  const headingDuringTurn = car.heading;
  assert.ok(headingDuringTurn > 0);

  engine.setControls(room.id, "player-1", { accelerate: true });
  for (let now = 3_650; now <= 4_350; now += 50) engine.tick(now);
  const velocityHeading = Math.atan2(car.velocityX, -car.velocityZ) * 180 / Math.PI;

  assert.ok(car.heading >= headingDuringTurn, "releasing steering must not turn back toward the track");
  assert.ok(Math.abs(car.heading - velocityHeading) < 2, "high grip should prevent a sustained slide");
  assert.equal("velocityY" in car, false);
});

test("two players see synchronized acceleration and opposite steering movement", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-left", 1_000);
  engine.joinPlayer(room.id, "player-right", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-left", "Left box", 1_000);
  engine.submitPrompt(room.id, "player-right", "Right box", 1_000);
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({
      "player-left": ["no_brakes", "no_seatbelt", "no_cooling", "loose_wheel"],
      "player-right": ["no_brakes", "no_seatbelt", "no_cooling", "loose_wheel"],
    }),
    1_002,
  );

  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);
  engine.setControls(room.id, "player-left", { accelerate: true, left: true });
  engine.setControls(room.id, "player-right", { accelerate: true, right: true });
  for (let now = 2_050; now <= 2_500; now += 50) engine.tick(now);

  const hostCars = engine.serialize(room).players.map(({ id, car }) => ({
    id,
    distance: car.distance,
    lane: car.lane,
    worldPosition: car.worldPosition,
  }));
  const playerCars = engine.serialize(room, 2_500, "Local randomizer", "player-left")
    .players.map(({ id, car }) => ({ id, distance: car.distance, lane: car.lane, worldPosition: car.worldPosition }));

  assert.ok(hostCars[0].worldPosition.x < drivingSpawn(0).x);
  assert.ok(hostCars[1].worldPosition.x > drivingSpawn(1).x);
  assert.ok(hostCars.every((player, index) => player.worldPosition.z < drivingSpawn(index).z));
  assert.deepEqual(playerCars, hostCars);
});

test("the former prototype barrier location is clear for driving", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Crash-test box", 1_000);
  await startRepairedRace(engine, room);
  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);

  const obstacle = { distance: 115, lane: -0.62, length: 6 };
  const car = room.players.get("player-1").car;
  const pose = circuitTransform(obstaclePositionToWorld(obstacle));
  car.worldPosition = { x: pose.x - pose.forward.x * 6, y: CAR_SIZE_WORLD.y / 2, z: pose.z - pose.forward.z * 6 };
  car.heading = -pose.yaw;
  car.velocityX = pose.forward.x * 28;
  car.velocityZ = pose.forward.z * 28;
  car.speed = 28;
  engine.setControls(room.id, "player-1", { accelerate: true });
  for (let now = 2_100; now <= 4_000 && car.collisionCount === 0; now += 100) {
    engine.tick(now);
  }

  assert.ok((car.worldPosition.x - pose.x) * pose.forward.x + (car.worldPosition.z - pose.z) * pose.forward.z > 0, "car should drive past the old barrier");
  assert.equal(car.collisionCount, 0);
  assert.deepEqual(engine.serialize(room).obstacles, []);
});

test("rear-end car collisions exchange momentum and separate both cars", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "rear-car", 1_000);
  engine.joinPlayer(room.id, "front-car", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "rear-car", "Rear box", 1_000);
  engine.submitPrompt(room.id, "front-car", "Front box", 1_000);
  await startRepairedRace(engine, room);
  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);

  const rear = room.players.get("rear-car").car;
  const front = room.players.get("front-car").car;
  rear.worldPosition = { x: 0, y: CAR_SIZE_WORLD.y / 2, z: -5 };
  front.worldPosition = { x: 0, y: CAR_SIZE_WORLD.y / 2, z: -5 - CAR_SIZE_WORLD.z - 0.5 };
  rear.speed = STANDARD_MAX_SPEED_MPS * 0.9;
  rear.velocityZ = -rear.speed;
  front.speed = 4;
  front.velocityZ = -4;
  const momentumBefore = (rear.velocityZ + front.velocityZ) * CAR_MASS_KG;
  engine.tick(2_100);

  const rearPosition = carPositionToWorld(rear, 0, 2);
  const frontPosition = carPositionToWorld(front, 1, 2);
  assert.equal(rear.massKg, CAR_MASS_KG);
  assert.equal(front.massKg, CAR_MASS_KG);
  assert.ok(rear.velocityZ > front.velocityZ);
  const momentumAfter = (rear.velocityZ + front.velocityZ) * CAR_MASS_KG;
  assert.ok(
    Math.abs(momentumAfter - momentumBefore) < 1_000,
    `expected longitudinal momentum conservation, delta was ${momentumAfter - momentumBefore} Ns`,
  );
  assert.ok(Math.abs(rearPosition.z - frontPosition.z) >= CAR_SIZE_WORLD.z);
  assert.equal(rear.collisionCount, 1);
  assert.equal(front.collisionCount, 1);
  assert.equal(rear.lastCollision.targetId, "front-car");
  assert.equal(front.lastCollision.targetId, "rear-car");
  assert.ok(rear.lastCollision.impulseNs > 0);
  assert.deepEqual(rear.lastCollision.normal, { x: 0, z: 1 });
  assert.deepEqual(front.lastCollision.normal, { x: 0, z: -1 });
});

test("a glancing equal-mass impact transfers lateral velocity and spin", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "striking-car", 1_000);
  engine.joinPlayer(room.id, "target-car", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "striking-car", "Striking box", 1_000);
  engine.submitPrompt(room.id, "target-car", "Target box", 1_000);
  await startRepairedRace(engine, room);
  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);

  const striking = room.players.get("striking-car").car;
  const target = room.players.get("target-car").car;
  striking.worldPosition = { x: -CAR_SIZE_WORLD.x - 0.01, y: CAR_SIZE_WORLD.y / 2, z: -5 };
  target.worldPosition = { x: 0, y: CAR_SIZE_WORLD.y / 2, z: -5.3 };
  striking.velocityX = 6;
  striking.velocityZ = -12;
  striking.heading = Math.atan2(6, 12) * 180 / Math.PI;
  striking.speed = Math.hypot(6, 12);
  target.velocityX = 0;
  target.velocityZ = -12;
  target.speed = 12;

  engine.tick(2_050);
  const targetXAtImpact = target.worldPosition.x;

  assert.equal(striking.collisionCount, 1);
  assert.equal(target.collisionCount, 1);
  assert.ok(striking.velocityX < target.velocityX);
  assert.ok(target.velocityX > 0, "the target should inherit the impact direction");
  assert.ok(Math.abs(striking.angularVelocity) > 0);
  assert.ok(Math.abs(target.angularVelocity) > 0);
  assert.equal(Math.sign(striking.angularVelocity), -Math.sign(target.angularVelocity));
  assert.deepEqual(striking.lastCollision.normal, { x: -1, z: 0 });
  assert.deepEqual(target.lastCollision.normal, { x: 1, z: 0 });

  engine.tick(2_100);
  assert.ok(target.worldPosition.x > targetXAtImpact, "the transferred vector should carry the target sideways");
});

test("a car with no engine cannot accelerate", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Engine-free supercar", 1_000);
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({ "player-1": ["no_engine", "no_brakes", "no_steering", "loose_wheel"] }),
    1_002,
  );
  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);
  engine.setControls(room.id, "player-1", { accelerate: true });
  engine.tick(2_100);

  assert.equal(room.players.get("player-1").car.speed, 0);
});

test("swapped pedals, reversed steering, stuck acceleration, and backwards engines affect driving", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  const defectIds = [
    "swapped_pedals",
    "reversed_steering",
    "stuck_accelerator",
    "backwards_engine",
  ];

  defectIds.forEach((_, index) => {
    const id = `player-${index}`;
    engine.joinPlayer(room.id, id, 1_000);
  });
  engine.startPrompting(room.id, room.hostToken, 1_000);
  defectIds.forEach((_, index) => {
    engine.submitPrompt(room.id, `player-${index}`, `Car ${index}`, 1_000);
  });
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => Object.fromEntries(defectIds.map((defectId, index) => [
      `player-${index}`,
      [defectId, "no_seatbelt", "loose_wheel", "no_cooling"],
    ])),
    1_002,
  );

  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);
  engine.setControls(room.id, "player-0", { brake: true });
  engine.setControls(room.id, "player-1", { accelerate: true, right: true });
  engine.setControls(room.id, "player-2", { accelerate: true });
  engine.setControls(room.id, "player-3", { accelerate: true });
  engine.tick(2_100);

  assert.ok(room.players.get("player-0").car.speed > 0);
  assert.ok(room.players.get("player-1").car.lane < 0);
  assert.equal(room.players.get("player-2").car.acceleratorStuck, true);
  assert.ok(room.players.get("player-3").car.distance < 0, "backwards driving loses progress behind the start line");

  const stuckSpeed = room.players.get("player-2").car.speed;
  engine.setControls(room.id, "player-2", {});
  engine.tick(2_200);
  assert.ok(room.players.get("player-2").car.speed > stuckSpeed);
});

test("local selector always returns allowed compatible defects", async () => {
  const originalProvider = process.env.LLM_PROVIDER;
  delete process.env.LLM_PROVIDER;
  const players = Array.from({ length: 30 }, (_, index) => ({
    id: `player-${index}`,
    prompt: `Car ${index}`,
  }));
  const assignments = await selectDefects(players);
  const allowedIds = new Set(DEFECTS.map((defect) => defect.id));

  for (const ids of Object.values(assignments)) {
    assert.ok(defectTestUtils.validSelection(ids));
    assert.ok(ids.every((id) => allowedIds.has(id)));
  }
  if (originalProvider) process.env.LLM_PROVIDER = originalProvider;
});

test("room snapshots advertise the current client protocol", () => {
  const engine = new GameEngine();
  const room = engine.createRoom();
  const state = engine.serialize(room);
  assert.equal(state.protocolVersion, 6);
  assert.equal("defectsEnabled" in state, false);
  assert.equal(state.buildDurationMs, 15_000);
  assert.equal(state.tuningDurationMs, 30_000);
  assert.deepEqual(state.obstacles, TRACK_OBSTACLES);
});

test("room snapshots keep car prompts private from the host and other players", async () => {
  const engine = new GameEngine({ buildDurationMs: 1 });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.joinPlayer(room.id, "player-2", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Secret banana car", 1_000);
  engine.submitPrompt(room.id, "player-2", "Secret moon buggy", 1_000);

  const hostSnapshot = engine.serialize(room);
  const playerSnapshot = engine.serialize(room, 1_001, "Local randomizer", "player-1");

  assert.equal("prompt" in hostSnapshot.players[0], false);
  assert.equal("prompt" in hostSnapshot.players[1], false);
  assert.equal(playerSnapshot.players[0].prompt, "Secret banana car");
  assert.equal("prompt" in playerSnapshot.players[1], false);

  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({
      "player-1": ["no_brakes", "no_seatbelt", "loose_wheel", "no_cooling"],
      "player-2": ["no_engine", "no_brakes", "no_steering", "no_grip"],
    }),
    1_002,
  );

  const racingHostSnapshot = engine.serialize(room);
  assert.equal(racingHostSnapshot.players[0].car.name, "Driver 1's car");
  assert.equal(racingHostSnapshot.players[1].car.name, "Driver 2's car");
});

test("all defects apply together and specific repairs leave other faults unchanged", async () => {
  const engine = new GameEngine({
    buildDurationMs: 1,
    tuningDurationMs: 10,
    startCountdownMs: 5,
    maxRaceDurationMs: 100,
  });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Rally car", 1_000);
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({
      "player-1": ["square_wheels", "no_engine", "no_grip", "no_steering"],
    }),
    1_002,
  );

  const player = room.players.get("player-1");
  const all = ["no_engine", "no_grip", "no_steering", "square_wheels"];
  assert.deepEqual(player.car.defectIds, all);
  assert.deepEqual(engine.serialize(room).players[0].car.defectIds, all);
  room.phase = "finished";
  engine.startTuning(room.id, room.hostToken, 2000);
  engine.submitTuningPrompt(room.id, "player-1", "Install the missing engine and replace the square wheels", 2001);
  await engine.startNextRace(room.id, room.hostToken, async (players) => {
    assert.deepEqual(players[0].defectIds, all);
    return { "player-1": ["no_engine", "square_wheels"] };
  }, 2011);
  assert.deepEqual(player.car.defectIds, ["no_grip", "no_steering"]);
  assert.deepEqual(player.lastRepairIds, ["no_engine", "square_wheels"]);
  room.phase = "finished";
  engine.startTuning(room.id, room.hostToken, 3000);
  engine.submitTuningPrompt(room.id, "player-1", "Fix everything", 3001);
  await engine.startNextRace(room.id, room.hostToken, async () => ({ "player-1": [] }), 3011);
  assert.deepEqual(player.car.defectIds, ["no_grip", "no_steering"]);
  assert.deepEqual(player.lastRepairIds, []);
  room.phase = "finished";
  engine.startTuning(room.id, room.hostToken, 4000);
  engine.submitTuningPrompt(room.id, "player-1", "It slides like ice and the steering does nothing", 4001);
  await engine.startNextRace(room.id, room.hostToken, async () => ({ "player-1": ["no_grip", "no_steering"] }), 4011);
  assert.deepEqual(player.car.defectIds, []);

});

test("the engine applies the LLM decision without locally parsing the prompt", async () => {
  const engine = new GameEngine({
    buildDurationMs: 1,
    tuningDurationMs: 10,
  });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Demo car", 1_000);
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({
      "player-1": ["no_brakes", "reversed_steering", "no_grip", "loose_wheel"],
    }),
    1_002,
  );
  room.phase = "finished";
  engine.startTuning(room.id, room.hostToken, 2_000);
  engine.submitTuningPrompt(
    room.id,
    "player-1",
    "Машина должна быть полностью рабочей",
    2_001,
  );
  await engine.startNextRace(
    room.id,
    room.hostToken,
    async () => ({ "player-1": ["no_brakes", "no_grip"] }),
    2_011,
  );

  const player = room.players.get("player-1");
  assert.deepEqual(
    player.car.defectIds,
    ["reversed_steering", "loose_wheel"],
  );
  assert.equal(player.lastRepairId, "no_brakes");
  assert.deepEqual(player.lastRepairIds, ["no_brakes", "no_grip"]);
});

test("host snapshots never reveal private tuning prompts", async () => {
  const engine = new GameEngine({
    buildDurationMs: 1,
    tuningDurationMs: 10,
  });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Secret car", 1_000);
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({
      "player-1": ["no_brakes", "reversed_steering", "no_grip", "loose_wheel"],
    }),
    1_002,
  );
  room.phase = "finished";
  engine.startTuning(room.id, room.hostToken, 2_000);
  engine.submitTuningPrompt(room.id, "player-1", "Secret brake report", 2_001);

  const hostPlayer = engine.serialize(room).players[0];
  const ownerPlayer = engine.serialize(room, 2_002, "Local", "player-1").players[0];
  assert.equal("tuningPrompt" in hostPlayer, false);
  assert.equal(hostPlayer.hasTuningPrompt, true);
  assert.equal(ownerPlayer.tuningPrompt, "Secret brake report");
});

test("players claim a name and a unique colour while the room is waiting", () => {
  const engine = new GameEngine({ buildDurationMs: 100 });
  const room = engine.createRoom(1_000);
  const first = engine.joinPlayer(room.id, "player-1", 1_010);
  const second = engine.joinPlayer(room.id, "player-2", 1_011);

  assert.equal(first.named, false);
  assert.equal(first.name, "Driver 1");

  engine.setProfile(room.id, first.id, { name: "  Denise\u0000 the   Fast  ", color: "blue" });
  assert.equal(first.name, "Denise the Fast");
  assert.equal(first.named, true);
  assert.equal(first.color, "blue");

  assert.throws(
    () => engine.setProfile(room.id, second.id, { name: "Omar", color: "blue" }),
    /taken/,
  );
  assert.throws(
    () => engine.setProfile(room.id, second.id, { name: "   ", color: "red" }),
    /name/i,
  );
  assert.throws(
    () => engine.setProfile(room.id, second.id, { name: "Omar", color: "pink" }),
    /colours/,
  );
  assert.throws(
    () => engine.setProfile(room.id, "nobody", { name: "Omar", color: "red" }),
    /Join/,
  );

  engine.setProfile(room.id, second.id, { name: "Omar", color: null });
  assert.equal(second.color, null);
  assert.equal(second.named, true);

  const snapshot = engine.serialize(room, 1_012);
  assert.deepEqual(
    snapshot.players.map((player) => [player.name, player.named, player.color]),
    [["Denise the Fast", true, "blue"], ["Omar", true, null]],
  );

  engine.startPrompting(room.id, room.hostToken, 1_020);
  assert.throws(
    () => engine.setProfile(room.id, first.id, { name: "Dee", color: "red" }),
    /lock/,
  );
  assert.equal(first.name, "Denise the Fast");
});

test("holding the brake stops a rolling car and then reverses it", async () => {
  const engine = new GameEngine({ buildDurationMs: 1, drivingWorld: null });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Reversible wagon", 1_000);
  await startRepairedRace(engine, room);
  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);
  const car = room.players.get("player-1").car;

  engine.setControls(room.id, "player-1", { accelerate: true });
  for (let now = 2_050; now <= 4_000; now += 50) engine.tick(now);
  const rollingSpeed = car.speed;
  const rollingZ = car.worldPosition.z;
  assert.ok(rollingSpeed > 5);
  assert.ok(car.velocityZ < 0, "forward is negative Z");

  // Braking while rolling slows the car without flipping into reverse.
  engine.setControls(room.id, "player-1", { brake: true });
  engine.tick(4_050);
  assert.ok(car.speed < rollingSpeed);
  assert.ok(car.velocityZ <= 0);

  // Kept held, the brake brings it to a stop and then backs it up.
  for (let now = 4_100; now <= 8_000; now += 50) engine.tick(now);
  assert.ok(car.velocityZ > 0, "reversing moves toward positive Z");
  assert.ok(car.speed > 1);
  assert.ok(car.worldPosition.z > rollingZ);

  // The throttle pulls it back through zero and forward again.
  engine.setControls(room.id, "player-1", { accelerate: true });
  for (let now = 8_050; now <= 10_000; now += 50) engine.tick(now);
  assert.ok(car.velocityZ < 0);
});

test("a car without brakes cannot reverse either", async () => {
  const engine = new GameEngine({ buildDurationMs: 1, drivingWorld: null });
  const room = engine.createRoom(1_000);
  engine.joinPlayer(room.id, "player-1", 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  engine.submitPrompt(room.id, "player-1", "Brakeless sled", 1_000);
  await engine.startRoom(
    room.id,
    room.hostToken,
    async () => ({ "player-1": ["no_brakes", "no_seatbelt", "loose_wheel", "no_cooling"] }),
    1_002,
  );
  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);
  engine.setControls(room.id, "player-1", { brake: true });
  for (let now = 2_050; now <= 5_000; now += 50) engine.tick(now);

  const car = room.players.get("player-1").car;
  assert.ok(car.velocityZ <= 0, "no brake pedal means no reverse gear");
  assert.ok(car.speed < 0.5);
});

async function threeKartRace() {
  const engine = new GameEngine({ buildDurationMs: 1, drivingWorld: null });
  const room = engine.createRoom(1_000);
  const ids = ["player-1", "player-2", "player-3"];
  for (const id of ids) engine.joinPlayer(room.id, id, 1_000);
  engine.startPrompting(room.id, room.hostToken, 1_000);
  for (const id of ids) engine.submitPrompt(room.id, id, "Kart", 1_000);
  await startRepairedRace(engine, room);
  room.startsAt = 2_000;
  room.lastTickAt = 2_000;
  room.raceEndsAt = 100_000;
  engine.tick(2_000);
  assert.equal(room.phase, "racing");
  const cars = ids.map((id) => room.players.get(id).car);
  // Park every kart past its last gate so lap progress leaves the distances alone.
  const park = (distances) => cars.forEach((car, index) => Object.assign(car, { nextGate: 10_000, distance: distances[index] }));
  return { engine, room, cars, park };
}

test("the round ends as soon as the first kart finishes and the rest are placed by distance", async () => {
  const { engine, room, cars, park } = await threeKartRace();
  park([120, TRACK_LENGTH_METERS, 300]);
  engine.tick(2_050);
  assert.equal(room.phase, "finished");
  assert.deepEqual(cars.map((car) => car.rank), [3, 1, 2]);
  assert.deepEqual(cars.map((car) => car.finishedAtMs), [null, 50, null]);
  assert.deepEqual(room.finishers, ["player-2"]);
});

test("when time runs out nobody has finished but everyone is still placed", async () => {
  const { engine, room, cars, park } = await threeKartRace();
  park([120, 300, 200]);
  cars[0].worldPosition.x += 2; // Movement keeps the inactivity timeout from ending this race.
  engine.tick(50_000);
  assert.equal(room.phase, "racing");
  assert.deepEqual(cars.map((car) => car.rank), [null, null, null]);
  engine.tick(100_000);
  assert.equal(room.phase, "finished");
  assert.deepEqual(cars.map((car) => car.rank), [3, 1, 2]);
  assert.ok(cars.every((car) => car.finishedAtMs === null));
});


test("all karts staying within one metre for ten seconds ends the race", async () => {
  const { engine, room, cars, park } = await threeKartRace();
  park([120, 300, 200]);
  cars[0].worldPosition.x += 0.8;
  engine.tick(11_999);
  assert.equal(room.phase, "racing");
  engine.tick(12_000);
  assert.equal(room.phase, "finished");
  assert.deepEqual(cars.map((car) => car.rank), [3, 1, 2]);
});

test("one kart moving more than a metre restarts the inactivity window", async () => {
  const { engine, room, cars } = await threeKartRace();
  cars[1].worldPosition.x += 1.1;
  engine.tick(11_000);
  engine.tick(20_999);
  assert.equal(room.phase, "racing");
  engine.tick(21_000);
  assert.equal(room.phase, "finished");
});

test("live countdown starts after slow garage assignment and repair requests", async (t) => {
  let clock = 1000;
  t.mock.method(Date, "now", () => clock);
  const engine = new GameEngine({ buildDurationMs: 1, tuningDurationMs: 1 });
  const room = engine.createRoom();
  engine.joinPlayer(room.id, "driver");
  engine.startPrompting(room.id, room.hostToken);
  engine.submitPrompt(room.id, "driver", "Kart");
  clock = 1002;
  await engine.startRoom(room.id, room.hostToken, async () => {
    clock += 12_000;
    return { driver: ["no_engine", "no_steering", "no_brakes", "no_seatbelt"] };
  });
  assert.equal(room.startsAt, clock + engine.startCountdownMs);
  engine.tick(clock);
  assert.equal(room.phase, "countdown");
  room.phase = "finished";
  engine.startTuning(room.id, room.hostToken);
  clock += 2;
  await engine.startNextRace(room.id, room.hostToken, async () => {
    clock += 15_000;
    return { driver: [] };
  });
  assert.equal(room.startsAt, clock + engine.startCountdownMs);
  engine.tick(clock);
  assert.equal(room.phase, "countdown");
});

test("prompt tuning persists through repairs and only requested axes change", async () => {
  const engine = new GameEngine({ buildDurationMs: 1, tuningDurationMs: 1 });
  const room = engine.createRoom(1000);
  engine.joinPlayer(room.id, "driver", 1000);
  engine.startPrompting(room.id, room.hostToken, 1000);
  engine.submitPrompt(room.id, "driver", "Make it ultra fast", 1000);
  await engine.startRoom(room.id, room.hostToken, async () => ({ driver: {
    defectIds: ["no_engine", "no_brakes", "no_steering", "square_wheels"], tuning: { speed: "extreme" },
  } }), 1002);
  const car = room.players.get("driver").car;
  assert.deepEqual(car.tuning, { speed: 8, steering: 1 });
  room.phase = "finished";
  engine.startTuning(room.id, room.hostToken, 2000);
  engine.submitTuningPrompt(room.id, "driver", "Fit the missing engine", 2000);
  await engine.startNextRace(room.id, room.hostToken, async () => ({ driver: ["no_engine"] }), 2002);
  assert.deepEqual(car.tuning, { speed: 8, steering: 1 });
  assert.ok(!car.defectIds.includes("no_engine"));
  room.phase = "finished";
  engine.startTuning(room.id, room.hostToken, 3000);
  engine.submitTuningPrompt(room.id, "driver", "Make steering less sensitive", 3000);
  await engine.startNextRace(room.id, room.hostToken, async () => ({ driver: { defectIds: [], tuning: { steering: "low" } } }), 3002);
  assert.deepEqual(car.tuning, { speed: 8, steering: 0.6 });
  assert.deepEqual(engine.serialize(room).players[0].car.tuning, car.tuning);
});
