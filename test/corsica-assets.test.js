import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import track from "../src/corsica-track.json" with { type: "json" };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const assetPath = (name) => new URL(`../public/maps/corsica-gp/${name}`, import.meta.url).pathname;

test("collision GLB contains all static chunks and no decorative geometry", async () => {
  const doc = await io.read(assetPath("collision.glb"));
  const meshes = doc.getRoot().listMeshes();
  assert.equal(meshes.length, track.collisionChunks.length);
  assert.equal(doc.getRoot().listMaterials().length, 0);
  let triangles = 0;
  for (const mesh of meshes) {
    assert.match(mesh.getName(), /^COL_/);
    for (const primitive of mesh.listPrimitives()) {
      assert.equal(primitive.getMode(), 4);
      assert.deepEqual(primitive.listSemantics(), ["POSITION"]);
      triangles += primitive.getIndices().getCount() / 3;
    }
  }
  assert.equal(triangles, track.collisionTriangles);
  assert.ok(track.collidingAssets.includes("tree"));
  assert.ok(track.collidingAssets.includes("block-grass-overhang-large"));
  for (const asset of track.collidingAssets) {
    assert.ok(!track.collisionExcludedAssets.includes(asset), `${asset} must not collide`);
    assert.doesNotMatch(asset, /^(patch-|flower|grass-)/);
  }
  assert.ok(track.decorativeObjects > 1500);
});

test("visual GLB retains every authored object and embeds its textures", async () => {
  const doc = await io.read(assetPath("visual.glb"));
  let objects = 0;
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const batch = node.getExtension("EXT_mesh_gpu_instancing");
    objects += batch ? batch.listAttributes()[0].getCount() : 1;
    if (batch) {
      const bounds = track.instanceBounds[node.getName()];
      assert.ok(bounds);
      assert.ok(bounds.min.every((v, i) => Number.isFinite(v) && v <= bounds.max[i]));
    }
  }
  assert.equal(objects, track.authoredObjects);
  assert.ok(doc.getRoot().listTextures().length > 0);
  for (const texture of doc.getRoot().listTextures()) assert.ok(texture.getImage().byteLength > 0);
  const published = JSON.parse(await readFile(assetPath("track.json")));
  assert.deepEqual(published, track);
});
