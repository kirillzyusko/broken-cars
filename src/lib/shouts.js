import { isReversing } from "./format.js";

// Driver speech bubbles. A defect is "discovered" on the phone when the
// player's own input runs into it, so the driver only shouts about a part once
// the player has tried to use it. Lines reuse the vocabulary the repair
// selector understands, so repeating what the driver said fixes the part.

const steering = ({ controls }) => controls.left || controls.right;

export const SHOUTS = Object.freeze({
  no_wheels: {
    when: ({ controls }) => controls.accelerate,
    line: "We've got no wheels! Just bare hubs!",
    tone: "problem",
  },
  square_wheels: {
    when: ({ controls, car }) => controls.accelerate && car.speed > 2,
    line: "Square wheels! Who fits SQUARE WHEELS?!",
    tone: "problem",
  },
  loose_wheel: {
    when: ({ car }) => car.speed > 15,
    line: "There's a loose wheel screw, we're wobbling!",
    tone: "problem",
  },
  no_engine: {
    when: ({ controls }) => controls.accelerate,
    line: "There's no engine in here!",
    tone: "critical",
  },
  no_brakes: {
    when: ({ controls, car }) => controls.brake && car.speed > 4,
    line: "There's no brake pedal!",
    tone: "problem",
  },
  no_cooling: {
    when: ({ car }) => car.heat > 0.6,
    line: "The engine's overheating! There's no cooling!",
    tone: "problem",
    holdMs: 0,
  },
  no_steering: {
    when: steering,
    line: "There's no steering wheel!",
    tone: "critical",
  },
  no_seatbelt: {
    when: ({ controls, car }) => steering({ controls }) && car.speed > 18,
    line: "No seatbelt! I'm sliding off the seat!",
    tone: "problem",
  },
  swapped_pedals: {
    when: ({ controls }) => controls.accelerate || controls.brake,
    line: "The pedals are swapped!",
    tone: "problem",
    holdMs: 900,
  },
  reversed_steering: {
    when: ({ controls, car }) => steering({ controls }) && car.speed > 2,
    line: "The steering is reversed!",
    tone: "problem",
  },
  one_way_steering: {
    when: ({ controls, car }) =>
      (car.oneWayTurn === "left" && controls.right)
      || (car.oneWayTurn === "right" && controls.left),
    line: ({ car }) => `It can only turn ${car.oneWayTurn}!`,
    tone: "problem",
  },
  backwards_engine: {
    when: ({ controls, car }) => controls.accelerate && car.speed > 2,
    line: "The engine is installed backwards, we're reversing!",
    tone: "critical",
  },
  bad_engine_power: {
    when: ({ controls, car }) => controls.accelerate && car.speed > 2,
    line: ({ car }) => (car.enginePowerIssue === "weak"
      ? "This engine is too weak!"
      : "This engine is too powerful!"),
    tone: "problem",
  },
  stuck_accelerator: {
    when: ({ controls, car }) => car.acceleratorStuck && !controls.accelerate,
    line: "The accelerator is stuck!",
    tone: "problem",
  },
  no_grip: {
    when: ({ controls, car }) => steering({ controls }) && car.speed > 3,
    line: "No grip! It slides like ice!",
    tone: "problem",
  },
  sideways_wheels: {
    when: ({ controls, car }) => controls.accelerate && car.speed > 1,
    line: "The wheels are mounted sideways!",
    tone: "problem",
  },
});

export const DEFAULT_HOLD_MS = 600;

export function shoutFor(defectId, context) {
  const shout = SHOUTS[defectId];
  if (!shout) return null;
  const text = typeof shout.line === "function" ? shout.line(context) : shout.line;
  return { id: defectId, text, tone: shout.tone };
}

/**
 * Tracks how long each defect's trigger condition has been continuously true
 * and returns the ids whose hold time has elapsed. `timers` is a mutable Map
 * owned by the caller so the tracker survives re-renders.
 */
export function detectShouts({ car, controls, now, timers, alreadyShouted }) {
  const fired = [];
  if (!car) return fired;
  for (const defect of car.defects) {
    const shout = SHOUTS[defect.id];
    if (!shout || alreadyShouted.has(defect.id)) continue;
    const active = shout.when({ car, controls });
    if (!active) {
      timers.delete(defect.id);
      continue;
    }
    const since = timers.get(defect.id) ?? now;
    timers.set(defect.id, since);
    if (now - since >= (shout.holdMs ?? DEFAULT_HOLD_MS)) fired.push(defect.id);
  }
  return fired;
}

// TV quadrant remarks are derived from public car state only. Problems are
// held back for the same grace period as the phone's shouts; the TV only
// knows the race clock, so it counts from the start of the race.
export function publicRemark(player, { position, racerCount, elapsedMs, graceMs = 0 }) {
  const car = player?.car;
  if (!car) return null;
  if (car.finishedAtMs !== null && car.finishedAtMs !== undefined) {
    return { text: car.rank === 1 ? "Across the line first!" : "Across the line!", tone: "remark" };
  }
  const impact = car.lastCollision;
  if (impact && elapsedMs - impact.atMs < 900) {
    return {
      text: impact.type === "car" ? `Traded paint with ${impact.label}!` : `Hit the ${impact.label.toLowerCase()}!`,
      tone: "problem",
    };
  }
  const canComplain = elapsedMs >= graceMs;
  if (canComplain && car.heat >= 0.9) return { text: "The engine's overheating!", tone: "critical" };
  if (canComplain && car.heat > 0.6) return { text: "Engine's cooking…", tone: "problem" };
  if (canComplain && car.acceleratorStuck) return { text: "Can't lift off the gas!", tone: "problem" };
  if (isReversing(car)) return { text: "Backing up…", tone: "remark" };
  if (elapsedMs > 4000 && car.speed < 1 && car.distance < 5) {
    return { text: "…is it even moving?", tone: "remark" };
  }
  if (position === 1 && racerCount > 1 && car.distance > 25) {
    return { text: "Out in front!", tone: "remark" };
  }
  return null;
}
