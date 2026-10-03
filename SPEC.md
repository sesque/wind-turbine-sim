# Wind Turbine Simulator: Specification

An educational web app for students aged 14–15. Students change the wind, the
blade length and the turbine's direction, and see how much electricity the
turbine makes and why.

This file says **what** to build. `CLAUDE.md` says **how** (the rules for the code).

---

## 1. Goals

- Show that wind power depends on wind speed cubed (v³), on blade length squared
  (through the swept area), and on facing the wind.
- Show that a real turbine loses energy at every step, and that it has limits
  (it can't start in very light wind, it caps its output, and it shuts down in storms).
- Be understandable without prior physics. The main screen uses plain words;
  the maths sits behind a "Go deeper" toggle.

## 2. Who it is for

14–15 year old students, using a phone, tablet or laptop in class or at home.
No sign-in, no data collected, works from a single web page.

## 3. Inputs (three controls)

| Input | Range | Step | Notes |
|---|---|---|---|
| Wind speed | 0–30 m/s | 0.5 | Slider plus a **word label** that changes as you drag |
| Blade length | 40–85 m | 1 | Slider plus a **scale figure** (see 3.2) |
| Turbine direction vs wind | 0–45° | 1 | Slider; 0° means facing the wind head-on |

*(m/s = metres per second. 10 m/s is about 36 km/h.)*

### 3.1 Wind speed word labels

| Speed (m/s) | Label |
|---|---|
| 0–2 | Calm |
| 3–5 | Light breeze |
| 6–8 | Gentle breeze |
| 9–11 | Moderate wind |
| 12–14 | Fresh wind |
| 15–19 | Strong wind |
| 20–24 | Gale |
| 25–30 | Storm |

Labels use whole-number ranges; a value such as 5.5 uses the label of the
range below it (5.5 → Light breeze).

### 3.2 Blade length scale figure

A simple drawing next to the slider that compares the blade length with things
students know, drawn to the same scale: a person (1.8 m), a double-decker bus
(about 11 m) and a jumbo jet's wingspan (about 68 m). The blade is drawn as a
bar that grows and shrinks as the slider moves, with the length in metres.

### 3.3 Turbine direction vs wind

The angle between where the turbine faces and where the wind comes from
(called **yaw misalignment**; *yaw* just means turning left/right about a
vertical axis). The 3D model rotates to match. When the angle is above 0° the
app shows a short message: "The turbine isn't facing the wind, so it catches
less."

## 4. Physics model

All maths lives in one file (`physics.js`, see `CLAUDE.md`).

### 4.1 The visible formula

The main screen always shows:

**P = ½ × ρ × A × v³**

- **P**: power in the wind passing through the blades (watts)
- **ρ** (Greek letter "rho"): air density, **fixed at 1.2 kg/m³**
- **A**: the circle the blades sweep out, **A = π × L²**, where L is blade length
- **v**: wind speed (m/s)

The formula is shown with the student's current numbers filled in, e.g.
`P = ½ × 1.2 × 11 310 × 8³`.

### 4.2 Direction effect

The turbine only "feels" the part of the wind pointing straight at it:

`v_effective = v × cos(angle)`

So power drops with **cos³(angle)**. (At 45°, cos³ ≈ 0.35, so the turbine keeps
about 35% of the power.) This is a simplification that real engineers also use
as a first estimate.

### 4.3 Fixed efficiencies

Efficiency = the share of energy that gets through a step.

| Step | Efficiency |
|---|---|
| Rotor (blades turn wind into spinning) | 45% |
| Gearbox | 97% |
| Generator | 96% |
| Grid connection (cables, transformer) | 98% |

Combined: 0.45 × 0.97 × 0.96 × 0.98 ≈ **0.411 (41.1%)**.

Note for the Go deeper panel: no turbine can ever capture more than 59.3% of
the wind's power (the **Betz limit**), so 45% is realistic and good.

### 4.4 Operating states

| Wind speed (m/s) | State | What happens |
|---|---|---|
| below 3 | **Waiting** (below *cut-in*) | Not enough wind to start. Power 0. |
| 3 up to rated | **Generating** | Power follows the formula. |
| rated up to 25 | **Full power** | Output capped at **5 MW**. Blades pitch to spill extra wind. |
| above 25 | **Shut down** | Storm protection: blades turned edge-on (feathered), power 0. |

- **Cut-in** = the lowest wind speed at which the turbine starts making power (3 m/s).
- **Rated power** = the maximum the generator is allowed to produce (5 MW = 5 000 000 W).
- **Rated wind speed** = the speed at which the cap is first reached. It is
  **not a fixed number in the code**; it comes out of the maths and depends on
  blade length. With a ~63 m blade it is about 11.8 m/s (the "about 12 m/s" in
  the brief). Longer blades reach 5 MW in lighter wind (85 m: about 9.6 m/s);
  shorter ones need stronger wind (40 m: about 15.9 m/s). The app should show
  the current rated wind speed so students see this.

### 4.5 Calculation order

1. `v_eff = v × cos(angle)`
2. `A = π × L²`
3. `P_wind = ½ × 1.2 × A × v_eff³`
4. `P_electric = P_wind × 0.45 × 0.97 × 0.96 × 0.98`
5. If v < 3 or v > 25 → `P_electric = 0`. Else `P_electric = min(P_electric, 5 MW)`.

The state (4.4) is decided from the **real wind speed v** for cut-in and
shutdown, so a misaligned turbine in a storm still shuts down.

### 4.6 Outputs

| Output | How it is worked out | Shown as |
|---|---|---|
| **Power** | Step 5 above | kW below 1 MW, otherwise MW (e.g. "3.2 MW") |
| **Rotor speed** | See below | rpm (rotations per minute) |
| **Blade tip speed** | tip speed (m/s) × 3.6 | km/h |
| **Homes powered** | Power ÷ 1 kW, rounded down | a number, with the assumption stated |
| **Overall efficiency** | P_electric ÷ P_wind (using the real v, not v_eff) | % |

**Rotor speed and tip speed.** Turbines aim to keep the blade tip moving about
7 times faster than the wind (this ratio is the **tip-speed ratio**, λ ≈ 7).

- `tip speed (m/s) = min(7 × v_eff, 85)`, since 85 m/s (about 306 km/h) is a typical
  noise and safety limit
- `rpm = tip speed ÷ (2 × π × L) × 60`
- Waiting or shut down: tip speed and rpm are 0.

**Homes powered.** One home is assumed to use 1 kW on average (about 8 800 kWh a
year). This is a labelled assumption and lives as a named constant so it is easy to change.

**Overall efficiency.** Uses the real wind speed, so it falls when the turbine
isn't facing the wind and when the 5 MW cap trims the output. Students should
see the number drop, and the Go deeper panel explains why.

## 5. Visuals

### 5.1 Power curve chart

- Horizontal axis: wind speed 0–30 m/s. Vertical axis: power in MW.
- Draws the curve for the **current blade length and direction**.
- A moving dot marks the current wind speed.
- Shaded zones and labels for waiting, generating, full power, shut down.
- Redraws whenever any input changes.
- Drawn with plain `<canvas>` or SVG (no chart library needed).

### 5.2 Energy flow diagram

A left-to-right diagram (a *Sankey-style* diagram: arrows whose thickness shows
the amount of energy): **Wind → Rotor → Gearbox → Generator → Grid**.

- Arrow thickness is proportional to power at that point.
- A "lost" arrow leaves each step, labelled with the watts lost there (as heat, noise, etc.).
- When the 5 MW cap is active, an extra "spilled wind" loss appears at the
  rotor so the numbers still add up.
- On a phone it can turn vertical (top to bottom).

### 5.3 3D turbine model

- Built with **three.js** (a library that draws 3D graphics in the browser via WebGL).
- Tower, nacelle (the box at the top housing the generator), hub and three blades.
- **Blades spin** at exactly the rpm shown in the outputs (at most about 14 rpm,
  slow enough to look smooth on screen, so no slowing-down trick is needed).
- **Turbine direction** slider rotates the whole nacelle and rotor against a wind
  arrow.
- **Pitch.** *Pitch* means twisting each blade about its own length. In normal
  wind, blades are at 0°. Above rated wind speed they twist progressively (up
  to about 30° at 25 m/s) to catch less wind. Above 25 m/s (shutdown) they go
  to 90° (edge-on, "feathered") and the rotor stops.
- Blade length changes the blade size relative to the tower.
- Drag to orbit the camera, with touch support for phones. Keep the model
  light so it runs on an older phone.

## 6. "Go deeper" toggle

A switch labelled **Go deeper**. Off by default.

- **Off:** plain-language outputs and a one-sentence explanation per output.
- **On:** reveals
  - the formula with every number substituted and each step's result
  - the efficiency chain with each step's loss in watts
  - tip-speed-ratio and rpm working
  - the Betz limit note
  - why power uses v³ (doubling the wind makes 8× the power)
  - why turbines shut down in storms
- The setting is remembered between visits (using `localStorage`, a small
  store the browser keeps for a website).

## 7. Challenge questions

A "Challenges" panel with three questions. Students use the sliders, then type
or pick an answer. The app checks it and gives a hint if wrong.

1. **The wind doubles.** Set blade length to 60 m and direction to 0°. Compare
   power at 6 m/s and 12 m/s. How many times more power? *(Answer: 8×, because
   of v³. Both speeds are below the 5 MW cap at 60 m, so the answer holds.)*
2. **Longer blades.** Set wind to 8 m/s, direction 0°. Compare 40 m and 80 m
   blades. What happens to power when the blade length doubles?
   *(Answer: 4×, because swept area uses L².)*
3. **Facing away.** Set wind to 10 m/s, blade 60 m. About what percentage of
   power is lost when the turbine is 45° off? *(Answer: about 65%, since
   cos³45° ≈ 0.35.)*

Answers are computed by `physics.js`, not typed in by hand, so they stay right
if constants change. Progress (e.g. "2 of 3 done") is shown.

## 8. Look and feel

- **Light and dark theme.** Starts from the device setting
  (`prefers-color-scheme`), with a manual toggle that is remembered. Uses CSS
  variables (named colours defined once, reused everywhere).
- **Works on phones.** Designed for a 360 px wide screen first. Single column on
  small screens; two columns (controls + visuals) on wide screens. Sliders and
  buttons at least 44 px tall for fingers. No sideways scrolling.
- **Readable.** Text at least 16 px, sufficient colour contrast, never colour
  alone to show a state (also use text or icons), keyboard-usable controls,
  labels for screen readers.
- Language: short sentences, everyday words, each technical term explained the
  first time it appears.

## 9. Out of scope (for now)

Real weather data, saving or sharing results, multiple turbines, changing air
density or efficiencies, user accounts, languages other than English.

## 10. Build plan

Each phase ends with something that works and can be opened in a browser.
Don't start a phase until the one before is working.

1. **Physics, page and tests.** *(done)*
   `physics.js` (all formulas, constants, operating states, outputs), `tests.html`
   checking the numbers against hand calculations, and a first page with the
   three sliders, the visible formula and the number readouts.
   *Done when all tests show green and moving a slider updates every number.*

2. **3D turbine.** *(done)*
   Add three.js from a CDN and `turbine3d.js`: tower, nacelle, hub, three
   blades turning at the simulated rpm, direction (yaw), blade pitch in strong
   wind, shutdown, and drag-to-rotate. Pitch comes from `physics.js`.
   *Done when the model matches the outputs (rpm, pitch, stopped) and runs
   smoothly on a phone.*

3. **Scale figure and theme toggle.**
   Add the blade scale figure (person, bus, jumbo jet), the manual light/dark
   toggle, and tidy the phone layout.
   *Done when the blade bar grows with the slider and the theme choice is remembered.*

4. **Charts and diagrams.**
   Add the power curve chart and the energy flow diagram in a separate
   drawing file. *Done when both update live and the energy arrows add up.*

5. **Go deeper and challenges.**
   Add the toggle with its extra explanations, and the three challenge
   questions with hints and progress. *Done when answers are checked using
   `physics.js` and the toggle setting is remembered.*

6. **Polish and checking.**
   Test on a real phone and in both themes, check keyboard use and colour
   contrast, fix wording against the plain-language rule, check the edge
   values (0, 3, 25, 25.5, 30 m/s; 40 and 85 m; 0 and 45°), and ask a real
   14–15 year old to try it. *Done when someone can use it without help.*

## 11. Glossary

- **Blade length (L):** distance from the centre of the rotor to the blade tip.
- **Swept area (A):** the circle the blades cover as they turn, π × L².
- **Efficiency:** the fraction of energy that gets through a step. 45% means 45 out of every 100 units.
- **Cut-in speed:** wind speed at which the turbine starts making power.
- **Rated power:** the maximum power the generator is designed to produce.
- **Feathering:** turning blades edge-on to the wind so they stop catching it.
- **Pitch:** twisting each blade about its own length.
- **Yaw:** turning the whole turbine head left or right to face the wind.
- **rpm:** rotations per minute.
- **Tip-speed ratio:** how fast the blade tip moves compared with the wind.
- **Betz limit:** the physical maximum (59.3%) of wind power any turbine can capture.
- **CDN:** a "content delivery network", a public server that hosts shared code
  libraries (like three.js) so you can load them with one line instead of
  downloading them.
- **Build step / npm:** tools that process and bundle code before it runs. This
  project avoids them; the files run directly in the browser.
