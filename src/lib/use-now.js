import { useEffect, useState } from "react";

export function useNow(active = true, intervalMs = 100) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

export function estimatedServerNow(room, localNow) {
  if (!room?.receivedAt) return localNow;
  return room.serverNow + (localNow - room.receivedAt);
}

const TIMED_PHASES = new Set(["prompting", "tuning", "countdown", "racing"]);

export function useServerClock(room) {
  const localNow = useNow(TIMED_PHASES.has(room?.phase));
  return estimatedServerNow(room, localNow);
}
