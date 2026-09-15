import * as pc from "playcanvas";
import { loadCorsicaMap, loadPhysics } from "./corsica-map.js";
import { loadRaceSkybox } from "./race-skybox.js";
import { createRaceWater } from "./race-water.js";
import { setupRaceLighting, setupContactShadows } from "./race-lighting.js";
import { sampleTrack } from "./race-scene-model.js";
import track from "./corsica-track.json" with { type: "json" };

const center = track.points.reduce((sum, point) => ({
  x: sum.x + point[0] / track.points.length,
  z: sum.z + point[2] / track.points.length,
}), { x: 0, z: 0 });
const mountain = sampleTrack(300);
const mountainAhead = sampleTrack(315);
const coast = sampleTrack(200);
const coastRight = { x: -coast.forward.z, z: coast.forward.x };

// Screen order: top left, top right, bottom left, bottom right.
export const GRAPHICS_VIEWS = [
  { name: "Whole island", position: [center.x + 105, 150, center.z + 125], target: [center.x, 0, center.z], overview: true },
  { name: "Race start", position: [-10, 7, 14], target: [0, 3.5, -5] },
  { name: "Mountain road", position: [mountain.x, 1.6, mountain.z], target: [mountainAhead.x, 1.8, mountainAhead.z] },
  { name: "Coast and water", position: [coast.x - coastRight.x * 21, 10, coast.z - coastRight.z * 21], target: [coast.x + coastRight.x * 5, 2, coast.z + coastRight.z * 5] },
];

export async function createMapGraphicsScene(canvas, isCancelled) {
  await loadPhysics();
  if (isCancelled()) return null;
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { alpha: false, antialias: true } });
  const device = app.graphicsDevice;
  device.maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  setupRaceLighting(app);

  const views = [];
  let skybox;
  let water;
  let copyShader;
  const scene = {
    app, views,
    resize() {
      app.resizeCanvas(Math.max(2, canvas.clientWidth), Math.max(2, canvas.clientHeight));
      const splitX = Math.floor(device.width / 2);
      const splitY = Math.floor(device.height / 2);
      views.forEach((view, index) => {
        const left = index % 2 === 0;
        const top = index < 2;
        const width = left ? splitX : device.width - splitX;
        const height = top ? device.height - splitY : splitY;
        view.rect.set(left ? 0 : splitX, top ? splitY : 0, width, height);
        view.target.resize(width, height);
        view.camera.camera.aspectRatio = width / height;
        const definition = GRAPHICS_VIEWS[index];
        const fit = definition.overview ? Math.max(1, 1.4 / (width / height)) : 1;
        const [tx, ty, tz] = definition.target;
        const [x, y, z] = definition.position;
        view.camera.setPosition(tx + (x - tx) * fit, ty + (y - ty) * fit, tz + (z - tz) * fit);
        view.camera.lookAt(tx, ty, tz);
      });
    },
    destroy() {
      views.forEach(({ frame }) => frame.destroy());
      app.scene.skybox = null;
      skybox?.destroy();
      water?.destroy();
      views.forEach(({ target, texture }) => { target.destroy(); texture.destroy(); });
      copyShader?.destroy();
      app.destroy();
    },
  };

  try {
    // One map and one graphics device. Each camera gets the race's full post-processing
    // at its own panel resolution, then the four finished images fill the canvas.
    for (const [index, definition] of GRAPHICS_VIEWS.entries()) {
      const texture = new pc.Texture(device, {
        name: definition.name, width: 2, height: 2, format: pc.PIXELFORMAT_RGBA8,
        mipmaps: false, minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      });
      const target = new pc.RenderTarget({ colorBuffer: texture, depth: true });
      const camera = new pc.Entity(definition.name);
      camera.addComponent("camera", {
        renderTarget: target, priority: index, fov: 62, nearClip: 0.08, farClip: 650,
        aspectRatioMode: pc.ASPECT_MANUAL,
        clearColor: new pc.Color(0.59, 0.78, 0.85),
        toneMapping: pc.TONEMAP_NEUTRAL, gammaCorrection: pc.GAMMA_SRGB,
      });
      app.root.addChild(camera);
      const frame = setupContactShadows(app, camera);
      views.push({ camera, frame, target, texture, rect: new pc.Vec4() });
    }
    scene.resize();
    copyShader = pc.createShaderFromCode(device, `
      attribute vec2 aPosition;
      varying vec2 vUv;
      void main(void) {
        vUv = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `, `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D viewTexture;
      void main(void) { gl_FragColor = texture2D(viewTexture, vUv); }
    `, "Corsica graphics view copy", { aPosition: pc.SEMANTIC_POSITION });
    const textureUniform = device.scope.resolve("viewTexture");
    app.on("postrender", () => {
      device.setBlendState(pc.BlendState.NOBLEND);
      for (const view of views) {
        textureUniform.setValue(view.texture);
        pc.drawQuadWithShader(device, null, copyShader, view.rect, view.rect);
      }
    });

    // Starting the app also initializes Ammo before the map adds its bodies.
    app.start();
    skybox = await loadRaceSkybox(app, isCancelled);
    if (isCancelled()) { scene.destroy(); return null; }
    const map = await loadCorsicaMap(app, isCancelled);
    if (isCancelled()) { scene.destroy(); return null; }
    water = createRaceWater(app, map.visual, skybox);
    app.on("update", (dt) => water.update(Math.min(dt, 0.1)));
    return scene;
  } catch (error) {
    scene.destroy();
    throw error;
  }
}
