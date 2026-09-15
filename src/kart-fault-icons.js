const icon = (file, ...label) => ({ src: `/icons/kart-faults/${file}.png`, label });

// Cut from one GPT Image sheet so every fault shares the same painted style.
export const FAULT_ICONS = Object.freeze({
  no_wheels: icon("no_wheels", "NO", "WHEELS"),
  square_wheels: icon("square_wheels", "SQUARE", "WHEELS"),
  loose_wheel: icon("loose_wheel", "LOOSE", "WHEEL"),
  no_engine: icon("no_engine", "NO", "ENGINE"),
  no_brakes: icon("no_brakes", "NO", "BRAKES"),
  no_cooling: icon("no_cooling", "NO COOLING", "TOO HOT!"),
  no_steering: icon("no_steering", "NO", "STEERING"),
  no_seatbelt: icon("no_seatbelt", "NO", "SEATBELT"),
  swapped_pedals: icon("swapped_pedals", "SWAPPED", "PEDALS"),
  reversed_steering: icon("reversed_steering", "REVERSED", "STEERING"),
  one_way_steering: icon("one_way_steering_left", "ONLY TURNS", "LEFT"),
  backwards_engine: icon("backwards_engine", "BACKWARDS", "ENGINE"),
  bad_engine_power: icon("bad_engine_power_overpowered", "ENGINE", "TOO STRONG"),
  stuck_accelerator: icon("stuck_accelerator", "GAS PEDAL", "STUCK!"),
  no_grip: icon("no_grip", "NO GRIP", "SLIDING!"),
  sideways_wheels: icon("sideways_wheels", "SIDEWAYS", "WHEELS"),
});

export function faultIcon(id, car = {}) {
  if (id === "one_way_steering" && car.oneWayTurn === "right") {
    return icon("one_way_steering_right", "ONLY TURNS", "RIGHT");
  }
  if (id === "bad_engine_power" && car.enginePowerIssue === "weak") {
    return icon("bad_engine_power_weak", "ENGINE", "TOO WEAK");
  }
  return FAULT_ICONS[id] ?? null;
}

// The cloud stays vector-sharp; the PNG icons are composed onto it in canvas.
export function thoughtBubbleSvg(ids) {
  const width = ids.length * 144 + 48;
  const cloud = `M30 62Q11 29 53 25Q77 3 105 22Q${width / 2} 8 ${width - 105} 22Q${width - 77} 3 ${width - 53} 25Q${width - 11} 29 ${width - 30} 62Q${width + 7} 93 ${width - 22} 124Q${width - 5} 161 ${width - 43} 177Q${width - 53} 200 ${width - 92} 187Q${width / 2} 204 92 187Q53 200 43 177Q5 161 22 124Q-7 93 30 62Z`;
  return { width, height: 256, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="512" viewBox="0 0 ${width} 256">
    <g stroke="none" fill="#fff">
      <circle cx="${width * .42}" cy="213" r="16"/>
      <circle cx="${width * .49}" cy="243" r="7"/>
      <path d="${cloud}"/>
    </g></svg>` };
}
