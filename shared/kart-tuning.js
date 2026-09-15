export const TUNING_LEVELS = Object.freeze({
  very_low: 0.35, low: 0.7, normal: 1, high: 1.3, very_high: 2, extreme: 8,
});
export const STEERING_LEVELS = Object.freeze({
  very_low: 0.12, low: 0.6, normal: 1, high: 1.3, very_high: 2, extreme: 4,
});

// Relative requests build on the current tune; fixed levels remain available.
export const TUNING_ADJUSTMENTS = Object.freeze({
  increase_5: 1.05, increase_10: 1.1, increase_20: 1.2,
  decrease_5: 0.95, decrease_10: 0.9, decrease_20: 0.8,
});

export function applyKartTuning(current = {}, requested = {}) {
  const apply = (axis, levels, min, max) => {
    const previous = tuningMultiplier(current[axis], min, max);
    const choice = requested[axis];
    if (Object.hasOwn(TUNING_ADJUSTMENTS, choice)) {
      return Math.round(tuningMultiplier(previous * TUNING_ADJUSTMENTS[choice], min, max) * 10000) / 10000;
    }
    return Object.hasOwn(levels, choice) ? levels[choice] : previous;
  };
  return {
    speed: apply("speed", TUNING_LEVELS, 0.35, 8),
    steering: apply("steering", STEERING_LEVELS, 0.12, 4),
  };
}
export function tuningMultiplier(value, min, max) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 1;
}
