# Project rules: Wind Turbine Simulator

Educational wind turbine simulator for 14–15 year old students. The full
description is in `SPEC.md`. Read it before changing anything. The owner is a
beginner, so keep code simple and explain choices.

## Technology

- Plain **HTML, CSS and JavaScript** only.
- **No build step and no npm.** No `package.json`, bundlers, TypeScript or
  frameworks. The app must work by opening `index.html` in a browser (or via a
  simple static server such as `python3 -m http.server`).
- **three.js is loaded from a CDN** with a pinned version number (never
  "latest"). Use it only for the 3D turbine. Any other library needs the
  owner's approval first.
- Use ES modules (`<script type="module">`) only if they work from a plain
  static server; if in doubt, use ordinary `<script>` tags.

## File layout

```
index.html     page structure
style.css      all styling, light/dark via CSS variables
physics.js     ALL physics: constants, formulas, states, outputs
app.js         reads inputs, calls physics, updates the page
charts.js      power curve and energy flow drawing
turbine3d.js   three.js model
tests.html     checks the physics numbers
SPEC.md        what the app does
```

## Separate physics from drawing

- `physics.js` holds every formula and constant (ρ = 1.2, efficiencies,
  cut-in 3, rated 5 MW, shutdown 25, homes-per-kW, tip-speed ratio).
  Constants are named and defined once, with units in the name or a comment
  (e.g. `AIR_DENSITY_KG_M3`).
- `physics.js` **never touches the page**: no `document`, no `window`, no
  three.js, no canvas. It takes numbers in and returns numbers out. This lets
  `tests.html` check it on its own.
- Drawing files (`charts.js`, `turbine3d.js`) **never do physics**. They get
  results from `physics.js` (via `app.js`) and only draw them.
- Don't copy a formula into a second file. Call `physics.js`.
- Challenge answers are computed with `physics.js`, not typed in by hand.

## Plain language for students

- All text on screen: short sentences, everyday words, reading age about 13.
- Explain each technical term the first time it appears (a short hint or the
  Go deeper panel). Always show units (m/s, MW, km/h, rpm).
- Detailed maths goes behind the "Go deeper" toggle.
- Error and hint messages are friendly and say what to try next.

## Code style (for a beginner)

- Clear names (`bladeLengthMetres`, not `bl`). Small functions that do one thing.
- Add a short comment saying **why**, especially for physics. Don't comment the obvious.
- No clever tricks; prefer readable over short.
- When adding something new, say in your reply what it does and what any new
  technical term means.

## tests.html

- Opens in a browser with no setup and lists each check as PASS or FAIL, with
  the expected and actual number, and a clear total at the top.
- Compares numbers with a small tolerance (not `===`), because decimals
  are imprecise.
- Checks at least: swept area; wind power at known inputs; the cos³ direction
  effect; the combined efficiency (≈ 0.4107); below cut-in = 0; exactly at
  25 m/s is still running and above 25 = 0; the 5 MW cap; tip speed and rpm;
  homes powered; overall efficiency; the three challenge answers (8×, 4×, ≈35%).
- Expected values are worked out by hand and written as plain numbers in the test, not
  by calling the same function being tested.
- Any physics change must be accompanied by a test change, and all tests must
  pass before committing.

## Working rules

- Work through the phases in `SPEC.md` in order; one phase at a time.
- Manual check before saying a phase is done: open the page, try the edge
  values (0, 3, 25, 25.5, 30 m/s; 40 and 85 m; 0° and 45°), and look at it at
  phone width and in both themes.
- Must work on phones: test at 360 px wide; touch-friendly controls; keep 3D
  light (no heavy models or textures).
- Commit small, with plain-English messages.
