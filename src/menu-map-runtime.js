import * as pc from "playcanvas";
import { loadCorsicaMap, loadPhysics } from "./corsica-map.js";
import { loadRaceSkybox } from "./race-skybox.js";
import { createRaceWater } from "./race-water.js";
import { setupRaceLighting, setupContactShadows } from "./race-lighting.js";
import { menuCameraPose } from "./menu-camera.js";

export async function createMenuMap(canvas, isCancelled) {
  await loadPhysics();
  if (isCancelled()) return null;
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { alpha: false, antialias: true } });
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio, 1.25);
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  setupRaceLighting(app);
  const camera = new pc.Entity("Menu tour camera");
  camera.addComponent("camera", { fov: 60, nearClip: 0.1, farClip: 650,
    clearColor: new pc.Color(0.59, 0.78, 0.85), toneMapping: pc.TONEMAP_NEUTRAL, gammaCorrection: pc.GAMMA_SRGB });
  app.root.addChild(camera);
  const frame = setupContactShadows(app, camera);
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let skybox, water;
  let elapsed = 0, frameTime = 0;
  const placeCamera = () => {
    const { position, target } = menuCameraPose(elapsed);
    camera.setPosition(position.x, position.y, position.z);
    camera.lookAt(target.x, target.y, target.z);
  };
  const scene = {
    resize() { app.resizeCanvas(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight)); app.renderNextFrame = true; },
    destroy() { frame.destroy(); app.scene.skybox = null; skybox?.destroy(); water?.destroy(); app.destroy(); },
  };
  try {
    placeCamera();
    scene.resize();
    app.start();
    skybox = await loadRaceSkybox(app, isCancelled);
    if (isCancelled()) { scene.destroy(); return null; }
    const map = await loadCorsicaMap(app, isCancelled);
    if (isCancelled()) { scene.destroy(); return null; }
    water = createRaceWater(app, map.visual, skybox);
    app.autoRender = false;
    app.renderNextFrame = true;
    app.on("update", (dt) => {
      if (document.hidden || motion.matches) return;
      const delta = Math.min(dt, 0.1);
      elapsed += delta;
      frameTime += delta;
      if (frameTime < 1 / 30) return;
      water.update(frameTime);
      frameTime %= 1 / 30;
      placeCamera();
      app.renderNextFrame = true;
    });
    return scene;
  } catch (error) { scene.destroy(); throw error; }
}
