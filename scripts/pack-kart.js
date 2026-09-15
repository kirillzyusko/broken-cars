import { readFile, writeFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune } from "@gltf-transform/functions";
import { measureKart } from "./measure-kart.js";

const directory = new URL("../public/models/kart/", import.meta.url);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = ["kart-round.glb", "kart-square.glb", "wheel-round.glb", "wheel-square.glb"];
const sizes = {};
let geometry;

for (const file of files) {
  const path = new URL(file, directory).pathname;
  const document = await io.read(path);
  if (file === "kart-round.glb") geometry = measureKart(document);
  const names = document.getRoot().listNodes().map((node) => node.getName());
  await document.transform(dedup(), prune({ keepLeaves: true, keepAttributes: true }));
  const after = new Set(document.getRoot().listNodes().map((node) => node.getName()));
  for (const name of names) {
    if (!after.has(name)) throw new Error(`Packing removed the named node ${name}`);
  }
  await io.write(path, document);
  sizes[file] = (await readFile(path)).byteLength;
}

const manifest = {
  units: "meters",
  up: "+Y",
  forward: "-Z",
  defaultModel: "kart-round.glb",
  squareModel: "kart-square.glb",
  animation: "Idle",
  newAnimations: false,
  geometry,
  parts: {
    chassis: "Part.Chassis",
    engineAssembly: "Part.EngineAssembly",
    steeringWheel: "Part.SteeringWheel",
  },
  engineMount: "EngineMount",
  wheels: {
    round: "wheel-round.glb",
    square: "wheel-square.glb",
    axleAxisInWheelAsset: "-Z",
    slots: Object.fromEntries(["FL", "FR", "RL", "RR"].map((slot) => [slot, {
      mount: `WheelMount.${slot}`,
      defaultMeshNode: `Part.Wheel.${slot}`,
    }])),
  },
  visualDefects: {
    no_wheels: "Hide the four wheel mesh nodes. Keep their mounts and bones.",
    square_wheels: "Replace the four wheel meshes with wheel-square.glb at identity local transform.",
    sideways_wheels: "Rotate the wheel mesh children by a fixed 90 degrees about their local Y axis.",
    no_engine: "Hide Part.EngineAssembly, including its belts and exhausts. Keep the rig.",
    backwards_engine: "Apply a fixed 180 degree local Y rotation after the rest rotation of EngineMount.",
    no_steering: "Hide Part.SteeringWheel. Keep its bone.",
  },
  uiOnlyDefects: [
    "loose_wheel", "no_brakes", "no_cooling", "no_seatbelt", "swapped_pedals",
    "stuck_accelerator", "no_grip", "bad_engine_power", "reversed_steering", "one_way_steering",
  ],
  notes: [
    "Rigid wheel GLBs use the same origin and local coordinate space as the default wheel mesh children.",
    "Only replace the child mesh under each WheelMount; preserve the mount transform and its scale.",
    "Skinned engine and steering meshes use the existing kart skeleton. Disable their render components to hide them.",
    "EngineMount has no animation channel and can hold a fixed installation rotation.",
    "Loose-wheel wobble, wheel spin, steering motion, and other new animations are intentionally absent.",
  ],
  fileBytes: sizes,
};
await writeFile(new URL("kart.json", directory), JSON.stringify(manifest, null, 2) + "\n");
console.log(sizes);
