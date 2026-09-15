import * as pc from "playcanvas";
import { createWaterTextures } from "./water-textures.js";

// Inspired by DragoniteSpam's ShaderWaterTexture: a moving flow texture bends
// the water pattern's UVs. This implementation and its textures are generated locally.
const waterDiffuse = /* glsl */ `
uniform sampler2D uWaterPattern;
uniform sampler2D uWaterFlow;
uniform float uWaterTime;

void getAlbedo() {
    vec2 uv = vPositionW.xz / 24.0;
    vec2 flowA = texture2D(uWaterFlow, uv * 0.71 + vec2(uWaterTime * 0.015, -uWaterTime * 0.009)).rg - 0.5;
    vec2 flowB = texture2D(uWaterFlow, uv * 1.13 + vec2(-uWaterTime * 0.008, uWaterTime * 0.012)).gr - 0.5;
    vec2 warped = uv + flowA * 0.13 + flowB * 0.055;
    vec2 layerA = texture2D(uWaterPattern, warped + vec2(uWaterTime * 0.008, uWaterTime * 0.003)).rg;
    vec2 layerB = texture2D(uWaterPattern, warped * 1.63 + vec2(-uWaterTime * 0.004, uWaterTime * 0.006) + 0.37).rg;
    float distanceToEye = length(view_position.xz - vPositionW.xz);
    float detail = 1.0 - smoothstep(90.0, 240.0, distanceToEye);
    float highlights = smoothstep(0.18, 0.95, layerA.r * 0.78 + layerB.r * 0.3) * detail;
    vec3 blue = vec3(0.035, 0.40, 0.68);
    vec3 turquoise = vec3(0.045, 0.61, 0.76);
    vec3 light = vec3(0.43, 0.88, 0.93);
    vec3 color = mix(blue, turquoise, 0.36 + layerA.g * 0.42);
    color = mix(color, light, highlights * 0.72);
    dAlbedo = pow(color, vec3(2.2));
}
`;

const waterNormal = /* glsl */ `
void getNormal() {
    vec2 n = texture2D(uWaterFlow, vPositionW.xz / 15.0 + vec2(uWaterTime * 0.011, -uWaterTime * 0.008)).rg - 0.5;
    dNormalW = normalize(vec3(n.x * 0.10, 1.0, n.y * 0.10));
}
`;

export function createRaceWater(app, visual, skybox) {
  const oceans = visual.findComponents("render").filter((render) => render.entity.name === "Ocean");
  if (!oceans.length) throw new Error("The Corsica GP ocean mesh is missing.");
  const textures = createWaterTextures(app.graphicsDevice);
  const material = new pc.StandardMaterial();
  material.name = "Corsica GP / flowing island water";
  material.shaderChunksVersion = "2.22";
  material.diffuse.set(1, 1, 1);
  material.specular.set(0.07, 0.07, 0.07);
  material.gloss = 0.72;
  material.cubeMap = skybox;
  material.reflectivity = 0.22;
  material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set("diffusePS", waterDiffuse);
  material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set("normalMapPS", waterNormal);
  material.setParameter("uWaterPattern", textures.pattern);
  material.setParameter("uWaterFlow", textures.flow);
  material.setParameter("uWaterTime", 0);
  material.update();
  for (const render of oceans) {
    render.castShadows = false;
    for (const mesh of render.meshInstances) mesh.material = material;
  }
  let time = 0;
  return {
    update(dt) {
      time += dt;
      material.setParameter("uWaterTime", time);
    },
    destroy() {
      material.destroy();
      textures.pattern.destroy();
      textures.flow.destroy();
    },
  };
}
