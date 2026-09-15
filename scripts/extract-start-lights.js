import { readFileSync, writeFileSync } from "node:fs";
const base = new URL("../public/maps/corsica-gp/", import.meta.url);
const bytes = readFileSync(new URL("visual.glb", base));
const length = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + length));
function accessor(id) {
  const a = gltf.accessors[id], view = gltf.bufferViews[a.bufferView];
  const width = a.type === "VEC4" ? 4 : 3;
  if (a.componentType !== 5126) throw new Error("Expected float light transforms");
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, c) => bytes.readFloatLE(28 + length + (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (view.byteStride ?? width * 4) + c * 4)));
}
const lights = [];
for (const node of gltf.nodes) {
  if (!gltf.meshes[node.mesh]?.primitives.some((p) => gltf.materials[p.material]?.name === "Start / signal red")) continue;
  const attributes = node.extensions.EXT_mesh_gpu_instancing.attributes;
  const position = accessor(attributes.TRANSLATION), rotation = accessor(attributes.ROTATION), scale = accessor(attributes.SCALE);
  position.forEach((p, i) => lights.push({ source: node.name, position: p, rotation: rotation[i], scale: scale[i] }));
}
if (lights.length !== 15) throw new Error(`Expected 15 start lenses, found ${lights.length}`);
const heights = [...new Set(lights.map((light) => light.position[1]))].sort((a,b) => b-a);
lights.forEach((light) => light.row = heights.indexOf(light.position[1]));
writeFileSync(new URL("start-lights.json", base), JSON.stringify(lights, null, 2) + "\n");
