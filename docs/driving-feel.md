# Driving feel

Both the sandbox and multiplayer use `shared/kart-driving.js`. The kart moves freely in world space. The kart keeps the existing animations. Holding Space while steering at speed enables a slide, without a hop, boost, or automatic steering.

## Research

Nintendo's [basic driving guide](https://www.nintendo.com/jp/ichikara/aabpa/index_en.html) describes a strong speed penalty on grass and sand. It also explains how drifting lets players take corners that would otherwise require slowing down. Lifting the accelerator and braking control the normal turn radius. The Space drift keeps momentum through a turn while the chassis rotates, then restores tire grip on release.

Nintendo's [cornering and vehicle guide](https://www.nintendo.com/jp/ichikara/aabpa/02_en.html) recommends braking for tight corners, especially at high speeds. It describes high acceleration as helping lighter vehicles recover speed, and distinguishes that from maximum speed and handling.

These sources describe player-visible behavior. They do not supply Nintendo's exact physics formulas. The values below are our choices for this track and its 1.4 m kart.

## Changes

- Steering taps build turn strength gradually. At full speed, a 100 ms right tap turns less than 6 degrees; the original code turned about 14.5 degrees. The old turn-rate clamp reached full strength with small inputs.
- Releasing steering centres the steering input quickly while preserving the kart's heading. Opposite input responds faster so left-right corrections do not keep pulling the old way.
- Full steering uses a radius that grows with speed. Slowing down makes a tighter turn possible. Held turns shed some speed while normal tires keep their grip.
- Top speed is 12 m/s, about 43 km/h. This is a further one-third reduction from 18 m/s. Acceleration is also one-third gentler and still tapers near the limit. On flat ground, the kart reaches about 8.2 m/s after 1.3 seconds and 11.3 m/s after 2.6 seconds.
- Grass targets 55% of road speed, with a firm slowdown over time instead of an instant speed cut. Returning to the road restores normal acceleration.
- Brakes still take priority over the accelerator. Holding brake at rest reverses; Space while steering above 6 m/s starts a drift; releasing it restores grip. Broken-part effects still apply when enabled.

## Verification

Simulation tests cover short taps, opposite steering, turning radius, grip, acceleration recovery, grass entry and exit, and identical sandbox/server handling. The existing collision, lap, reverse, and defect tests also run. No visual playtest was run, in line with the project's instruction.

Restart the existing Node server to load shared handling changes in multiplayer. The browser loads the sandbox changes on reload.
