# Broken Cars

A local, server-authoritative multiplayer party racing prototype. The host opens a waiting room, players scan its QR code, and the host starts a shared one-minute car-building round once everyone has joined. Every submitted car receives three or four broken parts before the first race. After each ride, players get one minute to report one concrete problem and repair at most that one defect before racing again.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3001` on the host computer. For the demo, connect the host and every phone to the `STARLINK` Wi-Fi access point. The host screen displays that network name, and the QR code automatically uses the first LAN IPv4 address. If the QR code chooses the wrong network adapter, set `PUBLIC_URL` before starting the server.

The default defect selector is local, random, and needs no account or internet access. To let OpenAI interpret each player's must-have details and assign varied, compatible defects, create a gitignored `.env` file:

```dotenv
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-5-nano
```

The default API model is `gpt-5-nano`; override it with `OPENAI_MODEL` if needed. Car prompts are sent to OpenAI only when `LLM_PROVIDER=openai` is enabled. Explicit requirements are treated as hard constraints, so a player asking for round wheels cannot receive square or missing wheels. The server also minimizes repeated defects across players in the same room. If the API fails, the build stays open and the host sees an error instead of silently assigning potentially conflicting defects.

Tuning reports use the same selector. A concrete symptom such as `it slides like ice` can repair `no_grip`, but a generic request such as `make the car fully working` repairs nothing. The server enforces a maximum of one removed defect per car per tuning round independently of the model response.

## Architecture

- React + Vite for the host screen and individual phone controller.
- Express serves rooms and the web client from one LAN-accessible port.
- WebSockets carry room state, prompt submissions, and live control intent.
- `server/game.js` exports one framework-independent `BrokenCarsGame` object. It owns the complete public integration surface: rooms, prompts, races, tuning, repairs, controls, ticks, and privacy-filtered snapshots.
- `server/game-engine.js` contains the state machine and physics. OpenAI/local selectors are injected into `BrokenCarsGame`, so tests and future transports can replace them without touching game rules.
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
