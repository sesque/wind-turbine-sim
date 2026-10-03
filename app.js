// app.js
// Connects the page to the physics. It reads the sliders, asks physics.js for
// the numbers, and writes them onto the page. It does no physics itself.

const windSlider = document.getElementById("wind");
const bladeSlider = document.getElementById("blade");
const angleSlider = document.getElementById("angle");

// Word labels for the wind speed (from SPEC.md). Each entry means
// "if the whole-number wind speed is BELOW upTo, use this word".
const WIND_WORDS = [
  { upTo: 3, word: "Calm" },
  { upTo: 6, word: "Light breeze" },
  { upTo: 9, word: "Gentle breeze" },
  { upTo: 12, word: "Moderate wind" },
  { upTo: 15, word: "Fresh wind" },
  { upTo: 20, word: "Strong wind" },
  { upTo: 25, word: "Gale" },
  { upTo: Infinity, word: "Storm" },
];

function windWord(windSpeedMs) {
  // Math.floor makes 5.5 count as 5, so it uses the lower range's word.
  const wholeSpeed = Math.floor(windSpeedMs);
  return WIND_WORDS.find(function (entry) {
    return wholeSpeed < entry.upTo;
  }).word;
}

// Under 1 MW we show kW so small numbers stay easy to read.
function formatPower(watts) {
  if (watts >= 1000000) {
    return (watts / 1000000).toFixed(2) + " MW";
  }
  return Math.round(watts / 1000) + " kW";
}

function formatWithCommas(number) {
  return Math.round(number).toLocaleString("en-GB");
}

// A friendly sentence for each state, and whether it is "good" (ok) or a warning.
function statusMessage(results) {
  switch (results.state) {
    case "waiting":
      return {
        text: "Too little wind. The turbine needs at least 3 m/s to start (this is called the cut-in speed).",
        kind: "warn",
      };
    case "shutdown":
      return {
        text: "Storm! Above 25 m/s the turbine switches itself off to stay safe.",
        kind: "warn",
      };
    case "full-power":
      return {
        text:
          "Full power! The generator can only make 5 MW, so the extra wind is wasted. " +
          "This turbine reaches full power at " +
          results.ratedWindSpeedMs.toFixed(1) +
          " m/s.",
        kind: "ok",
      };
    default:
      return { text: "Generating electricity.", kind: "ok" };
  }
}

// A short sentence about the blades (pitch = twisting each blade about its length).
function pitchNote(results) {
  if (results.state === "shutdown") {
    return "The blades are turned edge-on to the wind and have stopped. This is called feathering.";
  }
  if (results.pitchAngleDegrees > 0) {
    return "The blades are pitching (twisting) by " + Math.round(results.pitchAngleDegrees) +
      "\u00B0 to spill extra wind.";
  }
  return "";
}

function update() {
  const windSpeed = Number(windSlider.value);
  const bladeLength = Number(bladeSlider.value);
  const angle = Number(angleSlider.value);

  const results = WindPhysics.calculate(windSpeed, bladeLength, angle);

  // Slider labels
  document.getElementById("wind-value").textContent = windSpeed;
  document.getElementById("wind-word").textContent = windWord(windSpeed);
  document.getElementById("blade-value").textContent = bladeLength;
  document.getElementById("angle-value").textContent = angle;

  // Status message
  const status = statusMessage(results);
  const statusElement = document.getElementById("status");
  statusElement.textContent = status.text;
  statusElement.className = "status " + status.kind;

  // The 3D turbine. Physics gave us the numbers; turbine3d.js only draws them.
  Turbine3D.update({
    bladeLengthMetres: bladeLength,
    yawDegrees: angle,
    rotorRpm: results.rotorRpm,
    pitchDegrees: results.pitchAngleDegrees,
    windSpeedMs: windSpeed,
  });
  document.getElementById("scene-note").textContent = pitchNote(results);

  // Number readouts
  document.getElementById("out-power").textContent = formatPower(results.electricPowerW);
  document.getElementById("out-homes").textContent = formatWithCommas(results.homesPowered);
  document.getElementById("out-pitch").textContent = Math.round(results.pitchAngleDegrees);
  document.getElementById("out-rpm").textContent = results.rotorRpm.toFixed(1);
  document.getElementById("out-tip").textContent = Math.round(results.tipSpeedKmh);
  document.getElementById("out-efficiency").textContent =
    (results.overallEfficiency * 100).toFixed(1) + "%";

  // The formula with the student's own numbers filled in.
  // It uses the effective wind speed, which is the wind the turbine really feels.
  const effectiveSpeed = results.effectiveWindSpeedMs;
  document.getElementById("formula-numbers").textContent =
    "P = ½ × " + WindPhysics.AIR_DENSITY_KG_M3 +
    " × " + formatWithCommas(results.sweptAreaM2) +
    " × " + effectiveSpeed.toFixed(1) + "³" +
    " = " + formatPower(results.windPowerW) + " in the wind";

  document.getElementById("formula-note").textContent =
    angle > 0
      ? "The turbine isn't facing the wind, so it only feels " + effectiveSpeed.toFixed(1) +
        " m/s of the " + windSpeed + " m/s wind. It catches less."
      : "";
}

// Start the 3D view. If it can't start, the rest of the page still works.
Turbine3D.init(document.getElementById("scene"));

// Run update() every time any slider moves, and once at the start.
[windSlider, bladeSlider, angleSlider].forEach(function (slider) {
  slider.addEventListener("input", update);
});
update();
