import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { GameEngine } from "./game-engine.js";
import { getSelectorName, selectDefects } from "./defects.js";

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3001);
const app = express();
const server = createServer(app);
const sockets = new WebSocketServer({ server, path: "/ws", maxPayload: 32 * 1024 });
const engine = new GameEngine();
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
  const room = engine.createRoom();
  response.status(201).json({
    roomId: room.id,
    hostToken: room.hostToken,
    joinUrl: `${publicOrigin(request)}/play/${room.id}`,
  });
});

app.get("/api/rooms/:roomId", (request, response) => {
  const room = engine.getRoom(request.params.roomId);
  if (!room) return response.status(404).json({ error: "Game room not found." });
  return response.json(serializeRoom(room));
});

function serializeRoom(room, viewerPlayerId = null) {
  return engine.serialize(room, Date.now(), getSelectorName(), viewerPlayerId);
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function sendError(socket, error) {
  send(socket, { type: "error", message: error.message || "Something went wrong." });
}

function broadcast(roomId) {
  const room = engine.getRoom(roomId);
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
        const room = engine.requireRoom(message.roomId);
        if (message.role === "host") {
          engine.assertHost(room, message.hostToken);
          socket.session = { role: "host", roomId: room.id };
        } else {
          const player = engine.joinPlayer(room.id, message.clientId);
          socket.session = { role: "player", roomId: room.id, playerId: player.id };
          send(socket, { type: "identity", playerId: player.id });
        }
        broadcast(room.id);
        return;
      }

      if (!socket.session) throw new Error("Join a room first.");
      const { roomId, playerId, role } = socket.session;

      if (message.type === "submit_prompt" && role === "player") {
        engine.submitPrompt(roomId, playerId, message.prompt);
        broadcast(roomId);
      } else if (message.type === "controls" && role === "player") {
        engine.setControls(roomId, playerId, message.controls ?? {});
      } else if (message.type === "start_prompting" && role === "host") {
        engine.startPrompting(roomId, message.hostToken);
        broadcast(roomId);
      } else if (message.type === "start_race" && role === "host") {
        const room = engine.requireRoom(roomId);
        engine.assertHost(room, message.hostToken);
        const startPromise = engine.startRoom(roomId, message.hostToken, selectDefects);
        broadcast(roomId);
        await startPromise;
        broadcast(roomId);
      }
    } catch (error) {
      sendError(socket, error);
      if (socket.session?.roomId) broadcast(socket.session.roomId);
    }
  });

  socket.on("close", () => {
    if (socket.session?.role === "player") {
      engine.disconnectPlayer(socket.session.roomId, socket.session.playerId);
      broadcast(socket.session.roomId);
    }
  });
});

const simulation = setInterval(() => {
  const changedRooms = engine.tick();
  for (const roomId of changedRooms) broadcast(roomId);
}, 50);

const lobbyUpdates = setInterval(() => {
  for (const room of engine.rooms.values()) {
    if (["waiting", "prompting", "assigning", "countdown"].includes(room.phase)) {
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
  engine.removeStaleRooms();
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
