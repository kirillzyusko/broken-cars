// Times use the caller's clock: server wall time or sandbox performance time.
export function updateRaceInputs(car, controls, now, startsAt) {
  if (Number.isFinite(startsAt) && now < startsAt && !car.launchResolved) {
    if (controls.accelerate && !car.startGasHeld) car.startGasAt = now;
    if (!controls.accelerate) car.startGasAt = null;
    car.startGasHeld = !!controls.accelerate;
  }
  if (controls.horn && !car.hornHeld && now >= (car.hornReadyAt ?? -Infinity)) {
    car.hornSerial = (car.hornSerial ?? 0) + 1;
    car.hornReadyAt = now + 1500;
  }
  car.hornHeld = !!controls.horn;
}

export function resolveRaceStart(car, controls, startsAt) {
  if (car.launchResolved) return;
  car.launchResolved = true;
  const held = controls.accelerate && car.startGasAt != null ? startsAt - car.startGasAt : 0;
  car.startResult = held >= 150 && held <= 500 ? "boost" : held > 900 ? "stall" : null;
  car.launchBoostRemaining = car.startResult === "boost" ? 1.2 : 0;
  car.startStallRemaining = car.startResult === "stall" ? 0.7 : 0;
}

export function mechanicFeedback(before, after, repairs, faultsLeft) {
  const parts = [];
  for (const [axis, label] of [["speed", "Speed"], ["steering", "Steering"]]) {
    const change = Math.round(((after?.[axis] ?? 1) / (before?.[axis] ?? 1) - 1) * 100);
    if (change) parts.push(`${label} ${change > 0 ? "+" : ""}${change}%`);
  }
  if (repairs.length) parts.push(`Repaired: ${repairs.join(", ")}`);
  if (!parts.length) parts.push("No changes requested or matched");
  parts.push(faultsLeft ? `${faultsLeft} fault${faultsLeft === 1 ? "" : "s"} remain` : "All faults fixed");
  return parts.join(" · ");
}

export function raceAward(players) {
  const cars = players.filter((p) => p.car);
  const most = (stat) => [...cars].sort((a, b) => stat(b.car) - stat(a.car))[0];
  let winner = most((c) => c.collisionCount ?? 0);
  if (winner?.car.collisionCount > 0) return { playerId: winner.id, title: "Crash test driver", detail: `${winner.car.collisionCount} impacts` };
  winner = most((c) => c.reverseMeters ?? 0);
  if (winner?.car.reverseMeters >= 1) return { playerId: winner.id, title: "Wrong way specialist", detail: `${Math.floor(winner.car.reverseMeters)}m in reverse` };
  winner = most((c) => (c.spawnIndex ?? 0) + 1 - (c.rank ?? (c.spawnIndex ?? 0) + 1));
  const places = winner ? (winner.car.spawnIndex ?? 0) + 1 - (winner.car.rank ?? (winner.car.spawnIndex ?? 0) + 1) : 0;
  if (places > 0) return { playerId: winner.id, title: "Late arrival, early finish", detail: `Gained ${places} place${places === 1 ? "" : "s"}` };
  return null;
}

export function recordLocalImpact(car, hit, elapsedMs) {
  if (!(hit?.impactSpeed > 1)) return;
  if (elapsedMs < (car.impactReadyAt ?? -Infinity)) return;
  car.impactReadyAt = elapsedMs + 450;
  car.collisionCount = (car.collisionCount ?? 0) + 1;
  car.lastCollision = { ...hit, atMs: elapsedMs, type: "obstacle", label: "Scenery" };
}
