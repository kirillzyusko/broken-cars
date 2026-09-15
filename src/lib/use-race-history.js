import { useEffect, useState } from "react";
import { resultsFromRoom } from "./standings.js";

function storageKey(roomId) {
  return `broken-cars:history:${roomId}`;
}

function load(roomId) {
  if (!roomId) return {};
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(roomId)) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function save(roomId, history) {
  try {
    sessionStorage.setItem(storageKey(roomId), JSON.stringify(history));
  } catch {
    // Storage is a convenience; the live snapshot still works without it.
  }
}

/**
 * Records the result of every finished race so standings and points can span
 * rounds. The server only carries the current race, so each client keeps its
 * own copy in sessionStorage.
 */
export function useRaceHistory(room) {
  const roomId = room?.id ?? null;
  const [history, setHistory] = useState(() => load(roomId));

  useEffect(() => {
    setHistory(load(roomId));
  }, [roomId]);

  useEffect(() => {
    if (!room || room.phase !== "finished" || room.roundNumber < 1) return;
    // Merge into whatever is current, not a stale closure: on a reload the
    // stored rounds arrive through the effect above in the same commit.
    setHistory((current) => {
      if (current[room.roundNumber]) return current;
      const next = { ...current, [room.roundNumber]: resultsFromRoom(room) };
      save(roomId, next);
      return next;
    });
  }, [room, roomId]);

  return history;
}
