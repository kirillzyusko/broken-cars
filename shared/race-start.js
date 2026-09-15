export function raceStartSignal(startsAt, now) {
  if (!Number.isFinite(startsAt)) return { step: 0, label: "", pulse: 0 };
  const remaining = startsAt - now;
  if (remaining > 3000) return { step: 0, label: "READY", pulse: 0 };
  if (remaining > 0) {
    const number = Math.ceil(remaining / 1000);
    return { step: 4 - number, label: String(number), pulse: 1 - ((3000 - remaining) % 1000) / 1000 };
  }
  return { step: 4, label: remaining > -1100 ? "GO!" : "", pulse: Math.max(0, 1 + remaining / 1100) };
}
