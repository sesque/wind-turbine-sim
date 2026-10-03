// charts.js
// Draws the power curve chart and the energy flow diagram as SVG.
// SVG ("scalable vector graphics") is a way to draw shapes and text on a web
// page that stay sharp at any size.
//
// Rule: this file only DRAWS. It does no physics. app.js gives it numbers that
// physics.js worked out, and a function (formatPower) to turn watts into text.
//
// Colours come from CSS variables in style.css, so light and dark mode work
// without any changes here.

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// ---------- Small helpers ----------

// Makes one SVG element, e.g. svgElement("line", { x1: 0, y1: 0, x2: 10, y2: 10 }).
function svgElement(tagName, attributes, text) {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);
  Object.keys(attributes || {}).forEach(function (name) {
    element.setAttribute(name, attributes[name]);
  });
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

// Re-draws a chart whenever its box changes size (turning a phone sideways, for example).
// "drawAgain" is a function that draws the chart with the latest data.
function redrawOnResize(container, drawAgain) {
  if (container.dataset.watching === "yes") {
    return;
  }
  container.dataset.watching = "yes";
  new ResizeObserver(function () {
    // Only the width matters. (Drawing changes the height, which must not trigger another draw.)
    if (String(container.clientWidth) !== container.dataset.drawnWidth) {
      drawAgain();
    }
  }).observe(container);
}

// ---------- Power curve ----------

const CURVE_MARGIN = { left: 44, right: 14, top: 38, bottom: 40 };
const CURVE_MAX_WIND_MS = 30;
const CURVE_MAX_POWER_W = 5600000; // the top of the chart, a little above 5 MW
const CURVE_GRID_POWERS_W = [0, 1000000, 2000000, 3000000, 4000000, 5000000];

let lastCurveData = null; // remembered so the chart can redraw when resized

// data.points:       list of { windSpeedMs, powerW } along the curve
// data.currentWindMs, data.currentPowerW: where the moving dot goes
// data.zones:        list of { fromMs, toMs, label, isOff } (the sections: too calm, generating...)
// data.formatPower:  turns watts into text like "3.2 MW"
// data.summary:      a sentence for screen readers
function drawPowerCurve(container, data) {
  lastCurveData = data;
  redrawOnResize(container, function () {
    drawPowerCurve(container, lastCurveData);
  });

  const width = container.clientWidth;
  if (width === 0) {
    return;
  }
  container.dataset.drawnWidth = width;
  const height = Math.round(Math.min(340, Math.max(240, width * 0.62)));
  const plotLeft = CURVE_MARGIN.left;
  const plotRight = width - CURVE_MARGIN.right;
  const plotTop = CURVE_MARGIN.top;
  const plotBottom = height - CURVE_MARGIN.bottom;

  // Turn a wind speed or power into a position on the screen.
  function xFor(windSpeedMs) {
    return plotLeft + (windSpeedMs / CURVE_MAX_WIND_MS) * (plotRight - plotLeft);
  }
  function yFor(powerW) {
    return plotBottom - (powerW / CURVE_MAX_POWER_W) * (plotBottom - plotTop);
  }

  const svg = svgElement("svg", {
    viewBox: "0 0 " + width + " " + height,
    role: "img",
    "aria-label": data.summary,
  });

  // Sections of the chart (waiting, generating, full power, shut down).
  data.zones.forEach(function (zone) {
    const left = xFor(zone.fromMs);
    const right = xFor(zone.toMs);
    if (zone.isOff) {
      // A pale wash marks the sections where the turbine makes nothing.
      svg.appendChild(svgElement("rect", {
        x: left, y: plotTop, width: right - left, height: plotBottom - plotTop,
        class: "chart-wash",
      }));
    }
    // The label goes above the chart if it fits. If a section is too narrow
    // (on a phone), the words under the chart say the same thing.
    const fits = right - left > zone.label.length * 6.5 + 8;
    if (fits) {
      svg.appendChild(svgElement("text", {
        x: (left + right) / 2, y: plotTop - 10, "text-anchor": "middle", class: "chart-text-muted",
      }, zone.label));
    }
  });

  // Faint horizontal lines with power labels on the left.
  CURVE_GRID_POWERS_W.forEach(function (powerW) {
    svg.appendChild(svgElement("line", {
      x1: plotLeft, x2: plotRight, y1: yFor(powerW), y2: yFor(powerW), class: "chart-grid",
    }));
    svg.appendChild(svgElement("text", {
      x: plotLeft - 8, y: yFor(powerW) + 4, "text-anchor": "end", class: "chart-text-muted",
    }, String(powerW / 1000000)));
  });
  svg.appendChild(svgElement("text", {
    x: plotLeft - 8, y: 12, "text-anchor": "start", class: "chart-text-muted",
  }, "Power (MW)"));

  // Wind speed labels along the bottom.
  for (let windSpeedMs = 0; windSpeedMs <= CURVE_MAX_WIND_MS; windSpeedMs += 5) {
    svg.appendChild(svgElement("text", {
      x: xFor(windSpeedMs), y: plotBottom + 18, "text-anchor": "middle", class: "chart-text-muted",
    }, String(windSpeedMs)));
  }
  svg.appendChild(svgElement("text", {
    x: (plotLeft + plotRight) / 2, y: height - 6, "text-anchor": "middle", class: "chart-text-muted",
  }, "Wind speed (m/s)"));

  // Thin lines where one section ends and the next begins.
  data.zones.slice(1).forEach(function (zone) {
    svg.appendChild(svgElement("line", {
      x1: xFor(zone.fromMs), x2: xFor(zone.fromMs), y1: plotTop, y2: plotBottom, class: "chart-grid",
    }));
  });

  // The curve itself: a line, with a faint fill underneath.
  const curveCommands = data.points.map(function (point, index) {
    return (index === 0 ? "M" : "L") + xFor(point.windSpeedMs).toFixed(1) + " " + yFor(point.powerW).toFixed(1);
  });
  const lastPoint = data.points[data.points.length - 1];
  svg.appendChild(svgElement("path", {
    d: curveCommands.join(" ") + " L" + xFor(lastPoint.windSpeedMs).toFixed(1) + " " + plotBottom +
       " L" + xFor(data.points[0].windSpeedMs).toFixed(1) + " " + plotBottom + " Z",
    class: "chart-area",
  }));
  svg.appendChild(svgElement("path", { d: curveCommands.join(" "), class: "chart-line" }));

  // The moving dot for the current wind speed, with a line down to the axis.
  const dotX = xFor(data.currentWindMs);
  const dotY = yFor(data.currentPowerW);
  svg.appendChild(svgElement("line", {
    x1: dotX, x2: dotX, y1: dotY, y2: plotBottom, class: "chart-now-line",
  }));
  svg.appendChild(svgElement("circle", { cx: dotX, cy: dotY, r: 6, class: "chart-now-dot" }));

  // Hover (mouse) or touch-and-drag: a line follows the pointer and a small box
  // shows the power at that wind speed.
  const hoverLine = svgElement("line", {
    y1: plotTop, y2: plotBottom, class: "chart-hover-line", visibility: "hidden",
  });
  const hoverDot = svgElement("circle", { r: 4, class: "chart-hover-dot", visibility: "hidden" });
  svg.appendChild(hoverLine);
  svg.appendChild(hoverDot);

  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;

  const hitArea = svgElement("rect", {
    x: plotLeft, y: plotTop, width: plotRight - plotLeft, height: plotBottom - plotTop,
    fill: "transparent",
  });
  hitArea.addEventListener("pointermove", function (event) {
    const box = svg.getBoundingClientRect();
    const windSpeedMs =
      ((event.clientX - box.left - plotLeft) / (plotRight - plotLeft)) * CURVE_MAX_WIND_MS;
    // Find the nearest point we have numbers for.
    let nearest = data.points[0];
    data.points.forEach(function (point) {
      if (Math.abs(point.windSpeedMs - windSpeedMs) < Math.abs(nearest.windSpeedMs - windSpeedMs)) {
        nearest = point;
      }
    });
    const x = xFor(nearest.windSpeedMs);
    const y = yFor(nearest.powerW);
    hoverLine.setAttribute("x1", x);
    hoverLine.setAttribute("x2", x);
    hoverDot.setAttribute("cx", x);
    hoverDot.setAttribute("cy", y);
    hoverLine.setAttribute("visibility", "visible");
    hoverDot.setAttribute("visibility", "visible");

    tip.textContent = nearest.windSpeedMs.toFixed(1) + " m/s: " + data.formatPower(nearest.powerW);
    tip.hidden = false;
    // Keep the box inside the chart.
    const tipWidth = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(x - tipWidth / 2, 0), width - tipWidth) + "px";
    tip.style.top = Math.max(y - 40, 0) + "px";
  });
  hitArea.addEventListener("pointerleave", function () {
    hoverLine.setAttribute("visibility", "hidden");
    hoverDot.setAttribute("visibility", "hidden");
    tip.hidden = true;
  });
  svg.appendChild(hitArea);

  container.replaceChildren(svg, tip);
}

// Fills a table (for people who prefer numbers, or use screen readers) with the
// power at each whole number of m/s.
function fillPowerTable(tableBody, points, formatPower) {
  tableBody.replaceChildren();
  points.forEach(function (point) {
    if (!Number.isInteger(point.windSpeedMs)) {
      return;
    }
    const row = document.createElement("tr");
    const windCell = document.createElement("td");
    windCell.textContent = point.windSpeedMs;
    const powerCell = document.createElement("td");
    powerCell.textContent = formatPower(point.powerW);
    row.appendChild(windCell);
    row.appendChild(powerCell);
    tableBody.appendChild(row);
  });
}

// ---------- Energy flow diagram ----------

// A "Sankey-style" diagram: wide bands show energy flowing along, and they get
// thinner at each stage as some energy is lost. Each loss drops off the band.
// It runs left to right on wide screens and top to bottom on phones.
//
// To draw both ways with the same code we think in two directions:
//   "along"  = the way the energy flows (across the page, or down it)
//   "across" = the band's thickness direction (down the page, or across it)

const FLOW_STAGE_NAMES = ["Wind", "Rotor", "Gearbox", "Generator", "Grid"];
const FLOW_SIDEWAYS_MIN_WIDTH = 520; // narrower than this, draw top to bottom

let lastFlowData = null;

// data.flow:        the energyFlow numbers from physics.js (watts)
// data.lossNotes:   for each of the 4 losses, a list of short text lines
// data.formatPower: turns watts into text
// data.summary:     a sentence for screen readers
function drawEnergyFlow(container, data) {
  lastFlowData = data;
  redrawOnResize(container, function () {
    drawEnergyFlow(container, lastFlowData);
  });

  const width = container.clientWidth;
  if (width === 0) {
    return;
  }
  container.dataset.drawnWidth = width;
  const flow = data.flow;
  const sideways = width >= FLOW_SIDEWAYS_MIN_WIDTH;

  // The power left after each stage, and the loss at each of the four steps (from physics.js).
  const values = [
    flow.windPowerW, flow.afterRotorW, flow.afterGearboxW, flow.afterGeneratorW, flow.afterGridW,
  ];
  const losses = [flow.notCapturedW, flow.gearboxLossW, flow.generatorLossW, flow.gridLossW];

  // Layout numbers
  const maxThickness = sideways ? 64 : 52; // thickness of the widest band (the wind)
  const lossLength = 30; // how far a loss drops beyond the widest band
  const padding = 12;
  let alongPositions; // where each stage sits along the flow
  let bandStart; // where the bands begin on the "across" axis
  let height;
  if (sideways) {
    const columnWidth = (width - 2 * padding) / 5;
    alongPositions = values.map(function (value, i) { return padding + columnWidth * (i + 0.5); });
    bandStart = 52;
    height = bandStart + maxThickness + lossLength + 14 + 4 * 14 + 12;
  } else {
    const rowHeight = 92;
    alongPositions = values.map(function (value, i) { return padding + rowHeight * (i + 0.5); });
    bandStart = 84;
    height = padding * 2 + rowHeight * 5;
  }

  // Thickness of a band for a given power. Anything that isn't zero gets at least 3 px so it stays visible.
  function thicknessFor(powerW) {
    if (powerW <= 0 || flow.windPowerW <= 0) {
      return 0;
    }
    return Math.max(3, (powerW / flow.windPowerW) * maxThickness);
  }

  // Turns (along, across) into screen (x, y) for the chosen direction.
  function point(along, across) {
    return sideways ? along + " " + across : across + " " + along;
  }
  // A rectangle given by its along range and across range.
  function box(alongFrom, alongTo, acrossFrom, acrossTo, attributes) {
    const x = sideways ? alongFrom : acrossFrom;
    const y = sideways ? acrossFrom : alongFrom;
    const w = sideways ? alongTo - alongFrom : acrossTo - acrossFrom;
    const h = sideways ? acrossTo - acrossFrom : alongTo - alongFrom;
    return svgElement("rect", Object.assign({ x: x, y: y, width: w, height: h }, attributes));
  }

  const svg = svgElement("svg", {
    viewBox: "0 0 " + width + " " + height,
    role: "img",
    "aria-label": data.summary,
  });

  const lossEnd = bandStart + maxThickness + lossLength; // every loss drops to this line

  // 1. The losses (drawn first, so the bands sit on top of where they join).
  for (let i = 1; i <= 4; i++) {
    const alongMiddle = (alongPositions[i - 1] + alongPositions[i]) / 2;
    const lossThickness = thicknessFor(losses[i - 1]);
    const lossLabelLines = [data.formatPower(losses[i - 1])].concat(data.lossNotes[i - 1]);

    if (lossThickness > 0) {
      const joinAcross = Math.max(
        bandStart, bandStart + (thicknessFor(values[i - 1]) + thicknessFor(values[i])) / 2 - 6
      );
      svg.appendChild(box(
        alongMiddle - lossThickness / 2, alongMiddle + lossThickness / 2, joinAcross, lossEnd,
        { rx: 4, class: "flow-loss" }
      ));
    }

    // The words next to the loss: its size, then why.
    lossLabelLines.forEach(function (line, lineIndex) {
      const labelAttributes = {
        class: lineIndex === 0 ? "chart-label" : "chart-text-muted",
      };
      if (sideways) {
        labelAttributes.x = alongMiddle;
        labelAttributes.y = lossEnd + 16 + lineIndex * 14;
        labelAttributes["text-anchor"] = "middle";
      } else {
        labelAttributes.x = lossEnd + 8;
        labelAttributes.y = alongMiddle + 4 + (lineIndex - (lossLabelLines.length - 1) / 2) * 14;
        labelAttributes["text-anchor"] = "start";
      }
      svg.appendChild(svgElement("text", labelAttributes, (lineIndex === 0 ? "Lost: " : "") + line));
    });
  }

  // 2. The bands of energy that keep flowing, getting thinner at each stage.
  for (let i = 1; i <= 4; i++) {
    const startAlong = alongPositions[i - 1];
    const endAlong = alongPositions[i];
    const middleAlong = (startAlong + endAlong) / 2;
    const startThickness = thicknessFor(values[i - 1]);
    const endThickness = thicknessFor(values[i]);
    // One edge stays straight; the other curves in as the band gets thinner.
    const path =
      "M" + point(startAlong, bandStart) +
      " L" + point(endAlong, bandStart) +
      " L" + point(endAlong, bandStart + endThickness) +
      " C" + point(middleAlong, bandStart + endThickness) +
      " " + point(middleAlong, bandStart + startThickness) +
      " " + point(startAlong, bandStart + startThickness) + " Z";
    svg.appendChild(svgElement("path", { d: path, class: "flow-band" }));
  }

  // 3. Stage names and the power after each stage.
  FLOW_STAGE_NAMES.forEach(function (name, i) {
    const nameAttributes = { class: "chart-label" };
    const valueAttributes = { class: "chart-text-muted" };
    if (sideways) {
      nameAttributes.x = valueAttributes.x = alongPositions[i];
      nameAttributes.y = 16;
      valueAttributes.y = 34;
      nameAttributes["text-anchor"] = valueAttributes["text-anchor"] = "middle";
    } else {
      nameAttributes.x = valueAttributes.x = 0;
      nameAttributes.y = alongPositions[i] - 2;
      valueAttributes.y = alongPositions[i] + 14;
      nameAttributes["text-anchor"] = valueAttributes["text-anchor"] = "start";
    }
    svg.appendChild(svgElement("text", nameAttributes, name));
    svg.appendChild(svgElement("text", valueAttributes, data.formatPower(values[i])));
  });

  container.replaceChildren(svg);
}

// One tidy bundle so other files write Charts.drawPowerCurve(...).
const Charts = {
  drawPowerCurve: drawPowerCurve,
  fillPowerTable: fillPowerTable,
  drawEnergyFlow: drawEnergyFlow,
};
