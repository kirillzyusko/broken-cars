# Driving feel

Both the sandbox and multiplayer use `shared/kart-driving.js`. The kart moves freely in world space. This pass keeps the existing animations and adds no drift, hop, boost, or automatic steering.

## Research

Nintendo's [basic driving guide](https://www.nintendo.com/jp/ichikara/aabpa/index_en.html) describes a strong speed penalty on grass and sand. It also explains how drifting lets players take corners that would otherwise require slowing down. Since this game has no drifting, lifting the accelerator and braking need to give players useful control of their turn radius.

Nintendo's [cornering and vehicle guide](https://www.nintendo.com/jp/ichikara/aabpa/02_en.html) recommends braking for tight corners, especially at high speeds. It describes high acceleration as helping lighter vehicles recover speed, and distinguishes that from maximum speed and handling.

These sources describe player-visible behavior. They do not supply Nintendo's exact physics formulas. The values below are our choices for this track and its 1.4 m kart.

## Changes

- Steering taps build turn strength gradually. At full speed, a 100 ms right tap now turns about 3.8 degrees; the previous code turned about 14.5 degrees. The old turn-rate clamp reached full strength with small inputs.
- Releasing steering centres the steering input quickly while preserving the kart's heading. Opposite input responds faster so left-right corrections do not keep pulling the old way.
- Full steering uses a radius that grows with speed. Slowing down makes a tighter turn possible. Held turns shed some speed while normal tires keep their grip.
- Acceleration is strongest at low speed and tapers near the unchanged 28 m/s limit. On flat ground, reaching 20 m/s takes about 1.28 seconds, versus 1.46 seconds before this pass.
- Grass targets 55% of road speed, with a firm slowdown over time instead of an instant speed cut. Returning to the road restores normal acceleration.
- Brakes still take priority over the accelerator. Holding brake at rest reverses; Space only brakes. Broken-part effects still apply when enabled.

## Verification

Simulation tests cover short taps, opposite steering, turning radius, grip, acceleration recovery, grass entry and exit, and identical sandbox/server handling. The existing collision, lap, reverse, and defect tests also run. No visual playtest was run, in line with the project's instruction.

Restart the existing Node server to load shared handling changes in multiplayer. The browser loads the sandbox changes on reload.
