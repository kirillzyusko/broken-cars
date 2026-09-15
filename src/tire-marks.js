import * as pc from "playcanvas";

// One bounded mesh for every kart; old rubber fades before slots are reused.
const CAPACITY = 1024;
const LIFETIME = 16;
export function createTireMarks(app) {
  const positions = new Float32Array(CAPACITY * 12);
  const colors = new Uint8Array(CAPACITY * 16);
  const born = new Float64Array(CAPACITY).fill(-Infinity);
  const indices = new Uint16Array(CAPACITY * 6);
  for (let i = 0; i < CAPACITY; i++) {
    const v = i * 4;
    indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
  }
  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.setColors32(colors);
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.emissive.set(0.035, 0.03, 0.025);
  material.opacityMapVertexColor = true;
  material.opacityMapVertexColorChannel = "a";
  material.blendType = pc.BLEND_NORMAL;
  material.depthWrite = false;
  material.cull = pc.CULLFACE_NONE;
  material.update();
  const entity = new pc.Entity("Tire marks");
  const instance = new pc.MeshInstance(mesh, material);
  instance.castShadow = false;
  entity.addComponent("render", { meshInstances: [instance], castShadows: false });
  app.root.addChild(entity);
  let time = 0, next = 0, dirty = false;
  function segment(from, to) {
    const dx = to.x - from.x, dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.035 || length > 1 || Math.abs(to.y - from.y) > 0.25) return false;
    const x = -dz / length * 0.065, z = dx / length * 0.065;
    positions.set([
      from.x + x, from.y + 0.012, from.z + z,
      from.x - x, from.y + 0.012, from.z - z,
      to.x + x, to.y + 0.012, to.z + z,
      to.x - x, to.y + 0.012, to.z - z,
    ], next * 12);
    born[next] = time;
    next = (next + 1) % CAPACITY;
    dirty = true;
    return true;
  }
  return {
    segment,
    update(dt) {
      time += dt;
      let changed = dirty;
      for (let i = 0; i < CAPACITY; i++) {
        const alpha = Math.round(150 * Math.max(0, Math.min(1, (LIFETIME - (time - born[i])) / 4)));
        if (colors[i * 16 + 3] === alpha) continue;
        for (let v = 0; v < 4; v++) colors[i * 16 + v * 4 + 3] = alpha;
        changed = true;
      }
      if (!changed) return;
      if (dirty) mesh.setPositions(positions);
      mesh.setColors32(colors);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      dirty = false;
    },
    destroy() { entity.destroy(); mesh.destroy(); material.destroy(); },
  };
}
