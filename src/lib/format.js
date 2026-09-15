export function secondsLeft(milliseconds) {
  return Math.max(0, Math.ceil(milliseconds / 1000));
}

export function clockLabel(milliseconds) {
  return `:${String(secondsLeft(milliseconds)).padStart(2, "0")}`;
}

export function ordinal(number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = number % 100;
  const suffix = suffixes[(remainder - 20) % 10] ?? suffixes[remainder] ?? suffixes[0];
  return `${number}${suffix}`;
}

export function formatLapTime(milliseconds) {
  if (milliseconds === null || milliseconds === undefined) return "DNF";
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

/** A finisher shows a lap time; a kart placed while still on track shows how far it got. */
export function formatRaceResult(result) {
  if (!result) return "DNF";
  if (result.finishedAtMs !== null && result.finishedAtMs !== undefined) return formatLapTime(result.finishedAtMs);
  return Number.isFinite(result.distance) ? `${Math.round(result.distance)} M` : "DNF";
}

/** Forward is negative Z at heading 0; a negative forward speed means reversing. */
export function isReversing(car) {
  if (!car) return false;
  const radians = (car.heading ?? 0) * Math.PI / 180;
  const forward = (car.velocityX ?? 0) * Math.sin(radians) + (car.velocityZ ?? 0) * -Math.cos(radians);
  return forward < -0.2;
}

export function kph(metersPerSecond) {
  return Math.round(Math.abs(metersPerSecond) * 3.6);
}

export function displayRound(room) {
  if (!room) return 0;
  switch (room.phase) {
    case "waiting":
      return 0;
    case "prompting":
    case "assigning":
      return 1;
    case "tuning":
    case "repairing":
      return room.roundNumber + 1;
    default:
      return Math.max(1, room.roundNumber);
  }
}

export function kartNameFor(player) {
  return player?.car?.name || `${player?.name ?? "Driver"}'s kart`;
}
