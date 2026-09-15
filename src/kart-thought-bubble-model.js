import { FAULT_ICONS } from "./kart-fault-icons.js";

export const THOUGHT_DELAY_MS = 5000;
export const THOUGHT_PAGE_MS = 9000;

export function thoughtBubbleFrame(car, elapsedMs, reducedMotion = false) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < THOUGHT_DELAY_MS || car.finishedAtMs != null) return null;
  const ids = [...new Set(car.defectIds ?? [])].filter((id) => Object.hasOwn(FAULT_ICONS, id));
  const age = elapsedMs - THOUGHT_DELAY_MS;
  const duration = Math.ceil(ids.length / 3) * THOUGHT_PAGE_MS;
  if (age >= duration) return null;
  const page = Math.floor(age / THOUGHT_PAGE_MS);
  const enter = Math.min(1, age / 900);
  const settle = enter - 1;
  return {
    ids: ids.slice(page * 3, page * 3 + 3),
    opacity: Math.min(1, age / 450, (duration - age) / 800),
    scale: reducedMotion ? 1 : 1 + 2.7 * settle ** 3 + 1.7 * settle ** 2,
  };
}
