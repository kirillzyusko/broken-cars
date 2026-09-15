# Broken Cars

A local, server-authoritative multiplayer party racing prototype. The host opens a waiting room, players scan its QR code and claim a seat, and the host starts a shared 15-second car-building round once everyone has joined. PlayCanvas renders Corsica GP, synchronized modular karts, and three lane barriers. Cars use responsive arcade acceleration, grip, and steering; holding the brake at a standstill reverses. Each car has a 1,000 kg mass; impacts transfer momentum, spin cars on off-center hits, and rebound from barriers. In the default arcade mode the host starts a rematch with the same cars after each finish. With broken-parts mode enabled, every submitted car receives three or four broken parts before the first race, and after each ride players get 30 seconds to send one message to the garage, which repairs at most one concretely described defect before racing again.

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

## Client

The screens follow the Claude Design handoff: a sticker-card arcade look with thick ink outlines, hard offset shadows, and three self-hosted typefaces (Baloo 2, Nunito, JetBrains Mono via `@fontsource`), so the demo needs no internet for fonts.

- `src/host/` renders the TV. `HostScreen.jsx` maps room phases to six screens (join, prompt time, grid, race, standings, final) inside `TvStage.jsx`, a fixed 1920×1080 stage scaled uniformly to any display. The race screen shows one broadcast camera of Corsica GP through `src/RaceView.jsx`, a bare-canvas wrapper around `src/race-scene-runtime.js`, with a HUD card per kart on top; loading the island once per screen keeps the TV to a single map instance. `src/RaceScene.jsx` remains the framed panel used by the map preview page. The host's only controls are the yellow buttons that advance the round.
- `src/player/` renders the phone. `PlayerScreen.jsx` maps phases to the claim-a-seat screen (name and colour, stored by the server and locked once the build starts), the waiting room, the one-shot prompt screen, the sent/hold states, the driving controller with a driver-view 3D scene above the pads, and the round result.
- `src/lib/` holds UI-only game logic: seat colours, cross-round standings and points (kept in `sessionStorage`, because the server only carries the current race), each player's prompt history, and `shouts.js`, which turns a defect the player runs into during a race into a driver speech bubble.
- `src/styles/` has the design tokens plus one stylesheet per surface. `src/styles.css` is the older stylesheet, loaded only by the map preview and test pages under `/map`.

Holding the brake slows a rolling kart to a stop and then reverses it (a backwards engine makes that the way forward). In arcade mode (the default) no parts are missing, the driver only remarks on collisions, and the host races the same karts again after each sprint; the final podium shows after four sprints. Defects are never listed on screen. A phone reveals a part only through the driver's speech bubble once the player uses the affected control, and never within the first ten seconds after that player's first input in a round, and the TV mirrors public car state (overheating, a stuck throttle, finishing) inside that player's camera quadrant. The shout lines use the same wording the repair selector understands, so repeating what the driver said fixes the part.

## Architecture

- React + Vite for the TV screen and individual phone controller (see Client above). PlayCanvas renders
  the full Corsica GP island circuit and synchronized cars on the TV and on the phone while driving.
- Express serves rooms and the web client from one LAN-accessible port.
- WebSockets carry room state, seat claims, prompt submissions, and live control intent.
- `server/game.js` exports one framework-independent `BrokenCarsGame` object. It owns the complete public integration surface: rooms, prompts, races, tuning, repairs, controls, ticks, and privacy-filtered snapshots.
- `server/game-engine.js` runs the state machine, arcade driving model, swept collision detection, and impulse response. Velocity and heading use world coordinates. Car contacts use world-space bounds adjusted for heading, with restitution and friction.
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
game.setPlayerProfile(room.id, playerId, { name: "Denise", color: "blue" });
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

The [kart driving test](http://localhost:3001/map/drive) uses the same free driving code as multiplayer, with world positions and a chase camera that follows the kart's heading. WASD or arrow keys drive; hold S/down to brake, then reverse; Space only brakes; R resets the sandbox. Acceleration is quick, steering tightens at low speed, and releasing steering holds the chosen direction. There is no drift or jump input, and the kart keeps its existing Idle animation.

The chase camera in `src/kart-camera.js` follows the kart's position directly and eases its rotation through turns. It keeps the kart below screen centre, adds a small speed-based change in distance and field of view, and checks the centre and edges of the camera against scenery. Resets and camera switches snap to the new car. Framing is based on [Nintendo's Mario Kart 8 Deluxe cornering footage](https://www.nintendo.com/jp/ichikara/aabpa/02_en.html); camera distances and timing are tuned for this game's kart.

See [driving feel](docs/driving-feel.md) for the Mario Kart research, handling choices, and measured changes to steering and acceleration.

Both modes run `shared/kart-driving.js` at 120 steps per second and use the exported map collision mesh through `shared/driving-world.js`. Grass reduces speed; leaving supported ground returns the kart to its last checkpoint. Multiplayer also resolves car and race-barrier collisions. Ordered checkpoint crossings measure the 500 m lap without constraining movement. Room protocol 5 sends `worldPosition` in metres and a clockwise `heading` in degrees; forward at zero heading is negative Z. Restart the Node server after changing shared driving code.

Both sandbox and multiplayer start with two seconds of READY, then 3, 2, 1 and GO. The gantry lights fill red from top to bottom and turn green on GO. The same clock drives the lights, numbers and beeps. Hold the accelerator to rev while the kart waits; movement stays locked until GO. R resets the sandbox and repeats the start. Multiplayer uses the server start time, so every client sees the same sequence.

The sandbox has no room, lap timer, or persistent driving HUD. It loops the race background music and shares the saved Music on/off setting. Its canvas emits `kart-audio-state` events with speed in metres per second, throttle, brake, steering, and estimated RPM. Driving audio now uses the local kart mixer described below.

Open [the graphics test level](http://localhost:3001/map/graphics) for four fixed cameras in a full-screen 2×2 grid. Top left shows the island, top right the start line, bottom left the mountain road at driver height, and bottom right the coast. The page has no HUD, controls, cars, or room connection. All views share one map and the race settings in `src/race-lighting.js`, `src/race-water.js`, and `src/race-skybox.js`. Camera positions live in `src/map-graphics-runtime.js`.

Open [the map preview](http://localhost:3001/map) to explore the island without creating a room. Use the camera menu for a whole-island view, broadcast camera, chase camera, or driver view. The lap slider lets you inspect any part of the track.

The game loads `public/maps/corsica-gp/visual.glb` and `collision.glb` through PlayCanvas's container loader. The visual export keeps all 3,668 authored objects, including sponsor textures. Repeated scenery uses 284 GPU batches, grouped into 32-meter cells with bounds for camera culling. The visual GLB is about 2.2 MB; the collision GLB is about 3.2 MB. Textures are embedded and Ammo runs from `public/physics/`, so map loading needs no external CDN.

The collision GLB contains 40 static triangle meshes with 253,414 triangles. Terrain, road, curbs, trees, rocks, gantry supports and solid props collide. Flowers, grass, plants, mushrooms, ground patches, water, lettering and road paint have no colliders. The runtime keeps collision meshes hidden and adds PlayCanvas mesh collision and static rigidbody components. Original Kenney licenses ship with the map.

The ocean uses `src/race-water.js` for animated texture distortion, two layers of curved highlights, and a subtle sky reflection. `src/water-textures.js` generates seamless patterns locally. The effect follows the texture-coordinate distortion approach in [DragoniteSpam's ShaderWaterTexture](https://github.com/DragoniteSpam-GameMaker-Tutorials/ShaderWaterTexture), with original procedural textures. It changes only the material: the ocean stays flat, opaque, and without a collider.

Lighting in `src/race-lighting.js` uses a high summer sun, soft filtered shadows, neutral sky fill, warm ambient light, and a small warm ground bounce. Neutral tone mapping preserves the bright green, coral, and turquoise palette while keeping white signs readable. PlayCanvas CameraFrame adds full-resolution, blurred SSAO to the ambient lighting, using a 1.5-meter radius and 16 samples for contact depth beneath props and terrain ledges. The frame keeps the neutral tone mapping and multisample antialiasing.

The sky uses the supplied Tokyo Blur texture at `public/skyboxes/tokyo-blur.png`. The loader preserves its upper hemisphere and extends its pale horizon color below the horizon before converting it to a cubemap. Distance fog uses the same sampled color, fading from 240 to 580 meters. The ocean uses brighter sky-blue and cyan tones. These settings also apply to the four-camera graphics test. Source details are in `public/skyboxes/tokyo-blur-source.txt`.

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

## Background music

“Choose Your Racer” loops on the home screen and during waiting, building, tuning, and the countdown. The host switches to “Retro Roundabout” when racing begins and keeps it through the results. Both tracks play at 35% volume. Browsers may require a click or keypress before playback starts. The Music button saves the mute setting. Phone controllers and map inspection pages stay silent. `public/audio/choose-your-racer.mp3` and `public/audio/retro-roundabout.mp3` are compressed copies of the user-supplied WAV files.


### Kart sounds

Driving sounds use the [Mario Kart 8 kart sound pack](https://sounds.spriters-resource.com/wii_u/mariokart8/asset/398013/) selected for this prototype. Six samples live in `public/audio/kart`; source filenames, hashes, and original loop markers are in its manifest. See that folder's README for the import command.

`src/kart-audio.js` mixes three persistent engine loops per audible kart: idle, low revs, and high revs. Speed and throttle set engine load and RPM; gain, pitch, and filtering ease between states without restarting a recording. Nearby rivals are quieter and pan left or right. Braking and throttle-release effects play as separate voices with cooldowns, so they can finish naturally. A compressor limits the combined level. The existing music remains separate.

Press a driving key or click the game to enable browser audio. **H** sounds the horn locally; **M** mutes driving sounds. Hidden tabs pause audio; a key or click resumes it. Leaving the scene closes its audio context and releases all voices. The sandbox and multiplayer use the same mixer; multiplayer throttle and brake telemetry loads after the existing Node server restarts.
