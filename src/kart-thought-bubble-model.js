import { FAULT_ICONS } from "./kart-fault-icons.js";
import { discoverableDefectIds } from "../shared/defect-discovery.js";

export const THOUGHT_DELAY_MS = 5000;
export const THOUGHT_DURATION_MS = 9000;

export function thoughtBubbleFrame(car, elapsedMs, reducedMotion = false) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < THOUGHT_DELAY_MS || car.finishedAtMs != null) return null;
  const ids = discoverableDefectIds(car).filter((id) => Object.hasOwn(FAULT_ICONS, id));
  if (!ids.length) return null;
  const age = elapsedMs - THOUGHT_DELAY_MS;
  if (age >= THOUGHT_DURATION_MS) return null;
  const enter = Math.min(1, age / 900);
  const settle = enter - 1;
  return {
    ids,
    defectId: ids[0],
    opacity: Math.min(1, age / 450, (THOUGHT_DURATION_MS - age) / 800),
    scale: reducedMotion ? 1 : 1 + 2.7 * settle ** 3 + 1.7 * settle ** 2,
  };
}
