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

// Whole megawatts, for fixed limits such as "5 MW".
function formatMegawatts(watts) {
  return watts / 1000000 + " MW";
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

// ---------- Chart data ----------

// The wind speeds the power curve is worked out at: every 0.25 m/s, plus two
// points just either side of the cut-in and shutdown speeds so the curve
// jumps straight up and down there instead of sloping.
const CURVE_WIND_SPEEDS = (function () {
  const speeds = [WindPhysics.CUT_IN_SPEED_MS - 0.001, WindPhysics.SHUTDOWN_SPEED_MS + 0.001];
  for (let speed = 0; speed <= 30; speed += 0.25) {
    speeds.push(speed);
  }
  return speeds.sort(function (a, b) { return a - b; });
})();

function buildPowerCurve(bladeLength, angle) {
  return CURVE_WIND_SPEEDS.map(function (speed) {
    return {
      windSpeedMs: speed,
      powerW: WindPhysics.calculate(speed, bladeLength, angle).electricPowerW,
    };
  });
}

// The labelled sections along the bottom of the power curve.
function buildCurveZones(ratedWindSpeedMs) {
  const zones = [
    { fromMs: 0, toMs: WindPhysics.CUT_IN_SPEED_MS, label: "Too calm", isOff: true },
  ];
  if (ratedWindSpeedMs < WindPhysics.SHUTDOWN_SPEED_MS) {
    zones.push({ fromMs: WindPhysics.CUT_IN_SPEED_MS, toMs: ratedWindSpeedMs, label: "Generating", isOff: false });
    zones.push({ fromMs: ratedWindSpeedMs, toMs: WindPhysics.SHUTDOWN_SPEED_MS, label: "Full power", isOff: false });
  } else {
    zones.push({ fromMs: WindPhysics.CUT_IN_SPEED_MS, toMs: WindPhysics.SHUTDOWN_SPEED_MS, label: "Generating", isOff: false });
  }
  zones.push({ fromMs: WindPhysics.SHUTDOWN_SPEED_MS, toMs: 30, label: "Shut down", isOff: true });
  return zones;
}

// Words under the power curve that explain each section, with its wind speeds.
function describeZones(ratedWindSpeedMs) {
  const cutIn = WindPhysics.CUT_IN_SPEED_MS;
  const shutdown = WindPhysics.SHUTDOWN_SPEED_MS;
  return "Grey sections: the turbine is off. Too calm below " + cutIn + " m/s. Shut down above " + shutdown +
    " m/s. Generating from " + cutIn + " to " + ratedWindSpeedMs.toFixed(1) + " m/s. Full power (5 MW limit) from " +
    ratedWindSpeedMs.toFixed(1) + " to " + shutdown + " m/s.";
}

// Short plain-language reasons shown under each loss in the energy flow diagram.
function buildLossNotes(results) {
  const flow = results.energyFlow;
  let rotorNotes;
  if (results.state === "waiting") {
    rotorNotes = ["not enough wind", "to start"];
  } else if (results.state === "shutdown") {
    rotorNotes = ["turbine switched off", "in the storm"];
  } else if (flow.spilledW > 1) {
    rotorNotes = ["includes " + formatPower(flow.spilledW), "spilled at the", "5 MW limit"];
  } else {
    rotorNotes = ["blades can't catch", "all the wind"];
  }
  const running = results.state === "generating" || results.state === "full-power";
  return [
    rotorNotes,
    running ? ["gearbox heat", "and friction"] : [],
    running ? ["generator heat"] : [],
    running ? ["cable and", "transformer heat"] : [],
  ];
}

// ---------- "Go deeper" explanations ----------

// Replaces the contents of a list with one item per line of text.
function fillList(listElement, lines) {
  listElement.replaceChildren();
  lines.forEach(function (line) {
    const item = document.createElement("li");
    item.textContent = line;
    listElement.appendChild(item);
  });
}

function percentText(share) {
  return Math.round(share * 100) + "%";
}

// How the speeds are worked out.
function speedSteps(results, bladeLength) {
  if (results.tipSpeedMs === 0) {
    return ["The blades are not turning, so the rotor speed is 0 rpm."];
  }
  const lines = [
    "The blade tip is kept moving about " + WindPhysics.TIP_SPEED_RATIO + " times faster than the wind (this is the tip-speed ratio). " +
      WindPhysics.TIP_SPEED_RATIO + " \u00D7 " + results.effectiveWindSpeedMs.toFixed(1) + " m/s = " +
      results.tipSpeedBeforeLimitMs.toFixed(1) + " m/s.",
  ];
  if (results.tipSpeedBeforeLimitMs > WindPhysics.MAX_TIP_SPEED_MS) {
    lines.push("That is over the speed limit of " + WindPhysics.MAX_TIP_SPEED_MS + " m/s (noise and safety), so the tip speed is held at " +
      WindPhysics.MAX_TIP_SPEED_MS + " m/s.");
  }
  lines.push("To change m/s into km/h, multiply by 3.6: " + results.tipSpeedMs.toFixed(1) + " \u00D7 3.6 = " +
    Math.round(results.tipSpeedKmh) + " km/h.");
  lines.push("One turn of the rotor makes the tip travel a circle: 2 \u00D7 \u03C0 \u00D7 " + bladeLength + " m = " +
    results.rotorCircumferenceM.toFixed(0) + " m.");
  lines.push("Turns per minute = tip speed \u00F7 circle \u00D7 60 = " + results.tipSpeedMs.toFixed(1) + " \u00F7 " +
    results.rotorCircumferenceM.toFixed(0) + " \u00D7 60 = " + results.rotorRpm.toFixed(1) + " rpm.");
  return lines;
}

// The formula worked out one step at a time with the student's numbers.
function formulaSteps(results, windSpeed, bladeLength, angle) {
  const lines = [
    "Swept area: A = \u03C0 \u00D7 L\u00B2 = \u03C0 \u00D7 " + bladeLength + "\u00B2 = " +
      formatWithCommas(results.sweptAreaM2) + " m\u00B2.",
    "Wind the turbine feels: v \u00D7 cos(" + angle + "\u00B0) = " + windSpeed + " \u00D7 " +
      results.directionFactor.toFixed(2) + " = " + results.effectiveWindSpeedMs.toFixed(1) + " m/s.",
    "Power in the wind: P = \u00BD \u00D7 " + WindPhysics.AIR_DENSITY_KG_M3 + " \u00D7 " +
      formatWithCommas(results.sweptAreaM2) + " \u00D7 " + results.effectiveWindSpeedMs.toFixed(1) + "\u00B3 = " +
      formatPower(results.windPowerW) + ".",
    "Electricity: multiply by the efficiencies (0.45 \u00D7 0.97 \u00D7 0.96 \u00D7 0.98 = " +
      WindPhysics.COMBINED_EFFICIENCY.toFixed(3) + "): " + formatPower(results.windPowerW) + " \u00D7 " +
      WindPhysics.COMBINED_EFFICIENCY.toFixed(3) + " = " + formatPower(results.uncappedElectricW) + ".",
  ];
  const limitText = formatMegawatts(WindPhysics.RATED_POWER_W);
  if (results.state === "waiting") {
    lines.push("The wind is below " + WindPhysics.CUT_IN_SPEED_MS + " m/s, so the turbine does not start. Power: 0 kW.");
  } else if (results.state === "shutdown") {
    lines.push("The wind is above " + WindPhysics.SHUTDOWN_SPEED_MS + " m/s, so the turbine shuts down. Power: 0 kW.");
  } else if (results.state === "full-power") {
    lines.push("That is more than the " + limitText + " limit, so the answer is held at " + formatPower(results.electricPowerW) + ".");
  } else {
    lines.push("That is under the " + limitText + " limit, so this is the answer: " + formatPower(results.electricPowerW) + ".");
  }
  return lines;
}

// The reasons behind the three speed limits.
function limitSteps(results) {
  return [
    "Why does it need " + WindPhysics.CUT_IN_SPEED_MS + " m/s to start? Below that, the wind has too little energy to get the blades turning and beat the friction in the machine.",
    "Why a " + formatMegawatts(WindPhysics.RATED_POWER_W) + " limit? The generator and cables are built for that much. This turbine reaches it at " +
      results.ratedWindSpeedMs.toFixed(1) + " m/s. Above that, it twists its blades (pitch) to spill the extra wind.",
    "Why does it shut down above " + WindPhysics.SHUTDOWN_SPEED_MS + " m/s? Very strong wind pushes with huge force on the blades and tower and could break them. " +
      "So the turbine turns its blades edge-on (feathering) and stops.",
  ];
}

// The table showing what each stage keeps and loses.
function fillChainTable(tableBody, results) {
  const flow = results.energyFlow;
  const rows = [["Rotor (turns wind into spin)", percentText(WindPhysics.EFFICIENCY_ROTOR), formatPower(flow.rotorLossW)]];
  if (flow.spilledW > 1) {
    const reason = results.state === "waiting" ? "too little wind"
      : results.state === "shutdown" ? "storm shutdown" : "above the 5 MW limit";
    rows.push(["Wind not used (" + reason + ")", "none", formatPower(flow.spilledW)]);
  }
  rows.push(["Gearbox", percentText(WindPhysics.EFFICIENCY_GEARBOX), formatPower(flow.gearboxLossW)]);
  rows.push(["Generator", percentText(WindPhysics.EFFICIENCY_GENERATOR), formatPower(flow.generatorLossW)]);
  rows.push(["Grid connection (cables, transformer)", percentText(WindPhysics.EFFICIENCY_GRID), formatPower(flow.gridLossW)]);
  rows.push(["All four stages together", (WindPhysics.COMBINED_EFFICIENCY * 100).toFixed(1) + "%",
    formatPower(flow.windPowerW - flow.afterGridW)]);

  tableBody.replaceChildren();
  rows.forEach(function (cells) {
    const row = document.createElement("tr");
    cells.forEach(function (text) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.appendChild(cell);
    });
    tableBody.appendChild(row);
  });
}

function fillDeeper(results, windSpeed, bladeLength, angle) {
  fillList(document.getElementById("speed-steps"), speedSteps(results, bladeLength));
  fillList(document.getElementById("formula-steps"), formulaSteps(results, windSpeed, bladeLength, angle));
  fillList(document.getElementById("limit-steps"), limitSteps(results));
  fillChainTable(document.getElementById("chain-table"), results);
  document.getElementById("betz-note").textContent =
    "No turbine can ever catch more than " + (WindPhysics.BETZ_LIMIT * 100).toFixed(1) +
    "% of the wind's power. This is called the Betz limit. Real blades catch about " +
    percentText(WindPhysics.EFFICIENCY_ROTOR) + ", which is very good.";
  document.getElementById("cube-note").textContent =
    "Why v\u00B3? Say the wind goes from 5 m/s to 10 m/s. Each bit of air carries 4 times the energy (2 \u00D7 2), " +
    "and twice as much air arrives every second (2). So the power is 4 \u00D7 2 = 8 times bigger. " +
    "(That is only true while the turbine is below its 5 MW limit.)";
}

// ---------- The Go deeper switch ----------

const GO_DEEPER_STORAGE_KEY = "windSimGoDeeper";

function showGoDeeper(isOn) {
  document.body.classList.toggle("go-deeper", isOn);
}

// localStorage is a small store the browser keeps for this website. It can be
// switched off (private windows, some schools), so every use is wrapped in try.
function loadGoDeeperSetting() {
  try {
    return localStorage.getItem(GO_DEEPER_STORAGE_KEY) === "on";
  } catch (error) {
    return false;
  }
}

function saveGoDeeperSetting(isOn) {
  try {
    localStorage.setItem(GO_DEEPER_STORAGE_KEY, isOn ? "on" : "off");
  } catch (error) {
    // Not saved. The switch still works for this visit.
  }
}

const goDeeperSwitch = document.getElementById("go-deeper");
goDeeperSwitch.checked = loadGoDeeperSetting();
showGoDeeper(goDeeperSwitch.checked);
goDeeperSwitch.addEventListener("change", function () {
  showGoDeeper(goDeeperSwitch.checked);
  saveGoDeeperSetting(goDeeperSwitch.checked);
});

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

  // The two charts. physics.js worked out the numbers; charts.js only draws them.
  const curvePoints = buildPowerCurve(bladeLength, angle);
  Charts.drawPowerCurve(document.getElementById("power-chart"), {
    points: curvePoints,
    currentWindMs: windSpeed,
    currentPowerW: results.electricPowerW,
    zones: buildCurveZones(results.ratedWindSpeedMs),
    formatPower: formatPower,
    summary: "Power curve for " + bladeLength + " metre blades. At " + windSpeed +
      " metres per second the turbine makes " + formatPower(results.electricPowerW) + ".",
  });
  document.getElementById("now-text").textContent =
    "Now: " + windSpeed + " m/s, " + formatPower(results.electricPowerW);
  document.getElementById("zone-text").textContent = describeZones(results.ratedWindSpeedMs);
  Charts.fillPowerTable(document.getElementById("power-table"), curvePoints, formatPower);

  const flow = results.energyFlow;
  Charts.drawEnergyFlow(document.getElementById("flow-chart"), {
    flow: flow,
    lossNotes: buildLossNotes(results),
    formatPower: formatPower,
    summary: "Energy flow. " + formatPower(flow.windPowerW) + " of wind reaches the blades and " +
      formatPower(flow.afterGridW) + " reaches the grid.",
  });

  // Number readouts
  document.getElementById("out-power").textContent = formatPower(results.electricPowerW);
  document.getElementById("out-homes").textContent = formatWithCommas(results.homesPowered);
  document.getElementById("homes-note").textContent =
    (results.homesPowered === 0 ? "No homes right now. " : "") +
    "Counting " + (WindPhysics.WATTS_PER_HOME / 1000) + " kW for each home (about " +
    formatWithCommas(WindPhysics.HOME_KWH_PER_YEAR) + " kWh a year).";
  document.getElementById("out-pitch").textContent = Math.round(results.pitchAngleDegrees);
  document.getElementById("out-rpm").textContent = results.rotorRpm.toFixed(1);
  document.getElementById("out-tip").textContent = Math.round(results.tipSpeedKmh);
  document.getElementById("out-efficiency").textContent =
    (results.overallEfficiency * 100).toFixed(1) + "%";

  fillDeeper(results, windSpeed, bladeLength, angle);

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

// Moves the three sliders to a situation (used by the challenge buttons).
function setSliders(oneSituation) {
  windSlider.value = oneSituation.windSpeedMs;
  bladeSlider.value = oneSituation.bladeLengthMetres;
  angleSlider.value = oneSituation.angleDegrees;
  update();
}

// Build the challenge questions.
Challenges.init(document.getElementById("challenges"), document.getElementById("challenge-progress"), {
  formatPower: formatPower,
  setSliders: setSliders,
});

// Start the 3D view. If it can't start, the rest of the page still works.
Turbine3D.init(document.getElementById("scene"));

// Run update() every time any slider moves, and once at the start.
[windSlider, bladeSlider, angleSlider].forEach(function (slider) {
  slider.addEventListener("input", update);
});
update();
