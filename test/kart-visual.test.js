import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as pc from "playcanvas";
import { NodeIO } from "@gltf-transform/core";
import { createKartVisual, loadKartAssets } from "../src/kart-visual.js";
import { syncCars } from "../src/race-scene-runtime.js";
import { raceCarsFromRoom } from "../src/race-scene-model.js";
import { CAR_SIZE_WORLD, CAR_FRONT_AXLE_OFFSET_WORLD } from "../shared/race-config.js";
import { measureKart } from "../scripts/measure-kart.js";
import manifest from "../public/models/kart/kart.json" with { type: "json" };
import { createKartTestApp, readKartContainer } from "./helpers/kart-assets.js";
import { getDrivingWorld } from "../server/driving-world.js";

let app;
let assets;
before(async () => {
  app = createKartTestApp();
  assets = {
    round: await readKartContainer(app, "kart-round.glb"),
    squareWheel: await readKartContainer(app, "wheel-square.glb"),
  };
});
after(() => app.destroy());

const node = (visual, name) => visual.entity.findByName(name);
const visibleParts = (entity) => entity.findComponents("render").filter((render) => render.enabled && render.entity.enabled);
const near = (actual, expected, tolerance = 0.0001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test("wheel rolling follows travel, reverses, and survives the existing Idle animation", () => {
  const visual = createKartVisual(assets);
  app.root.addChild(visual.entity);
  const left = node(visual, "Part.Wheel.FL");
  const right = node(visual, "Part.Wheel.FR");
  const rest = left.getLocalRotation().clone();
  const axle = left.getPosition().clone();
  visual.updateMotion(0.2);
  const rolled = left.getLocalRotation().clone();
  assert.ok(!rolled.equals(rest));
  assert.ok(axle.distance(left.getPosition()) < 1e-6, "rolling must not move the axle");
  const leftDelta = rest.clone().invert().mul(rolled).getEulerAngles().z;
  const rightRest = right.getLocalRotation().clone();
  visual.updateMotion(0.01);
  const rightDelta = rightRest.invert().mul(right.getLocalRotation()).getEulerAngles().z;
  assert.ok(leftDelta < 0 && rightDelta > 0, "mirrored wheel mounts need opposite local spin");
  app.systems.anim.onAnimationUpdate(0.13);
  const moving = left.getLocalRotation().clone();
  visual.updateMotion(0);
  assert.ok(moving.equals(left.getLocalRotation()), "stationary wheels keep their phase");
  visual.updateMotion(-0.21);
  assert.ok(Math.abs(rest.dot(left.getLocalRotation())) > 0.99999, "reverse travel unwinds the rotation");
  visual.applyDefects(["square_wheels"]);
  const square = node(visual, "Part.SquareWheel.FL");
  visual.updateMotion(0.1);
  assert.ok(square.getLocalRotation().equals(left.getLocalRotation()));
  visual.applyDefects(["sideways_wheels"]);
  const sideways = left.getLocalRotation().clone();
  visual.updateMotion(0.2);
  assert.ok(sideways.equals(left.getLocalRotation()), "sideways tires scrape rather than roll forward");
  visual.entity.destroy();
});

test("each tire meets its ground surface when straddling curb and grass", () => {
  const visual = createKartVisual(assets);
  const pivot = new pc.Entity("Curb contact test", app);
  app.root.addChild(pivot);
  pivot.addChild(visual.entity);
  const world = getDrivingWorld();
  const curb = world.raycast({ x: 3.5, y: 1, z: 8 }, { x: 3.5, y: -1, z: 8 }, true).point.y;
  pivot.setPosition(4.1, curb + CAR_SIZE_WORLD.y / 2, 8);
  const baseY = visual.entity.getLocalPosition().y;
  visual.updateMotion(0.12, (a, b) => world.raycast(a, b, true));
  assert.ok(visual.entity.getLocalPosition().y < baseY - 0.05, "the chassis settles between high and low tires");
  for (const slot of ["FL", "FR", "RL", "RR"]) {
    const wheel = node(visual, `Part.Wheel.${slot}`);
    let bottom = Infinity;
    for (const instance of wheel.render.meshInstances) {
      const positions = []; instance.mesh.getPositions(positions);
      const matrix = instance.node.getWorldTransform();
      for (let i = 0; i < positions.length; i += 3) {
        bottom = Math.min(bottom, matrix.transformPoint(new pc.Vec3(...positions.slice(i, i + 3))).y);
      }
    }
    const center = wheel.getPosition();
    const ground = world.raycast({ x: center.x, y: 1, z: center.z }, { x: center.x, y: -1, z: center.z }, true);
    near(bottom, ground.point.y - 0.001, 0.002);
  }
  const settled = visual.entity.getLocalPosition().clone();
  visual.updateMotion(0, (a, b) => world.raycast(a, b, true));
  assert.ok(settled.distance(visual.entity.getLocalPosition()) < 1e-6, "suspension offsets must not accumulate at rest");
  pivot.destroy();
});

test("multiplayer karts apply defects and repairs on the same animated instance", () => {
  const scene = { app, kartAssets: assets, carStates: new Map(), cameraPlaced: true };
  const players = ["one", "two"].map((id) => ({ id, name: id, car: {
    color: "#fff000", distance: 0, speed: 0, defectIds: [],
  } }));
  syncCars(scene, raceCarsFromRoom({ players }));
  const first = scene.carStates.get("one");
  const second = scene.carStates.get("two");
  assert.notEqual(node(first.visual, "Engine"), node(second.visual, "Engine"));
  assert.equal(visibleParts(first.entity).length, 7);
  assert.equal(first.frontWheelPivots, undefined);
  app.systems.anim.onAnimationUpdate(0.13);
  const time = first.visual.entity.anim.baseLayer.activeStateCurrentTime;

  players[0].car.defectIds = ["no_engine", "no_steering", "no_wheels"];
  syncCars(scene, raceCarsFromRoom({ players }));
  assert.equal(visibleParts(first.entity).length, 1);
  assert.equal(visibleParts(second.entity).length, 7);
  assert.equal(first.visual.entity.anim.baseLayer.activeStateCurrentTime, time);

  players[0].car.defectIds = ["square_wheels", "backwards_engine"];
  syncCars(scene, raceCarsFromRoom({ players }));
  assert.equal(visibleParts(first.entity).length, 7);
  assert.equal(visibleParts(first.entity).filter((part) => part.entity.name.startsWith("Part.SquareWheel")).length, 4);
  const engineRotation = node(first.visual, "EngineMount").getLocalRotation().clone();
  app.systems.anim.onAnimationUpdate(0.13);
  assert.ok(engineRotation.equals(node(first.visual, "EngineMount").getLocalRotation()));

  players[0].car.defectIds = [];
  syncCars(scene, raceCarsFromRoom({ players }));
  assert.equal(scene.carStates.get("one"), first);
  assert.equal(visibleParts(first.entity).length, 7);
  assert.equal(visibleParts(first.entity).filter((part) => part.entity.name.startsWith("Part.SquareWheel")).length, 0);
  assert.ok(node(first.visual, "EngineMount").getLocalRotation().equals(node(second.visual, "EngineMount").getLocalRotation()));
  syncCars(scene, []);
  assert.equal(scene.carStates.size, 0);
});

test("sideways wheels restore their original mounts and UI defects add no motion", () => {
  const visual = createKartVisual(assets);
  app.root.addChild(visual.entity);
  const wheel = node(visual, "Part.Wheel.FL");
  const rest = wheel.getLocalRotation().clone();
  const mountPosition = node(visual, "WheelMount.FL").getPosition().clone();
  const engineBefore = node(visual, "Engine").getLocalPosition().clone();
  visual.applyDefects(["sideways_wheels"]);
  assert.ok(!rest.equals(wheel.getLocalRotation()));
  const sideways = wheel.getLocalRotation().clone();
  app.systems.anim.onAnimationUpdate(0.13);
  assert.ok(sideways.equals(wheel.getLocalRotation()));
  assert.ok(engineBefore.distance(node(visual, "Engine").getLocalPosition()) > 0.0001);
  visual.applyDefects(manifest.uiOnlyDefects);
  app.systems.anim.onAnimationUpdate(0.13);
  assert.ok(rest.equals(wheel.getLocalRotation()));
  assert.ok(mountPosition.distance(node(visual, "WheelMount.FL").getPosition()) < 0.0001);
  assert.equal(visibleParts(visual.entity).length, 7);
  visual.entity.destroy();
});

test("kart geometry fits the shared collider and front-axle pivot with grounded tires", async () => {
  const document = await new NodeIO().read(new URL("../public/models/kart/kart-round.glb", import.meta.url).pathname);
  assert.deepEqual(measureKart(document), manifest.geometry);
  const visual = createKartVisual(assets);
  const pivot = new pc.Entity("Axle test", app);
  app.root.addChild(pivot);
  pivot.setPosition(0, CAR_SIZE_WORLD.y / 2, 0);
  pivot.addChild(visual.entity);
  const meshes = visibleParts(visual.entity).flatMap((part) => part.meshInstances);
  for (const mesh of meshes) mesh.skinInstance?.updateMatrices(mesh.node, 123);
  const bounds = meshes[0].aabb.clone();
  for (const mesh of meshes.slice(1)) bounds.add(mesh.aabb);
  near(bounds.getMin().y, 0);
  near(bounds.getMax().y, CAR_SIZE_WORLD.y);
  near(bounds.halfExtents.x * 2, CAR_SIZE_WORLD.x);
  near(bounds.halfExtents.z * 2, CAR_SIZE_WORLD.z);
  near(bounds.center.z, CAR_FRONT_AXLE_OFFSET_WORLD);
  const left = node(visual, "WheelMount.FL").getPosition();
  const right = node(visual, "WheelMount.FR").getPosition();
  near((left.x + right.x) / 2, 0);
  near((left.z + right.z) / 2, 0);
  pivot.destroy();
});

test("kart loading waits for both assets before reporting a failure or cancellation", async () => {
  const pending = [];
  const fakeApp = { assets: { loadFromUrl(url, type, callback) { pending.push({ url, type, callback }); } } };
  let finished = false;
  const result = loadKartAssets(fakeApp, () => false).catch((error) => { finished = true; return error; });
  assert.equal(pending.length, 2);
  assert.ok(pending.every((request) => request.type === "container"));
  pending[0].callback("network failure");
  await Promise.resolve();
  assert.equal(finished, false);
  pending[1].callback(null, { resource: {} });
  assert.match((await result).message, /Could not load kart asset/);

  pending.length = 0;
  const cancelled = loadKartAssets(fakeApp, () => true);
  pending.forEach((request) => request.callback(null, { resource: {} }));
  assert.equal(await cancelled, null);
});
