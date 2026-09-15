# Broken Cars

A local, server-authoritative multiplayer party racing prototype. The host opens a waiting room, players scan its QR code, and the host starts a shared one-minute car-building round once everyone has joined. Every submitted car receives one or two broken parts before the race.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3001` on the host computer. For the demo, connect the host and every phone to the `STARLINK` Wi-Fi access point. The host screen displays that network name, and the QR code automatically uses the first LAN IPv4 address. If the QR code chooses the wrong network adapter, set `PUBLIC_URL` before starting the server.

The default defect selector is local, random, and needs no account or internet access. To let OpenAI interpret each player's must-have details and assign varied, compatible defects, start with:

```bash
LLM_PROVIDER=openai OPENAI_API_KEY=your_key npm run dev
```

The default API model is `gpt-5-nano`; override it with `OPENAI_MODEL` if needed. Car prompts are sent to OpenAI only when `LLM_PROVIDER=openai` is enabled. Explicit requirements are treated as hard constraints, so a player asking for round wheels cannot receive square or missing wheels. The server also minimizes repeated defects across players in the same room. If the API fails, the build stays open and the host sees an error instead of silently assigning potentially conflicting defects.

## Architecture

- React + Vite for the host screen and individual phone controller.
- Express serves rooms and the web client from one LAN-accessible port.
- WebSockets carry room state, prompt submissions, and live control intent.
- The Node game engine owns the waiting-room lock, shared build timer, countdowns, controls, physics, defects, finishing order, disconnect handling, and the 90-second race limit.
- Room state is in memory for this local prototype and expires after six hours. Restarting the server clears it.

## Commands

```bash
npm run dev      # development server (restart after server edits)
npm test         # core game-engine tests
npm run build    # production client bundle
npm start        # serve the built client
npm run check    # tests and production build
```
