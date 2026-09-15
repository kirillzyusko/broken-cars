import { readFileSync } from "node:fs";
import track from "../public/maps/corsica-gp/track.json" with { type: "json" };
import { createDrivingWorld } from "../shared/driving-world.js";
let world;
export function getDrivingWorld() {
  if (!world) {
    const bytes = readFileSync(new URL(`../public${track.collisionUrl}`, import.meta.url));
    world = createDrivingWorld(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  return world;
}
