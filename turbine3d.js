// turbine3d.js
// Draws the 3D turbine with three.js (a library that draws 3D graphics in the
// browser using WebGL, the browser's built-in graphics system).
//
// Rule: this file only DRAWS. It does no physics. app.js hands it the numbers
// (rpm, pitch, blade length, direction) that physics.js worked out.
//
// Scene units: 1 unit = 1 metre, so a blade of length 60 is drawn 60 units long.
// The wind blows along the -z direction (from the viewer's side towards the
// back), so a turbine at 0 degrees has its rotor facing +z, into the wind.

const TOWER_HEIGHT_M = 100;
const HUB_RADIUS_M = 3;
const BLADE_ROOT_START_M = 2.5; // blades start just inside the hub
const BLADE_COUNT = 3;

let sceneContainer = null;
let renderer = null;
let scene = null;
let camera = null;
let controls = null; // lets the user drag to rotate the view
let ground = null;
let yawGroup = null; // turns the whole turbine head to face (or not face) the wind
let rotorGroup = null; // spins
let bladeMeshes = []; // the three blade shapes (stretched to the blade length)
let bladePitchGroups = []; // twist each blade about its own length

let rotorAngleRadians = 0;
let rotorRpm = 0;
let lastFrameMs = null;

// ---------- Building the turbine ----------

// One blade: a flat, tapered shape that is 1 unit long. We stretch it to the
// real blade length later by scaling it, so the shape stays the same.
function makeBladeGeometry() {
  const outline = new THREE.Shape();
  outline.moveTo(-2.2, 0); // wide at the root (where it joins the hub)
  outline.lineTo(2.2, 0);
  outline.lineTo(0.9, 1); // narrow at the tip
  outline.lineTo(-0.4, 1);
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: 1.2, bevelEnabled: false });
  geometry.translate(0, 0, -0.6); // centre the thickness
  return geometry;
}

function buildTurbine() {
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.7 });
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xf6f7f9, roughness: 0.5 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.6 });

  // Tower: a tall cylinder, a bit wider at the bottom.
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3.6, TOWER_HEIGHT_M, 24),
    towerMaterial
  );
  tower.position.y = TOWER_HEIGHT_M / 2;
  scene.add(tower);

  // Everything on top of the tower turns together when the direction changes.
  yawGroup = new THREE.Group();
  yawGroup.position.y = TOWER_HEIGHT_M;
  scene.add(yawGroup);

  // Nacelle: the box at the top that holds the gearbox and generator.
  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 16), darkMaterial);
  yawGroup.add(nacelle);

  // Rotor: the hub plus three blades. It sits at the front of the nacelle.
  rotorGroup = new THREE.Group();
  rotorGroup.position.z = 9;
  yawGroup.add(rotorGroup);

  const hub = new THREE.Mesh(new THREE.SphereGeometry(HUB_RADIUS_M, 24, 16), bladeMaterial);
  hub.scale.z = 1.4;
  rotorGroup.add(hub);

  const bladeGeometry = makeBladeGeometry();
  for (let i = 0; i < BLADE_COUNT; i++) {
    // The pivot swings the blade round to its place (0, 120, 240 degrees).
    const pivot = new THREE.Group();
    pivot.rotation.z = (i * 2 * Math.PI) / BLADE_COUNT;
    // The pitch group twists the blade about its own length (the y direction).
    const pitchGroup = new THREE.Group();
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade.position.y = BLADE_ROOT_START_M;

    pitchGroup.add(blade);
    pivot.add(pitchGroup);
    rotorGroup.add(pivot);
    bladeMeshes.push(blade);
    bladePitchGroups.push(pitchGroup);
  }

  // An orange arrow shows which way the wind blows (towards the turbine).
  const windArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(-30, 30, 170),
    90,
    0xf28c28,
    25,
    14
  );
  scene.add(windArrow);
}

// ---------- Colours that follow the light / dark theme ----------

function readCssColour(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function applyThemeColours() {
  scene.background = new THREE.Color(readCssColour("--scene-sky", "#bcd4ea"));
  ground.material.color.set(readCssColour("--scene-ground", "#6f9b6a"));
}

// ---------- Size ----------

function resizeToContainer() {
  const width = sceneContainer.clientWidth;
  const height = sceneContainer.clientHeight;
  if (width === 0 || height === 0) {
    return;
  }
  renderer.setSize(width, height, false); // false: the CSS controls the canvas size
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

// ---------- Animation ----------

function animate(nowMs) {
  requestAnimationFrame(animate);

  // Time since the last frame, so the turbine spins at the same speed on fast
  // and slow devices. Capped so it doesn't jump after the tab was in the background.
  const secondsPassed = lastFrameMs === null ? 0 : Math.min((nowMs - lastFrameMs) / 1000, 0.1);
  lastFrameMs = nowMs;

  // rpm = rotations per minute. One rotation is 2 x pi radians.
  // Subtracting makes it turn clockwise as seen from the front, like a real turbine.
  rotorAngleRadians -= (rotorRpm / 60) * 2 * Math.PI * secondsPassed;
  rotorGroup.rotation.z = rotorAngleRadians;

  controls.update();
  renderer.render(scene, camera);
}

// ---------- Public functions ----------

function showMessage(text) {
  sceneContainer.textContent = text;
  sceneContainer.classList.add("scene-message");
}

// Sets up the scene. Returns false (and shows a message) if 3D isn't possible,
// for example if the three.js files could not be downloaded.
function initTurbine3D(containerElement) {
  sceneContainer = containerElement;

  if (typeof THREE === "undefined" || typeof THREE.OrbitControls === "undefined") {
    showMessage("The 3D view could not load. Check your internet connection and reload the page.");
    return false;
  }

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (error) {
    showMessage("Your browser can't show the 3D view, but everything else still works.");
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // keeps phones fast
  sceneContainer.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 4 / 3, 1, 3000);
  camera.position.set(250, 110, 210);

  // Dragging with a mouse or finger orbits the camera around the turbine.
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 90, 0);
  controls.enablePan = false;
  controls.enableDamping = true; // smooth, gentle stop after a drag
  controls.minDistance = 120;
  controls.maxDistance = 700;
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // can't go under the ground
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x667766, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(200, 300, 150);
  scene.add(sun);

  ground = new THREE.Mesh(
    new THREE.CircleGeometry(900, 48),
    new THREE.MeshStandardMaterial({ roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  buildTurbine();
  applyThemeColours();
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", applyThemeColours);

  new ResizeObserver(resizeToContainer).observe(sceneContainer);
  resizeToContainer();

  requestAnimationFrame(animate);
  return true;
}

// Called by app.js whenever a slider moves.
//   settings.bladeLengthMetres  how long the blades are
//   settings.yawDegrees         how far the turbine is turned from the wind
//   settings.rotorRpm           spin speed (from physics.js)
//   settings.pitchDegrees       blade twist (from physics.js)
function updateTurbine3D(settings) {
  if (renderer === null) {
    return; // 3D isn't running; nothing to update
  }
  const bladeLength = settings.bladeLengthMetres;
  yawGroup.rotation.y = (settings.yawDegrees * Math.PI) / 180;
  rotorRpm = settings.rotorRpm;

  const pitchRadians = (settings.pitchDegrees * Math.PI) / 180;
  for (let i = 0; i < BLADE_COUNT; i++) {
    // The blade shape is 1 unit long; stretch it so its tip is at the blade length.
    bladeMeshes[i].scale.set(1, bladeLength - BLADE_ROOT_START_M, 1);
    bladePitchGroups[i].rotation.y = pitchRadians;
  }
}

const Turbine3D = {
  init: initTurbine3D,
  update: updateTurbine3D,
};
