import { useCallback, useEffect, useMemo, useState } from "react";
import { displayRound } from "./format.js";

function storageKey(roomId, playerId) {
  return `broken-cars:asks:${roomId}:${playerId}`;
}

function load(roomId, playerId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(roomId, playerId)) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Everything this player has asked the garage for, one entry per round. The
 * build prompt and the current fix come from the server; earlier fixes are
 * recorded locally when they are sent, because the server clears them each
 * round.
 */
export function usePromptHistory({ roomId, playerId, me, room }) {
  const [local, setLocal] = useState(() => load(roomId, playerId));

  useEffect(() => {
    setLocal(load(roomId, playerId));
  }, [roomId, playerId]);

  const record = useCallback((round, text) => {
    setLocal((current) => {
      const next = [...current.filter((entry) => entry.round !== round), { round, text }]
        .sort((a, b) => a.round - b.round);
      try {
        localStorage.setItem(storageKey(roomId, playerId), JSON.stringify(next));
      } catch {
        // Ignore storage failures; the in-memory copy still works this session.
      }
      return next;
    });
  }, [roomId, playerId]);

  const currentRound = displayRound(room);
  const entries = useMemo(() => {
    const merged = new Map(local.map((entry) => [entry.round, entry]));
    if (me?.prompt) merged.set(1, { round: 1, text: me.prompt });
    if (me?.tuningPrompt && currentRound > 1) {
      merged.set(currentRound, { round: currentRound, text: me.tuningPrompt });
    }
    return [...merged.values()].sort((a, b) => a.round - b.round);
  }, [local, me?.prompt, me?.tuningPrompt, currentRound]);

  return { entries, record };
}
