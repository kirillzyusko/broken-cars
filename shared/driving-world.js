import { CAR_SIZE_WORLD } from "./race-config.js";

// The map exporter bakes collision vertices into world space. Read that same GLB
// in Node and the browser; the server does not need a second approximation of it.
export function createDrivingWorld(buffer) {
  const bytes = new DataView(buffer);
  const jsonLength = bytes.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binaryOffset = 20 + jsonLength + 8;
  const readAccessor = (id) => {
    const a = gltf.accessors[id], view = gltf.bufferViews[a.bufferView];
    const size = a.componentType === 5123 ? 2 : 4;
    const components = a.type === "VEC3" ? 3 : 1;
    const offset = binaryOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const read = a.componentType === 5126 ? "getFloat32" : size === 2 ? "getUint16" : "getUint32";
    return (i, c = 0) => bytes[read](offset + i * (view.byteStride ?? size * components) + c * size, true);
  };
  const cells = new Map();
  const cellSize = 4;
  for (const node of gltf.nodes) {
    if (node.mesh === undefined) continue;
    if (node.matrix || node.translation || node.rotation || node.scale) throw new Error("Driving collision mesh must have baked world transforms.");
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error("Driving collision mesh must contain triangles.");
      const position = readAccessor(primitive.attributes.POSITION);
      const index = readAccessor(primitive.indices);
      for (let i = 0; i < gltf.accessors[primitive.indices].count; i += 3) {
        const points = [0, 1, 2].map((k) => [0, 1, 2].map((c) => position(index(i + k), c)));
        const [a, b, c] = points;
        const e = b.map((v, j) => v - a[j]), f = c.map((v, j) => v - a[j]);
        const normal = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
        const length = Math.hypot(...normal);
        if (length < 1e-10) continue;
        const triangle = { a, e, f, normal: normal.map((v) => v / length), road: node.name === "COL_road" };
        const minX = Math.floor(Math.min(a[0], b[0], c[0]) / cellSize), maxX = Math.floor(Math.max(a[0], b[0], c[0]) / cellSize);
        const minZ = Math.floor(Math.min(a[2], b[2], c[2]) / cellSize), maxZ = Math.floor(Math.max(a[2], b[2], c[2]) / cellSize);
        for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(triangle);
        }
      }
    }
  }
  function raycast(start, end, groundOnly = false) {
    const direction = [end.x - start.x, end.y - start.y, end.z - start.z];
    let closest = null;
    for (let x = Math.floor(Math.min(start.x, end.x) / cellSize); x <= Math.floor(Math.max(start.x, end.x) / cellSize); x++) {
      for (let z = Math.floor(Math.min(start.z, end.z) / cellSize); z <= Math.floor(Math.max(start.z, end.z) / cellSize); z++) {
        for (const triangle of cells.get(`${x},${z}`) ?? []) {
          const { a, e, f, normal } = triangle;
          // Some exported curb tops have reversed winding. Collision triangles
          // are two-sided, so either face can support the kart.
          if (groundOnly ? Math.abs(normal[1]) < 0.55 : Math.abs(normal[1]) > 0.7) continue;
          const p = [direction[1] * f[2] - direction[2] * f[1], direction[2] * f[0] - direction[0] * f[2], direction[0] * f[1] - direction[1] * f[0]];
          const determinant = e[0] * p[0] + e[1] * p[1] + e[2] * p[2];
          if (Math.abs(determinant) < 1e-10) continue;
          const t = [start.x - a[0], start.y - a[1], start.z - a[2]];
          const u = (t[0] * p[0] + t[1] * p[1] + t[2] * p[2]) / determinant;
          if (u < 0 || u > 1) continue;
          const q = [t[1] * e[2] - t[2] * e[1], t[2] * e[0] - t[0] * e[2], t[0] * e[1] - t[1] * e[0]];
          const v = (direction[0] * q[0] + direction[1] * q[1] + direction[2] * q[2]) / determinant;
          if (v < 0 || u + v > 1) continue;
          const fraction = (f[0] * q[0] + f[1] * q[1] + f[2] * q[2]) / determinant;
          if (fraction < 0 || fraction > 1 || (closest && fraction >= closest.fraction)) continue;
          const facing = normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2] > 0 ? -1 : 1;
          closest = { fraction, normal: { x: normal[0] * facing, y: normal[1] * facing, z: normal[2] * facing },
            point: { x: start.x + direction[0] * fraction, y: start.y + direction[1] * fraction, z: start.z + direction[2] * fraction }, road: triangle.road };
        }
      }
    }
    return closest;
  }
  return createGroundedMovement(raycast);
}

export function createGroundedMovement(raycast) {
  const halfHeight = CAR_SIZE_WORLD.y / 2;
  return {
    raycast,
    move(previous, desired, heading) {
      const dx = desired.x - previous.x, dz = desired.z - previous.z;
      const length = Math.hypot(dx, dz);
      let hit = null;
      const angle = heading * Math.PI / 180;
      const footprint = [];
      // Sweep the body perimeter at bumper height, including both side edges.
      for (const x of [-CAR_SIZE_WORLD.x / 2, 0, CAR_SIZE_WORLD.x / 2]) {
        for (const z of [-CAR_SIZE_WORLD.z / 2, 0, CAR_SIZE_WORLD.z / 2]) {
          const offsetX = Math.cos(angle) * x - Math.sin(angle) * z;
          const offsetZ = Math.sin(angle) * x + Math.cos(angle) * z;
          footprint.push({ x: offsetX, z: offsetZ });
          if (length < 1e-9) continue;
          const start = { x: previous.x + offsetX, y: previous.y + 0.02, z: previous.z + offsetZ };
          const next = raycast(start, { x: start.x + dx, y: start.y, z: start.z + dz });
          if (next && (!hit || next.fraction < hit.fraction)) hit = next;
        }
      }
      const amount = hit ? Math.max(0, hit.fraction - 0.02 / length) : 1;
      const position = { x: previous.x + dx * amount, y: previous.y, z: previous.z + dz * amount };
      // Keep the rigid kart above the highest support under its footprint.
      // A centre-only ray drops the wheels through curbs when straddling grass.
      let ground = null;
      let centreGround = null;
      for (const offset of footprint) {
        const point = { x: position.x + offset.x, z: position.z + offset.z };
        const support = raycast({ ...point, y: previous.y - halfHeight + 0.2 }, { ...point, y: previous.y - halfHeight - 0.65 }, true);
        if (offset.x === 0 && offset.z === 0) centreGround = support;
        if (support && (!ground || support.point.y > ground.point.y)) ground = support;
      }
      if (!ground || ground.point.y < -0.6) return { recover: true };
      position.y = ground.point.y + halfHeight;
      return { position, offRoad: !(centreGround ?? ground).road, hit };
    },
  };
}
