# Broken Cars

A local, server-authoritative multiplayer party racing prototype. The host opens a waiting room, players scan its QR code, and the host starts a shared car-building round once everyone has joined. PlayCanvas renders Corsica GP, synchronized box cars, and three lane barriers. Cars use responsive arcade acceleration, grip, and steering. Each car has a 1,000 kg mass; impacts transfer momentum, spin cars on off-center hits, and rebound from barriers. After a finish, the host can start a rematch with the same cars.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3001` on the host computer. For the demo, connect the host and every phone to the `STARLINK` Wi-Fi access point. The host screen displays that network name, and the QR code automatically uses the first LAN IPv4 address. If the QR code chooses the wrong network adapter, set `PUBLIC_URL` before starting the server.

Broken-parts mode is currently disabled by default so the basic race can be tested without simulated failures. To restore that experimental mode, set `ENABLE_BROKEN_PARTS=true`. Its default defect selector is local and needs no account or internet access. To let OpenAI interpret player requests in that mode, create a gitignored `.env` file:

```dotenv
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-5-nano
ENABLE_BROKEN_PARTS=true
```

The default API model is `gpt-5-nano`; override it with `OPENAI_MODEL` if needed. Car prompts are sent to OpenAI only when `LLM_PROVIDER=openai` is enabled. Explicit requirements are treated as hard constraints, so a player asking for round wheels cannot receive square or missing wheels. The server also minimizes repeated defects across players in the same room. If the API fails, the build stays open and the host sees an error instead of silently assigning potentially conflicting defects.

Tuning reports use the same selector. A concrete symptom such as `it slides like ice` can repair `no_grip`, but a generic request such as `make the car fully working` repairs nothing. The server enforces a maximum of one removed defect per car per tuning round independently of the model response.

## Architecture

- React + Vite for the host screen and individual phone controller. PlayCanvas renders
  the full Corsica GP island circuit and synchronized cars once a race starts.
- Express serves rooms and the web client from one LAN-accessible port.
- WebSockets carry room state, prompt submissions, and live control intent.
- `server/game.js` exports one framework-independent `BrokenCarsGame` object. It owns the complete public integration surface: rooms, prompts, races, tuning, repairs, controls, ticks, and privacy-filtered snapshots.
- `server/game-engine.js` runs the state machine, arcade driving model, swept collision detection, and impulse response. Velocity and heading use track-relative coordinates: forward along the circuit and sideways across it. Car contacts use axis-aligned boxes in that space, with restitution and friction.
- `shared/race-config.js` shares the map scale, road width, grid, car sizes, and barriers between server physics and rendering. The renderer wraps those coordinates onto the exported centerline and adds steering and impact yaw to the track direction.
- OpenAI/local selectors are injected into `BrokenCarsGame`, so tests and future transports can replace them without touching game rules.
- WebSockets are only a transport adapter. React consumes snapshots and calls semantic actions from `useGameSocket` (`startBuild`, `submitCarPrompt`, `startRace`, `startTuning`, `submitRepair`, `startNextRace`, `setControls`). A UI redesign does not need to know packet shapes.
- Room state is in memory for this local prototype and expires after six hours. Restarting the server clears it.

Direct server-side integration looks like this:

```js
import { createGame } from "./server/game.js";

const game = createGame();
const room = game.createRoom();
game.joinPlayer(room.id, playerId);
game.startBuild(room.id, room.hostToken);
game.submitCarPrompt(room.id, playerId, prompt);
const state = game.getState(room, { viewerPlayerId: playerId });
```

## Commands

```bash
npm run dev      # development server (restart after server edits)
npm run dev:fast # 15s build/tuning windows and a 10s race for manual testing
npm test         # core game-engine tests
npm run test:openai # two live API smoke calls; requires .env
npm run build    # production client bundle
npm start        # serve the built client
npm run check    # tests and production build
```

## Corsica GP map

Open [the map preview](http://localhost:3001/map) to explore the island without creating a room. Use the camera menu for a whole-island view, broadcast camera, chase camera, or driver view. The lap slider lets you inspect any part of the track.

The game loads `public/maps/corsica-gp/visual.glb` and `collision.glb` through PlayCanvas's container loader. The visual export keeps all 3,668 authored objects, including sponsor textures. Repeated scenery uses 284 GPU batches, grouped into 32-meter cells with bounds for camera culling. The visual GLB is about 2.2 MB; the collision GLB is about 3.2 MB. Textures are embedded and Ammo runs from `public/physics/`, so map loading needs no external CDN.

The collision GLB contains 40 static triangle meshes with 253,414 triangles. Terrain, road, curbs, trees, rocks, gantry supports and solid props collide. Flowers, grass, plants, mushrooms, ground patches, water, lettering and road paint have no colliders. The runtime keeps collision meshes hidden and adds PlayCanvas mesh collision and static rigidbody components. Original Kenney licenses ship with the map.

The ocean uses `src/race-water.js` for animated texture distortion, two layers of curved highlights, and a subtle sky reflection. `src/water-textures.js` generates seamless patterns locally. The effect follows the texture-coordinate distortion approach in [DragoniteSpam's ShaderWaterTexture](https://github.com/DragoniteSpam-GameMaker-Tutorials/ShaderWaterTexture), with original procedural textures. It changes only the material: the ocean stays flat, opaque, and without a collider.

Lighting in `src/race-lighting.js` uses a high summer sun, soft filtered shadows, blue sky fill, and a small warm ground bounce. Neutral tone mapping preserves the bright green, coral, and turquoise palette while keeping white signs readable. PlayCanvas CameraFrame adds full-resolution, blurred SSAO to the ambient lighting, using a 1.5-meter radius and 16 samples for contact depth beneath props and terrain ledges. The frame keeps the neutral tone mapping and multisample antialiasing.

The sky uses Kenney's day panorama from `public/skyboxes/skybox-day.png`, converted to a cubemap by PlayCanvas. Its CC0 license ships beside the image.

Coordinates use meters, Y up, and negative Z forward at the start line. Server race distance follows the exported centerline through one 500-meter lap. Steering moves across the road and the cameras follow the corners. Grid positions begin behind the gantry.

**The server owns vehicle motion and car/barrier impacts.** Client cars have kinematic bodies; static map meshes support local physics objects and camera obstruction checks. The server does not simulate collisions against the island GLB. Its road-relative model keeps cars on the circuit. Grid staggering fades over the first 40 meters so all racers finish at the same 500-meter progress; collision corrections use the inverse mapping.

### Export a map revision

Run from `broken-cars` on a machine with Blender installed:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b ../art/monza-island/isola-grand-prix-platforms.blend --python scripts/export-corsica.py
npm run map:pack
```

The Blender step reads the saved scene without changing it. It writes temporary exports to `.cache/corsica-gp/`. The pack step writes the public GLBs, map metadata, and the matching route in `src/corsica-track.json`. Keep both metadata copies together. No geometry simplification changes the authored shapes.

`npm test` checks route closure, lane bounds, start/finish alignment, object preservation, embedded textures, and the collision exclusions. In development, the preview's “Check road collisions” button casts 500 rays into the actual loaded road collider. The initial engine check returned 500/500 hits, with all 40 mesh colliders loaded.
