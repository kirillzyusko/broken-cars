import * as pc from "playcanvas";
import { loadCorsicaMap, loadPhysics } from "./corsica-map.js";
import { loadRaceSkybox } from "./race-skybox.js";
import { createRaceWater } from "./race-water.js";
import { createKartVisual, loadKartAssets } from "./kart-visual.js";
import { setupRaceLighting, setupContactShadows } from "./race-lighting.js";
import { frontAxleWorldPosition, carWorldTransform, smoothingFactor } from "./race-scene-model.js";
import { CAR_SIZE_WORLD, CAR_FRONT_AXLE_OFFSET_WORLD } from "../shared/race-config.js";
import track from "./corsica-track.json" with { type: "json" };

export async function createRaceScene(canvas, { view, currentPlayerId, onStatus, isCancelled }) {
  onStatus("Loading physics…");
  await loadPhysics();
  if (isCancelled()) return null;
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { alpha: false, antialias: true } });
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  setupRaceLighting(app);
  const camera = new pc.Entity("Race camera");
  camera.addComponent("camera", {
    clearColor: new pc.Color(0.59, 0.78, 0.85), nearClip: 0.08, farClip: 650,
    fov: 62, toneMapping: pc.TONEMAP_NEUTRAL, gammaCorrection: pc.GAMMA_SRGB,
  });
  app.root.addChild(camera);
  const cameraFrame = setupContactShadows(app, camera);
  app.start();
  const scene = {
    app, camera, cameraFrame, view, currentPlayerId, carStates: new Map(), obstacleStates: new Map(), materials: [],
    map: null, skybox: null, water: null, kartAssets: null, cameraPlaced: false,
    destroy() {
      cameraFrame.destroy();
      app.scene.skybox = null;
      scene.skybox?.destroy();
      app.destroy();
      scene.water?.destroy();
      scene.materials.forEach((m) => m.destroy());
    },
  };
  try {
    onStatus("Loading Corsica GP…");
    scene.skybox = await loadRaceSkybox(app, isCancelled);
    if (isCancelled()) { scene.destroy(); return null; }
    scene.map = await loadCorsicaMap(app, isCancelled);
    if (isCancelled()) { scene.destroy(); return null; }
    scene.water = createRaceWater(app, scene.map.visual, scene.skybox);
    onStatus("Loading karts…");
    scene.kartAssets = await loadKartAssets(app, isCancelled);
    if (isCancelled()) { scene.destroy(); return null; }
    app.on("update", (dt) => {
      scene.updateDriving?.(Math.min(dt, 0.1));
      updateScene(scene, Math.min(dt, 0.1));
    });
    updateScene(scene, 0);
    onStatus("");
    return scene;
  } catch (error) {
    scene.destroy();
    throw error;
  }
}

export function syncCars(scene, cars) {
  const active = new Set(cars.map((car) => car.id));
  for (const [id, state] of scene.carStates) {
    if (!active.has(id)) { state.entity.destroy(); scene.carStates.delete(id); }
  }
  for (const car of cars) {
    let state = scene.carStates.get(car.id);
    if (!state) {
      const visual = createKartVisual(scene.kartAssets);
      const entity = new pc.Entity(`Front axle / ${car.name}`);
      const axle = frontAxleWorldPosition(car.position, car.position.yaw);
      entity.setPosition(axle.x, axle.y, axle.z);
      entity.setEulerAngles(0, car.position.yaw, 0);
      scene.app.root.addChild(entity);
      entity.addChild(visual.entity);
      // Match the body center despite the visual root being at the front axle.
      entity.addComponent("collision", {
        type: "box", halfExtents: new pc.Vec3(CAR_SIZE_WORLD.x / 2, CAR_SIZE_WORLD.y / 2, CAR_SIZE_WORLD.z / 2),
        linearOffset: new pc.Vec3(0, 0, CAR_FRONT_AXLE_OFFSET_WORLD),
      });
      entity.addComponent("rigidbody", { type: "kinematic" });
      state = { entity, visual, worldPosition: car.worldPosition ? { ...car.worldPosition } : null, distance: car.distance, lane: car.lane,
        heading: car.heading, car };
      scene.carStates.set(car.id, state);
    }
    // A rematch or preview seek must not interpolate backwards around the circuit.
    if (car.resetVersion !== state.car.resetVersion || Math.abs(car.distance - state.car.distance) > 30) {
      state.worldPosition = car.worldPosition ? { ...car.worldPosition } : null;
      state.distance = car.distance;
      state.lane = car.lane;
      state.heading = car.heading;
      scene.cameraPlaced = false;
    }
    state.car = car;
    state.visual.applyDefects(car.defectIds);
  }
}

function createMaterial(scene, color) {
  const material = new pc.StandardMaterial();
  material.diffuse.fromString(color);
  material.gloss = 0.4;
  material.update();
  scene.materials.push(material);
  return material;
}

function childBox(parent, name, material, position, size) {
  const entity = new pc.Entity(name);
  entity.addComponent("render", { type: "box", material, castShadows: true });
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(size.x, size.y, size.z);
  parent.addChild(entity);
  return entity;
}

export function syncObstacles(scene, obstacles) {
  const active = new Set(obstacles.map((obstacle) => obstacle.id));
  for (const [id, state] of scene.obstacleStates) {
    if (!active.has(id)) { state.entity.destroy(); scene.obstacleStates.delete(id); }
  }
  for (const obstacle of obstacles) {
    const signature = JSON.stringify(obstacle);
    const previous = scene.obstacleStates.get(obstacle.id);
    if (previous?.signature === signature) continue;
    previous?.entity.destroy();
    const { position, size } = obstacle;
    const entity = new pc.Entity(obstacle.label);
    scene.app.root.addChild(entity);
    childBox(entity, "Barrier body", createMaterial(scene, obstacle.color), { x: 0, y: 0, z: 0 }, size);
    entity.setPosition(position.x, position.y, position.z);
    entity.setEulerAngles(0, position.yaw, 0);
    entity.addComponent("collision", { type: "box", halfExtents: new pc.Vec3(size.x / 2, size.y / 2, size.z / 2) });
    entity.addComponent("rigidbody", { type: "static" });
    scene.obstacleStates.set(obstacle.id, { entity, signature });
  }
}

function updateScene(scene, dt) {
  scene.water?.update(dt);
  const blend = smoothingFactor(dt);
  for (const state of scene.carStates.values()) {
    state.distance = pc.math.lerp(state.distance, state.car.distance, blend);
    state.lane = pc.math.lerp(state.lane, state.car.lane, blend);
    const amount = scene.updateDriving ? 1 : blend;
    if (state.car.worldPosition) {
      state.worldPosition ??= { ...state.car.worldPosition };
      for (const axis of ["x", "y", "z"]) state.worldPosition[axis] = pc.math.lerp(state.worldPosition[axis], state.car.worldPosition[axis], amount);
    }
    const turn = ((state.car.heading - state.heading + 180) % 360 + 360) % 360 - 180;
    state.heading += turn * amount;
    // Interpolate progress before sampling the curve, avoiding shortcuts across chicanes.
    const pose = carWorldTransform(state, state.car.index, state.car.carCount);
    state.pose = pose;
    const axle = frontAxleWorldPosition(pose, pose.yaw);
    state.entity.setPosition(axle.x, axle.y, axle.z);
    state.entity.setEulerAngles(0, pose.yaw, 0);
  }
  updateCamera(scene, dt);
}

const routeCenter = track.points.reduce((a, p) => ({ x: a.x + p[0] / track.points.length, z: a.z + p[2] / track.points.length }), { x: 0, z: 0 });
function updateCamera(scene, dt) {
  const driver = scene.carStates.get(scene.currentPlayerId);
  const leader = [...scene.carStates.values()].sort((a, b) => b.distance - a.distance)[0];
  const followed = driver ?? leader;
  if (scene.view === "overview" || !followed?.pose) {
    const aspect = scene.app.graphicsDevice.width / scene.app.graphicsDevice.height;
    const fit = Math.max(1, 1.4 / aspect);
    scene.camera.setPosition(routeCenter.x + 74 * fit, 114 * fit, routeCenter.z + 88 * fit);
    scene.camera.lookAt(routeCenter.x, 0, routeCenter.z);
    scene.cameraPlaced = false;
    return;
  }
  const pose = followed.pose;
  const cockpit = scene.view === "cockpit";
  const spectator = scene.view === "spectator";
  const back = cockpit ? -0.5 : spectator ? 20 : 6.5;
  const height = cockpit ? 1.25 : spectator ? 24 : 3.5;
  const target = new pc.Vec3(pose.x + pose.forward.x * 8, 1, pose.z + pose.forward.z * 8);
  const desired = new pc.Vec3(pose.x - pose.forward.x * back, height, pose.z - pose.forward.z * back);
  if (!cockpit) {
    const origin = new pc.Vec3(pose.x, 1.6, pose.z);
    const hit = scene.app.systems.rigidbody.raycastFirst(origin, desired, { filterCollisionMask: pc.BODYGROUP_STATIC });
    if (hit) desired.lerp(origin, desired, Math.max(0, hit.hitFraction - 0.06));
  }
  const amount = scene.cameraPlaced ? smoothingFactor(dt, 8) : 1;
  const position = scene.camera.getPosition().clone().lerp(scene.camera.getPosition(), desired, amount);
  scene.camera.setPosition(position);
  scene.camera.lookAt(target);
  scene.cameraPlaced = true;
}
