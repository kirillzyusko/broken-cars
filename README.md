# Broken Cars

A local, server-authoritative multiplayer party racing prototype. The host opens a waiting room, players scan its QR code, and the host starts a shared car-building round once everyone has joined. PlayCanvas renders a simple road, synchronized box cars, and three lane barriers. The cars use responsive arcade-kart acceleration and grip without drifting or jumping. Every car has the same 1,000 kg mass; collisions exchange two-dimensional linear momentum, apply angular impulse on off-centre hits, and rebound from static barriers. After a finish, the host can start a rematch with the same cars.

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
  a lightweight 3D road and synchronized box cars once a race starts.
- Express serves rooms and the web client from one LAN-accessible port.
- WebSockets carry room state, prompt submissions, and live control intent.
- `server/game.js` exports one framework-independent `BrokenCarsGame` object. It owns the complete public integration surface: rooms, prompts, races, tuning, repairs, controls, ticks, and privacy-filtered snapshots.
- `server/game-engine.js` contains the state machine, arcade-kart driving model, swept collision detection, and impulse response. Cars carry world-space velocity and angular velocity. Equal-mass car impacts conserve linear momentum with restitution and contact friction; static barriers reflect the contact-normal velocity so fast cars cannot tunnel through them.
- `shared/race-config.js` is the single geometry source for the server colliders and the PlayCanvas road, grid, cars, and barriers.
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
