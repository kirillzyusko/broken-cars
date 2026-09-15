export const DEFAULT_KART_SETTINGS = Object.freeze({
  wheels: "round", engine: "installed", steering: "working", power: "normal", faults: [], paused: false,
});

export function applyKartSettings(car, settings) {
  const ids = new Set(settings.faults);
  if (settings.wheels !== "round") ids.add(settings.wheels);
  if (settings.engine !== "installed") ids.add(settings.engine);
  if (["left", "right"].includes(settings.steering)) ids.add("one_way_steering");
  else if (settings.steering !== "working") ids.add(settings.steering);
  if (settings.power !== "normal") ids.add("bad_engine_power");
  car.defectIds = [...ids];
  car.oneWayTurn = settings.steering === "right" ? "right" : "left";
  car.enginePowerIssue = settings.power === "overpowered" ? "overpowered" : "weak";
  if (!ids.has("stuck_accelerator")) car.acceleratorStuck = false;
  if (!ids.has("no_cooling")) car.heat = 0;
}
