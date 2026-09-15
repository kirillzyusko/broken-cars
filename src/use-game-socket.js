import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CLIENT_PROTOCOL_VERSION = 6;

export function useGameSocket({ roomId, role, hostToken, clientId }) {
  const socketRef = useRef(null);
  const reconnectRef = useRef(null);
  const attemptRef = useRef(0);
  const [connection, setConnection] = useState("connecting");
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;

    function connect() {
      if (disposed) return;
      setConnection("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        attemptRef.current = 0;
        setConnection("connected");
        socket.send(
          JSON.stringify({ type: "join", roomId, role, hostToken, clientId }),
        );
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "room_state") {
          if (message.room.protocolVersion !== CLIENT_PROTOCOL_VERSION) {
            setError("The game server is out of date. Restart it with npm run dev.");
            return;
          }
          setRoom({ ...message.room, receivedAt: Date.now() });
        }
        if (message.type === "error") setError(message.message);
      });

      socket.addEventListener("close", () => {
        if (disposed) return;
        setConnection("reconnecting");
        attemptRef.current += 1;
        const delay = Math.min(5_000, 500 * 2 ** attemptRef.current);
        reconnectRef.current = window.setTimeout(connect, delay);
      });
    }

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectRef.current);
      socketRef.current?.close();
    };
  }, [clientId, hostToken, role, roomId]);

  const send = useCallback((message) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(message));
    return true;
  }, []);

  const actions = useMemo(() => ({
    setProfile: ({ name, color }) => send({ type: "set_profile", name, color }),
    startBuild: () => send({ type: "start_prompting", hostToken }),
    submitCarPrompt: (prompt) => send({ type: "submit_prompt", prompt }),
    startRace: () => send({ type: "start_race", hostToken }),
    restartRace: () => send({ type: "restart_race", hostToken }),
    startTuning: () => send({ type: "start_tuning", hostToken }),
    submitRepair: (prompt) => send({ type: "submit_tuning_prompt", prompt }),
    startNextRace: () => send({ type: "start_next_race", hostToken }),
    setControls: (controls) => send({ type: "controls", controls }),
  }), [hostToken, send]);

  const clearError = useCallback(() => setError(""), []);
  return { connection, room, error, clearError, actions };
}
