import * as pc from "playcanvas";
import { loadCorsicaMap, loadPhysics } from "./corsica-map.js";
import { loadRaceSkybox } from "./race-skybox.js";
import { createRaceWater } from "./race-water.js";
import { CAR_HEIGHT, carWorldTransform, smoothingFactor } from "./race-scene-model.js";
import track from "./corsica-track.json" with { type: "json" };

export async function createRaceScene(canvas, { view, currentPlayerId, onStatus, isCancelled }) {
  onStatus("Loading physics…");
  await loadPhysics();
  if (isCancelled()) return null;
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { alpha: false, antialias: true } });
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.ambientLight = new pc.Color(0.64, 0.70, 0.76);
  const sun = new pc.Entity("Corsica afternoon sun");
  sun.addComponent("light", {
    type: "directional", color: new pc.Color(1, 0.93, 0.81), intensity: 1.5,
    castShadows: true, shadowDistance: 100, shadowResolution: 2048,
    shadowBias: 0.15, normalOffsetBias: 0.06, numCascades: 3,
  });
  sun.setEulerAngles(48, -35, 0);
  app.root.addChild(sun);
  const camera = new pc.Entity("Race camera");
  camera.addComponent("camera", {
    clearColor: new pc.Color(0.59, 0.78, 0.85), nearClip: 0.08, farClip: 650,
    fov: 62, toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB,
  });
  app.root.addChild(camera);
  app.start();
  const scene = {
    app, camera, view, currentPlayerId, carStates: new Map(), materials: [],
    map: null, skybox: null, water: null, cameraPlaced: false,
    destroy() {
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
    app.on("update", (dt) => updateScene(scene, Math.min(dt, 0.1)));
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
      const material = new pc.StandardMaterial();
      material.diffuse.fromString(car.color);
      material.gloss = 0.4;
      material.update();
      scene.materials.push(material);
      const entity = new pc.Entity(`Car / ${car.name}`);
      entity.addComponent("render", { type: "box", material, castShadows: true });
      entity.setLocalScale(1.25, CAR_HEIGHT, 2.1);
      entity.setPosition(car.position.x, car.position.y, car.position.z);
      entity.setEulerAngles(0, car.position.yaw, 0);
      scene.app.root.addChild(entity);
      // Server snapshots drive motion; this body lets other physics objects hit the car.
      entity.addComponent("collision", { type: "box", halfExtents: new pc.Vec3(0.625, CAR_HEIGHT / 2, 1.05) });
      entity.addComponent("rigidbody", { type: "kinematic" });
      state = { entity, distance: car.distance, lane: car.lane, car };
      scene.carStates.set(car.id, state);
    }
    // A rematch or preview seek must not interpolate backwards around the circuit.
    if (Math.abs(car.distance - state.car.distance) > 30) {
      state.distance = car.distance;
      state.lane = car.lane;
      scene.cameraPlaced = false;
    }
    state.car = car;
  }
}

function updateScene(scene, dt) {
  scene.water?.update(dt);
  const blend = smoothingFactor(dt);
  for (const state of scene.carStates.values()) {
    state.distance = pc.math.lerp(state.distance, state.car.distance, blend);
    state.lane = pc.math.lerp(state.lane, state.car.lane, blend);
    // Interpolate progress before sampling the curve, avoiding shortcuts across chicanes.
    const pose = carWorldTransform(state, state.car.index, state.car.carCount);
    state.pose = pose;
    state.entity.setPosition(pose.x, pose.y, pose.z);
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
