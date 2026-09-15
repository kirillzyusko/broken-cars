import { decoratePlayers } from "./identity.js";
import { MAX_RACE_ROUNDS } from "../../shared/race-config.js";

export const POINTS_BY_RANK = Object.freeze([15, 12, 10, 8, 6, 5, 4, 3, 2, 1]);
export const DNF_POINTS = 1;

export function racers(room) {
  return decoratePlayers(room).filter((player) => player.car);
}

export function racePositions(room) {
  return racers(room).sort((a, b) => {
    if (a.car.rank && b.car.rank) return a.car.rank - b.car.rank;
    if (a.car.rank) return -1;
    if (b.car.rank) return 1;
    return b.car.distance - a.car.distance;
  });
}

export function positionOf(room, playerId) {
  const index = racePositions(room).findIndex((player) => player.id === playerId);
  return index < 0 ? null : index + 1;
}

export function resultsFromRoom(room) {
  const results = {};
  for (const player of racePositions(room)) {
    results[player.id] = {
      finishedAtMs: player.car.finishedAtMs,
      rank: player.car.rank,
      distance: Math.round(player.car.distance),
    };
  }
  return results;
}

export function pointsFor(result) {
  if (!result) return 0;
  if (!result.rank) return DNF_POINTS;
  return POINTS_BY_RANK[Math.min(result.rank, POINTS_BY_RANK.length) - 1];
}

export function roundsIn(history) {
  return Object.keys(history ?? {})
    .map(Number)
    .filter((round) => Number.isFinite(round))
    .sort((a, b) => a - b);
}

export function tally(history, room) {
  // Include the last race on the first render, before the history effect saves it.
  const completedHistory = room?.phase === "finished" && room.roundNumber > 0
    ? { ...history, [room.roundNumber]: resultsFromRoom(room) }
    : history;
  const rounds = roundsIn(completedHistory);
  const latestRound = rounds[rounds.length - 1];
  return racers(room)
    .map((player) => {
      const results = {};
      let points = 0;
      for (const round of rounds) {
        const result = completedHistory[round]?.[player.id] ?? null;
        results[round] = result;
        points += pointsFor(result);
      }
      const latest = latestRound ? results[latestRound] : null;
      return { ...player, points, results, latest };
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const rankA = a.latest?.rank ?? Number.POSITIVE_INFINITY;
      const rankB = b.latest?.rank ?? Number.POSITIVE_INFINITY;
      if (rankA !== rankB) return rankA - rankB;
      return (b.latest?.distance ?? 0) - (a.latest?.distance ?? 0);
    });
}

export function allTuned(room) {
  const cars = racers(room);
  return cars.length > 0 && cars.every((player) => player.car.defects.length === 0);
}

/** End after five races, or after the earlier race with all karts repaired. */
export function sessionOver(room) {
  return !!room && room.phase === "finished" && (room.roundNumber >= MAX_RACE_ROUNDS || allTuned(room));
}

export function windowClosed(room, now) {
  if (room.phase === "prompting") return room.promptDeadline - now <= 0;
  if (room.phase === "tuning") return room.tuningDeadline - now <= 0;
  return room.phase === "assigning" || room.phase === "repairing";
}

export function statusLabel(player, room, { closed = false } = {}) {
  const tuning = room.phase === "tuning" || room.phase === "repairing";
  if (tuning) {
    if (!player.car) return { label: "SPECTATING", tone: "idle" };
    if (player.car.defects.length === 0) return { label: "FULLY TUNED", tone: "sent" };
    if (player.hasTuningPrompt) return { label: "SENT", tone: "sent" };
  } else if (player.hasPrompt) {
    return { label: "SENT", tone: "sent" };
  }
  if (closed) return { label: "MISSED", tone: "idle" };
  if (!player.connected) return { label: "OFFLINE", tone: "idle" };
  return { label: "TYPING…", tone: "typing" };
}

const COMPLETED_PHASES = new Set(["finished", "tuning", "repairing"]);

/**
 * Round progress markers never offer a sixth race.
 */
export function roundDots(room, { minimum = MAX_RACE_ROUNDS } = {}) {
  const completed = COMPLETED_PHASES.has(room.phase)
    ? room.roundNumber
    : Math.max(0, room.roundNumber - 1);
  const hasNext = room.phase === "tuning"
    || room.phase === "repairing"
    || (room.phase === "finished" && !sessionOver(room))
    || !COMPLETED_PHASES.has(room.phase);
  const current = hasNext && completed < MAX_RACE_ROUNDS ? completed + 1 : 0;
  const total = Math.min(MAX_RACE_ROUNDS, Math.max(minimum, current || completed));
  return Array.from({ length: total }, (_, index) => {
    const n = index + 1;
    const state = n <= completed ? "done" : n === current ? "current" : "future";
    return { n, state };
  });
}
