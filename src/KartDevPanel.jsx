import { DEFAULT_KART_SETTINGS } from "./kart-dev-settings.js";
import { useState } from "react";

const FAULTS = [
  ["loose_wheel", "Loose wheel"], ["no_brakes", "No brakes"],
  ["no_cooling", "No cooling"], ["no_seatbelt", "No seatbelt"],
  ["swapped_pedals", "Swapped pedals"], ["stuck_accelerator", "Stuck accelerator"],
  ["no_grip", "No tire grip"],
];

export default function KartDevPanel({ settings, onChange, onReset, onDrive, ready }) {
  const [open, setOpen] = useState(() => window.matchMedia("(min-width: 700px)").matches);
  const select = (key, label, options) => <label className="kart-dev-panel__select">
    <span>{label}</span>
    <select value={settings[key]} onChange={(event) => onChange({ ...settings, [key]: event.target.value })}>
      {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select>
  </label>;
  return <details className="kart-dev-panel" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Dev controls <span>Car parts</span></summary>
    <div className="kart-dev-panel__body">
      <p>Changes apply live. Click the track to drive.</p>
      {select("wheels", "Wheels", [["round", "Round"], ["square_wheels", "Square"], ["sideways_wheels", "Sideways"], ["no_wheels", "Missing"]])}
      {select("engine", "Engine", [["installed", "Installed"], ["backwards_engine", "Backwards"], ["no_engine", "Missing"]])}
      {select("steering", "Steering", [["working", "Working"], ["no_steering", "Missing wheel"], ["reversed_steering", "Reversed"], ["left", "Left only"], ["right", "Right only"]])}
      {select("speedTune", "Speed tuning", [["very_low", "Very slow"], ["low", "Slower"], ["normal", "Stock"], ["high", "Faster"], ["very_high", "Very fast"], ["extreme", "Ultra fast"]])}
      {select("steeringTune", "Steering tuning", [["very_low", "Barely turns"], ["low", "Sluggish"], ["normal", "Stock"], ["high", "Responsive"], ["very_high", "Twitchy"], ["extreme", "Extreme"]])}
      <details className="kart-dev-panel__faults">
        <summary>Driving faults</summary>
        <p>These affect driving without changing the mesh.</p>
        {select("power", "Engine power", [["normal", "Normal"], ["weak", "Weak"], ["overpowered", "Overpowered"]])}
        {FAULTS.map(([id, label]) => <label className="kart-dev-panel__check" key={id}>
          <input type="checkbox" checked={settings.faults.includes(id)} onChange={(event) => onChange({ ...settings,
            faults: event.target.checked ? [...settings.faults, id] : settings.faults.filter((value) => value !== id) })} />
          {label}
        </label>)}
      </details>
      <label className="kart-dev-panel__check"><input type="checkbox" checked={settings.paused}
        onChange={(event) => onChange({ ...settings, paused: event.target.checked })} />Pause driving to inspect</label>
      <div className="kart-dev-panel__actions">
        <button type="button" onClick={() => onChange({ ...DEFAULT_KART_SETTINGS })}>Restore all parts</button>
        <button type="button" onClick={onReset} disabled={!ready}>Reset to grid</button>
        <button type="button" onClick={onDrive} disabled={!ready}>Drive</button>
      </div>
      {!ready && <p role="status">Loading kart…</p>}
    </div>
  </details>;
}
