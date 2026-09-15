import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { createGame } from "./game.js";

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3001);
const app = express();
const server = createServer(app);
const sockets = new WebSocketServer({ server, path: "/ws", maxPayload: 32 * 1024 });
function durationFromEnvironment(name) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

const game = createGame({
  buildDurationMs: durationFromEnvironment("BUILD_DURATION_MS"),
  tuningDurationMs: durationFromEnvironment("TUNING_DURATION_MS"),
  startCountdownMs: durationFromEnvironment("START_COUNTDOWN_MS"),
  maxRaceDurationMs: durationFromEnvironment("MAX_RACE_DURATION_MS"),
  defectsEnabled: process.env.ENABLE_BROKEN_PARTS === "true",
});
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.use(express.json({ limit: "32kb" }));

function localNetworkAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    const match = addresses?.find(
      (address) => address.family === "IPv4" && !address.internal,
    );
    if (match) return match.address;
  }
  return "localhost";
}

function publicOrigin(request) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const hostname = request.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${request.protocol}://${localNetworkAddress()}:${port}`;
  }
  return `${request.protocol}://${request.get("host")}`;
}

app.post("/api/rooms", (request, response) => {
  const room = game.createRoom();
  response.status(201).json({
    roomId: room.id,
    hostToken: room.hostToken,
    joinUrl: `${publicOrigin(request)}/play/${room.id}`,
  });
});

app.get("/api/rooms/:roomId", (request, response) => {
  const room = game.getRoom(request.params.roomId);
  if (!room) return response.status(404).json({ error: "Game room not found." });
  return response.json(serializeRoom(room));
});

function serializeRoom(room, viewerPlayerId = null) {
  return game.getState(room, { now: Date.now(), viewerPlayerId });
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function sendError(socket, error) {
  send(socket, { type: "error", message: error.message || "Something went wrong." });
}

function broadcast(roomId) {
  const room = game.getRoom(roomId);
  if (!room) return;
  for (const client of sockets.clients) {
    if (client.readyState === WebSocket.OPEN && client.session?.roomId === room.id) {
      const viewerPlayerId = client.session.role === "player"
        ? client.session.playerId
        : null;
      send(client, {
        type: "room_state",
        room: serializeRoom(room, viewerPlayerId),
      });
    }
  }
}

sockets.on("connection", (socket) => {
  socket.isAlive = true;
  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", async (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return sendError(socket, new Error("Invalid message."));
    }

    try {
      if (message.type === "join") {
        const room = game.requireRoom(message.roomId);
        if (message.role === "host") {
          game.assertHost(room, message.hostToken);
          socket.session = { role: "host", roomId: room.id };
        } else {
          const player = game.joinPlayer(room.id, message.clientId);
          socket.session = { role: "player", roomId: room.id, playerId: player.id };
          send(socket, { type: "identity", playerId: player.id });
        }
        broadcast(room.id);
        return;
      }

      if (!socket.session) throw new Error("Join a room first.");
      const { roomId, playerId, role } = socket.session;

      if (message.type === "submit_prompt" && role === "player") {
        game.submitCarPrompt(roomId, playerId, message.prompt);
        broadcast(roomId);
      } else if (message.type === "submit_tuning_prompt" && role === "player") {
        game.submitRepair(roomId, playerId, message.prompt);
        broadcast(roomId);
      } else if (message.type === "controls" && role === "player") {
        game.setControls(roomId, playerId, message.controls ?? {});
      } else if (message.type === "start_prompting" && role === "host") {
        game.startBuild(roomId, message.hostToken);
        broadcast(roomId);
      } else if (message.type === "start_race" && role === "host") {
        const room = game.requireRoom(roomId);
        game.assertHost(room, message.hostToken);
        const startPromise = game.startRace(roomId, message.hostToken);
        broadcast(roomId);
        await startPromise;
        broadcast(roomId);
      } else if (message.type === "start_tuning" && role === "host") {
        game.startTuning(roomId, message.hostToken);
        broadcast(roomId);
      } else if (message.type === "restart_race" && role === "host") {
        game.restartRace(roomId, message.hostToken);
        broadcast(roomId);
      } else if (message.type === "start_next_race" && role === "host") {
        const room = game.requireRoom(roomId);
        game.assertHost(room, message.hostToken);
        const repairPromise = game.startNextRace(roomId, message.hostToken);
        broadcast(roomId);
        await repairPromise;
        broadcast(roomId);
      }
    } catch (error) {
      sendError(socket, error);
      if (socket.session?.roomId) broadcast(socket.session.roomId);
    }
  });

  socket.on("close", () => {
    if (socket.session?.role === "player") {
      game.disconnectPlayer(socket.session.roomId, socket.session.playerId);
      broadcast(socket.session.roomId);
    }
  });
});

const simulation = setInterval(() => {
  const changedRooms = game.tick();
  for (const roomId of changedRooms) broadcast(roomId);
}, 50);

const lobbyUpdates = setInterval(() => {
  for (const room of game.rooms.values()) {
    if (["waiting", "prompting", "assigning", "tuning", "repairing", "countdown"].includes(room.phase)) {
      broadcast(room.id);
    }
  }
}, 500);

const heartbeat = setInterval(() => {
  for (const socket of sockets.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
  game.removeStaleRooms();
}, 30_000);

sockets.on("close", () => {
  clearInterval(simulation);
  clearInterval(lobbyUpdates);
  clearInterval(heartbeat);
});

if (isProduction) {
  app.use(express.static(path.join(rootDir, "dist")));
  app.get("*splat", (_request, response) => {
    response.sendFile(path.join(rootDir, "dist", "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: rootDir,
    // The game WebSocket owns this HTTP server. Disable Vite's separate HMR
    // socket so both protocols remain predictable on a single LAN port.
    server: { middlewareMode: true, hmr: false },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Broken Cars host: http://localhost:${port}`);
  console.log(`Phone join network: http://${localNetworkAddress()}:${port}`);
});
