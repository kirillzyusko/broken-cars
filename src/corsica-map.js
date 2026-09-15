import * as pc from "playcanvas";
import { warmMapFoliage } from "./map-foliage-color.js";
import track from "./corsica-track.json" with { type: "json" };

let physicsReady;
export function loadPhysics() {
  physicsReady ??= new Promise((resolve, reject) => {
    pc.WasmModule.setConfig("Ammo", {
      glueUrl: "/physics/ammo.wasm.js",
      wasmUrl: "/physics/ammo.wasm.wasm",
      fallbackUrl: "/physics/ammo.js",
      errorHandler: (error) => reject(new Error(`Physics failed to load: ${error}`)),
    });
    pc.WasmModule.getInstance("Ammo", (ammo) => {
      window.Ammo = ammo;
      resolve();
    });
  });
  return physicsReady;
}

function loadContainer(app, url) {
  return new Promise((resolve, reject) => {
    app.assets.loadFromUrl(url, "container", (error, asset) => {
      if (error) reject(new Error(`Could not load Corsica GP: ${error}`));
      else resolve(asset);
    });
  });
}

export async function loadCorsicaMap(app, isCancelled) {
  const [visualAsset, collisionAsset] = await Promise.all([
    loadContainer(app, track.visualUrl),
    loadContainer(app, track.collisionUrl),
  ]);
  if (isCancelled()) return null;
  const visual = visualAsset.resource.instantiateRenderEntity({ castShadows: true });
  visual.name = "Corsica GP / scenery";
  warmMapFoliage(visual);
  app.root.addChild(visual);
  for (const render of visual.findComponents("render")) {
    const bounds = track.instanceBounds[render.entity.name];
    if (bounds) {
      const aabb = new pc.BoundingBox();
      aabb.setMinMax(new pc.Vec3(...bounds.min), new pc.Vec3(...bounds.max));
      for (const mesh of render.meshInstances) {
        mesh.setCustomAabb(aabb);
        mesh.cull = true;
      }
    }
    if (/Ocean|grass|flowers|patch-/i.test(render.entity.name)) render.castShadows = false;
  }

  const collision = collisionAsset.resource.instantiateRenderEntity();
  collision.name = "Corsica GP / static collision";
  app.root.addChild(collision);
  const meshes = collision.findComponents("render");
  if (meshes.length !== track.collisionChunks.length) throw new Error("The map collision export is incomplete.");
  for (const render of meshes) {
    const entity = render.entity;
    entity.tags.add("map-solid");
    if (entity.name === "COL_road") entity.tags.add("race-road");
    entity.addComponent("collision", { type: "mesh", renderAsset: render.asset });
    entity.addComponent("rigidbody", { type: "static", friction: 0.85, restitution: 0 });
    render.enabled = false;
  }
  // Fail clearly if the physics library or coordinate conversion left the grid unsupported.
  const startHit = app.systems.rigidbody.raycastFirst(
    new pc.Vec3(0, 2, 0), new pc.Vec3(0, -2, 0), { filterTags: ["race-road"] },
  );
  if (!startHit || Math.abs(startHit.point.y) > 0.05) throw new Error("The start line does not match its road collider.");
  return { visual, collision, chunks: meshes.length };
}
