# Modular kart

## Files

- `kart-round.glb`: assembled kart with four round tires and the original `Idle` clip.
- `kart-square.glb`: the same kart and clip with four square tires.
- `wheel-round.glb` and `wheel-square.glb`: standalone tires with matching mount origins.
- `kart.json`: mesh names, attachment points, defect mapping, and file sizes.

The editable source is `art/kart/kart-modular.blend` in the workspace folder above `broken-cars`. Textures are packed into the Blender file and embedded in each GLB. The `Wheel library` collection contains hidden source objects for both tires. Unhide them to edit a tire, or switch an assembled wheel's mesh data between `Wheel.Round.Mesh` and `Wheel.Square.Mesh`.

## Parts

| Mesh node | Contents |
| --- | --- |
| `Part.Chassis` | Body, seat, and suspension |
| `Part.EngineAssembly` | Engine, belts, and both exhausts |
| `Part.SteeringWheel` | Steering wheel |
| `Part.Wheel.FL`, `FR`, `RL`, `RR` | Four individually removable tires |

Disable the part's render component to remove it. Keep the skeleton and mount nodes. The engine and steering wheel retain their weights on the shared skeleton; do not detach or rotate those skinned mesh nodes to change their placement.

For a backwards engine, rotate `EngineMount` by a fixed 180 degrees about its local Y axis after its rest rotation. This mount has no animation track. The engine, belts, and exhausts follow it while the original idle clip plays. Restore the rest rotation when repaired.

## Wheels

Each wheel mesh is a child of `WheelMount.FL`, `FR`, `RL`, or `RR`. Replace that child with the chosen standalone wheel at an identity local transform. Keep the mount's transform. Both tires use meters and share an inboard axle origin; the axle points along local -Z in GLB and local +Y in Blender.

For sideways mounting, rotate the child mesh 90 degrees about its local Y axis in the game. Hide the four wheel meshes for missing wheels. These are fixed placements; there is no wheel spin or wobble animation.

The square tire keeps the source tire's round hub and UV atlas. Its outer corners have an approximately 26 mm radius on a 491 mm wide square profile. The original rounded shoulders soften the edges across the tire width. Both tires share `Kart_BaseColor.png` and `Kart_ORM.png`; ORM uses red for occlusion, green for roughness, and blue for metallic.

## Animation and game integration

The only clip is the supplied `Idle` animation. It moves the engine, belts, and exhausts. No steering, wheel spin, wobble, or other motion was added. The original clip has 30 frames at 30 fps. Unit conversion changes its stored translation values while preserving the motion in meters.

The GLB uses +Y up and -Z forward. The rig and mounts use meters. All original bone names remain, with one added fixed `EngineMount` bone for installation angle.

Brake, cooling, seatbelt, pedal, grip, engine-power, steering-control, and loose-wheel defects remain UI and driving behavior. All 16 defect IDs in the current game are covered by `kart.json`.

The multiplayer race and `/map/drive` use the same kart loader. It loads the round kart and square tire once per scene, gives each car its own skeleton, and keeps the original texture atlas. Defect updates hide or restore meshes and change fixed mounting angles without restarting `Idle`.

The game keeps the kart 1.4 meters long and uses a uniform scale to fit the painted starting slots. `kart.json` stores bounds measured after skinning and the front-axle position. The shared server and client collision dimensions come from those measurements. Tire contact starts at road height, and the front wheel mounts align with the car's yaw pivot. The collision box stays the same when parts are missing.

## Rebuild

From `broken-cars`, run Blender with `--background --factory-startup --python scripts/prepare-kart.py`, then run `node scripts/pack-kart.js`.

The Blender script reads the source FBX files and textures from the sibling `art/kart/source` folder. It preserves the input files, checks all 30 frames against the source geometry, and writes the editable Blender file and GLBs. Packing deduplicates shared data while retaining every named node, then measures the posed geometry for the shared collision dimensions.

The latest preparation and export comparison reports are beside the Blender file. Both exported kart variants were re-imported and compared at five frames. The largest vertex position difference was below 0.003 mm. No rendered or in-game visual checks were run.
