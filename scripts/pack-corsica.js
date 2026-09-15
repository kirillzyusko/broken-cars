import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, instance, prune, weld } from "@gltf-transform/functions";

const source = new URL("../.cache/corsica-gp/", import.meta.url);
const output = new URL("../public/maps/corsica-gp/", import.meta.url);
await mkdir(output, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const visual = await io.read(new URL("visual.glb", source).pathname);
await visual.transform(dedup(), flatten(), prune());

// Instance within small cells so the renderer can cull scenery behind the camera.
const main = visual.getRoot().getDefaultScene();
const cells = new Map();
const boundsByCell = new Map();
for (const node of main.listChildren()) {
  const [x, , z] = node.getWorldTranslation();
  const key = `${Math.floor(x / 32)}_${Math.floor(z / 32)}`;
  if (!cells.has(key)) {
    cells.set(key, visual.createScene(key));
    boundsByCell.set(key, new Map());
  }
  const mesh = node.getMesh();
  if (mesh) {
    const bounds = getBounds(node);
    const previous = boundsByCell.get(key).get(mesh);
    if (previous) {
      bounds.min = bounds.min.map((v, i) => Math.min(v, previous.min[i]));
      bounds.max = bounds.max.map((v, i) => Math.max(v, previous.max[i]));
    }
    boundsByCell.get(key).set(mesh, bounds);
  }
  main.removeChild(node);
  cells.get(key).addChild(node);
}
await visual.transform(instance({ min: 3 }));
const instanceBounds = {};
for (const [key, cell] of cells) {
  cell.listChildren().forEach((node, index) => {
    if (node.getExtension("EXT_mesh_gpu_instancing")) {
      node.setName(`Scenery / ${key} / ${index}`);
      instanceBounds[node.getName()] = boundsByCell.get(key).get(node.getMesh());
    }
    cell.removeChild(node);
    main.addChild(node);
  });
  cell.dispose();
}
await visual.transform(prune());
await io.write(new URL("visual.glb", output).pathname, visual);
await import("./extract-start-lights.js");

const collision = await io.read(new URL("collision.glb", source).pathname);
await collision.transform(weld(), dedup(), prune());
await io.write(new URL("collision.glb", output).pathname, collision);
const manifest = JSON.parse(await readFile(new URL("track.json", source)));
const report = JSON.parse(await readFile(new URL("export-report.json", source)));
manifest.instanceBounds = instanceBounds;
manifest.authoredObjects = report.objects;
manifest.solidObjects = report.solidObjects.length;
manifest.decorativeObjects = report.nonCollidingObjects.length;
manifest.collisionTriangles = report.collisionTriangles;
manifest.collidingAssets = [...new Set(report.solidObjects.map((o) => o.asset).filter(Boolean))].sort();
await writeFile(new URL("track.json", output), JSON.stringify(manifest));
await copyFile(new URL("track.json", output), new URL("../src/corsica-track.json", import.meta.url));
console.log(`Corsica GP: ${report.objects} objects, ${Object.keys(instanceBounds).length} scenery batches, ${report.collisionTriangles} solid triangles.`);
