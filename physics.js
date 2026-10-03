// physics.js
// ALL the wind turbine maths lives in this file and nowhere else.
// Rules: it takes numbers in and gives numbers out. It never touches the web
// page (no document, no window), so tests.html can check it on its own.
//
// Units used everywhere:
//   speeds in m/s (metres per second), lengths in metres, power in watts (W),
//   angles in degrees (converted to radians inside the functions that need it).

// ---------- Fixed numbers (constants) ----------

const AIR_DENSITY_KG_M3 = 1.2; // "rho" in the formula; kilograms per cubic metre

// Efficiency = the share of energy that gets through each step (0.45 = 45%).
const EFFICIENCY_ROTOR = 0.45;
const EFFICIENCY_GEARBOX = 0.97;
const EFFICIENCY_GENERATOR = 0.96;
const EFFICIENCY_GRID = 0.98;
// Wind energy passes through all four steps, so we multiply them together.
const COMBINED_EFFICIENCY =
  EFFICIENCY_ROTOR * EFFICIENCY_GEARBOX * EFFICIENCY_GENERATOR * EFFICIENCY_GRID; // about 0.4107

const CUT_IN_SPEED_MS = 3; // below this the turbine does not start
const SHUTDOWN_SPEED_MS = 25; // above this the turbine stops to stay safe in a storm
const RATED_POWER_W = 5000000; // 5 MW: the most the generator may produce

// Tip-speed ratio: the blade tip moves about 7 times faster than the wind.
const TIP_SPEED_RATIO = 7;
// Real turbines limit tip speed (noise and safety). 85 m/s is about 306 km/h.
const MAX_TIP_SPEED_MS = 85;

// Blade pitch = twisting each blade about its own length to catch less wind.
const MAX_PITCH_DEGREES = 30; // reached at the shutdown speed
const FEATHERED_PITCH_DEGREES = 90; // blades edge-on to the wind when shut down

// Assumption for "homes powered": an average home uses 1 kW (1000 W) all day.
const WATTS_PER_HOME = 1000;
const HOME_KWH_PER_YEAR = (WATTS_PER_HOME / 1000) * 24 * 365; // 1 kW all year = 8,760 kWh

// The Betz limit: no turbine can capture more than 59.3% of the wind's power.
const BETZ_LIMIT = 0.593;

// ---------- Small building-block functions ----------

// The circle the blades sweep out: A = pi x L squared.
function sweptAreaM2(bladeLengthMetres) {
  return Math.PI * bladeLengthMetres * bladeLengthMetres;
}

// A turbine facing away from the wind only "feels" the part of the wind that
// points straight at it. cos(0 degrees) = 1, so facing the wind loses nothing.
function effectiveWindSpeedMs(windSpeedMs, angleDegrees) {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  return windSpeedMs * Math.cos(angleRadians);
}

// The formula students see: P = 1/2 x rho x A x v cubed.
// This is the power in the wind passing through the blades, before any losses.
function windPowerWatts(areaM2, windSpeedMs) {
  return 0.5 * AIR_DENSITY_KG_M3 * areaM2 * Math.pow(windSpeedMs, 3);
}

// The wind speed at which the turbine first reaches 5 MW.
// We turn the power formula around and solve it for the speed.
// It depends on blade length (and direction), so it is worked out, not fixed.
function ratedWindSpeedMs(bladeLengthMetres, angleDegrees) {
  const area = sweptAreaM2(bladeLengthMetres);
  const effectiveSpeed = Math.cbrt(
    RATED_POWER_W / (0.5 * AIR_DENSITY_KG_M3 * area * COMBINED_EFFICIENCY)
  );
  const angleRadians = (angleDegrees * Math.PI) / 180;
  return effectiveSpeed / Math.cos(angleRadians);
}

// How far the blades are twisted. Normal wind: 0 degrees (flat to the wind).
// Once the turbine is at full power, the blades twist smoothly from 0 degrees at
// the rated wind speed up to 30 degrees at 25 m/s, spilling the extra wind.
// In a storm shutdown they turn fully edge-on (90 degrees).
function pitchAngleDegrees(state, windSpeedMs, ratedSpeedMs) {
  if (state === "shutdown") {
    return FEATHERED_PITCH_DEGREES;
  }
  if (state !== "full-power") {
    return 0;
  }
  const range = SHUTDOWN_SPEED_MS - ratedSpeedMs;
  if (range <= 0) {
    return 0;
  }
  const fraction = Math.min(1, Math.max(0, (windSpeedMs - ratedSpeedMs) / range));
  return MAX_PITCH_DEGREES * fraction;
}

// ---------- The main function ----------

// Takes the three things the student controls and returns everything we show.
// state is one of: "waiting", "generating", "full-power", "shutdown".
function calculate(windSpeedMs, bladeLengthMetres, angleDegrees) {
  const area = sweptAreaM2(bladeLengthMetres);
  const effectiveSpeed = effectiveWindSpeedMs(windSpeedMs, angleDegrees);
  const windPowerAtTurbineW = windPowerWatts(area, effectiveSpeed);
  const uncappedElectricW = windPowerAtTurbineW * COMBINED_EFFICIENCY;

  // Cut-in and shutdown use the REAL wind speed, so a turbine that is turned
  // away still shuts down in a storm.
  let state;
  if (windSpeedMs < CUT_IN_SPEED_MS) {
    state = "waiting";
  } else if (windSpeedMs > SHUTDOWN_SPEED_MS) {
    state = "shutdown";
  } else if (uncappedElectricW >= RATED_POWER_W) {
    state = "full-power";
  } else {
    state = "generating";
  }

  const running = state === "generating" || state === "full-power";
  const electricPowerW = running ? Math.min(uncappedElectricW, RATED_POWER_W) : 0;

  // Blade tip speed: 7 x the wind the turbine feels, but never above the limit.
  const tipSpeedBeforeLimitMs = running ? TIP_SPEED_RATIO * effectiveSpeed : 0;
  const tipSpeedMs = Math.min(tipSpeedBeforeLimitMs, MAX_TIP_SPEED_MS);
  // One rotation makes the tip travel a full circle of length 2 x pi x L.
  const rotorCircumferenceM = 2 * Math.PI * bladeLengthMetres;
  const rotorRpm = (tipSpeedMs / rotorCircumferenceM) * 60;

  // Overall efficiency compares electricity out with the power in the wind
  // blowing at the real wind speed. It drops when the turbine is turned away
  // and when the 5 MW cap trims the output.
  const windPowerRealW = windPowerWatts(area, windSpeedMs);
  const overallEfficiency = windPowerRealW > 0 ? electricPowerW / windPowerRealW : 0;

  const ratedSpeed = ratedWindSpeedMs(bladeLengthMetres, angleDegrees);

  // Where the energy goes, stage by stage (all in watts). This feeds the energy
  // flow diagram. Only the wind the turbine actually uses flows through the
  // stages. Any wind above the 5 MW limit is "spilled", and if the turbine is
  // stopped none of the wind is used.
  const usedWindW = running ? electricPowerW / COMBINED_EFFICIENCY : 0;
  const afterRotorW = usedWindW * EFFICIENCY_ROTOR;
  const afterGearboxW = afterRotorW * EFFICIENCY_GEARBOX;
  const afterGeneratorW = afterGearboxW * EFFICIENCY_GENERATOR;
  const energyFlow = {
    windPowerW: windPowerAtTurbineW,
    spilledW: windPowerAtTurbineW - usedWindW, // not used because of the 5 MW limit or a stopped turbine
    // What is lost at each of the four steps (these plus afterGridW add up to windPowerW).
    notCapturedW: windPowerAtTurbineW - afterRotorW, // the rotor's own loss plus any spilled wind
    rotorLossW: usedWindW - afterRotorW, // the rotor's own loss only
    gearboxLossW: afterRotorW - afterGearboxW,
    generatorLossW: afterGearboxW - afterGeneratorW,
    gridLossW: afterGeneratorW - electricPowerW,
    afterRotorW: afterRotorW,
    afterGearboxW: afterGearboxW,
    afterGeneratorW: afterGeneratorW,
    afterGridW: electricPowerW,
  };

  return {
    state: state,
    sweptAreaM2: area,
    directionFactor: Math.cos((angleDegrees * Math.PI) / 180), // 1 when facing the wind
    effectiveWindSpeedMs: effectiveSpeed,
    windPowerW: windPowerAtTurbineW,
    uncappedElectricW: uncappedElectricW, // what it would make with no 5 MW limit
    electricPowerW: electricPowerW,
    tipSpeedBeforeLimitMs: tipSpeedBeforeLimitMs, // 7 x the wind, before the 85 m/s limit
    rotorCircumferenceM: rotorCircumferenceM,
    tipSpeedMs: tipSpeedMs,
    tipSpeedKmh: tipSpeedMs * 3.6, // 1 m/s = 3.6 km/h
    rotorRpm: rotorRpm,
    homesPowered: Math.floor(electricPowerW / WATTS_PER_HOME),
    overallEfficiency: overallEfficiency, // 0 to 1
    ratedWindSpeedMs: ratedSpeed,
    pitchAngleDegrees: pitchAngleDegrees(state, windSpeedMs, ratedSpeed),
    energyFlow: energyFlow,
  };
}

// ---------- Comparing two situations (used by the challenge questions) ----------

// Each situation is { windSpeedMs, bladeLengthMetres, angleDegrees }.
// How many times more power the second situation makes than the first.
function powerChangeFactor(firstSituation, secondSituation) {
  const first = calculate(
    firstSituation.windSpeedMs, firstSituation.bladeLengthMetres, firstSituation.angleDegrees
  );
  const second = calculate(
    secondSituation.windSpeedMs, secondSituation.bladeLengthMetres, secondSituation.angleDegrees
  );
  return second.electricPowerW / first.electricPowerW;
}

// How much power (in percent) is lost when going from the first situation to the second.
function percentPowerLost(firstSituation, secondSituation) {
  return (1 - powerChangeFactor(firstSituation, secondSituation)) * 100;
}

// One tidy bundle so other files write WindPhysics.calculate(...).
const WindPhysics = {
  AIR_DENSITY_KG_M3: AIR_DENSITY_KG_M3,
  COMBINED_EFFICIENCY: COMBINED_EFFICIENCY,
  EFFICIENCY_ROTOR: EFFICIENCY_ROTOR,
  EFFICIENCY_GEARBOX: EFFICIENCY_GEARBOX,
  EFFICIENCY_GENERATOR: EFFICIENCY_GENERATOR,
  EFFICIENCY_GRID: EFFICIENCY_GRID,
  TIP_SPEED_RATIO: TIP_SPEED_RATIO,
  MAX_TIP_SPEED_MS: MAX_TIP_SPEED_MS,
  WATTS_PER_HOME: WATTS_PER_HOME,
  HOME_KWH_PER_YEAR: HOME_KWH_PER_YEAR,
  BETZ_LIMIT: BETZ_LIMIT,
  MAX_PITCH_DEGREES: MAX_PITCH_DEGREES,
  CUT_IN_SPEED_MS: CUT_IN_SPEED_MS,
  SHUTDOWN_SPEED_MS: SHUTDOWN_SPEED_MS,
  RATED_POWER_W: RATED_POWER_W,
  sweptAreaM2: sweptAreaM2,
  effectiveWindSpeedMs: effectiveWindSpeedMs,
  windPowerWatts: windPowerWatts,
  ratedWindSpeedMs: ratedWindSpeedMs,
  calculate: calculate,
  powerChangeFactor: powerChangeFactor,
  percentPowerLost: percentPowerLost,
};
