import * as pc from "playcanvas";

export function setupContactShadows(app, camera) {
  const frame = new pc.CameraFrame(app, camera.camera);
  frame.rendering.toneMapping = pc.TONEMAP_NEUTRAL;
  frame.rendering.samples = Math.min(4, app.graphicsDevice.maxSamples);
  // Occlude ambient light at nearby surfaces without dimming direct sunlight.
  frame.ssao.type = pc.SSAOTYPE_LIGHTING;
  frame.ssao.radius = 1.5;
  frame.ssao.intensity = 0.7;
  frame.ssao.power = 3;
  frame.ssao.samples = 16;
  frame.ssao.scale = 1;
  frame.ssao.blurEnabled = true;
  frame.ssao.randomize = false;
  frame.update();
  return frame;
}

export function setupRaceLighting(app) {
  // Neutral daylight preserves white signs and paint; foliage warmth is material-specific.
  app.scene.ambientLight = new pc.Color(0.80, 0.80, 0.80);
  app.scene.exposure = 1.15;
  // Keep the island clear nearby and fade the distant ocean into the sky.
  // loadRaceSkybox replaces this fallback with the panorama's horizon color.
  app.scene.fog.type = pc.FOG_LINEAR;
  app.scene.fog.color.set(0.72, 0.91, 0.96);
  app.scene.fog.start = 240;
  app.scene.fog.end = 580;

  const sun = new pc.Entity("Corsica / summer sun");
  sun.addComponent("light", {
    type: "directional",
    color: new pc.Color(1, 1, 1),
    intensity: 2.15,
    castShadows: true,
    shadowType: pc.SHADOW_PCF5,
    shadowDistance: 110,
    shadowResolution: 2048,
    // Keep enough separation to prevent self-shadowing on grazing surfaces.
    shadowBias: 0.08,
    normalOffsetBias: 0.04,
    numCascades: 3,
    cascadeBlend: 0.2,
  });
  sun.setEulerAngles(28, -35, 0);
  app.root.addChild(sun);

  const skyFill = new pc.Entity("Corsica / neutral sky fill");
  skyFill.addComponent("light", {
    type: "directional",
    color: new pc.Color(0.96, 0.96, 0.96),
    intensity: 0.48,
    castShadows: false,
  });
  skyFill.setEulerAngles(58, 145, 0);
  app.root.addChild(skyFill);

  const bounce = new pc.Entity("Corsica / soft ground bounce");
  bounce.addComponent("light", {
    type: "directional",
    color: new pc.Color(0.95, 0.95, 0.95),
    intensity: 0.14,
    castShadows: false,
  });
  bounce.setEulerAngles(155, -20, 0);
  app.root.addChild(bounce);
}
