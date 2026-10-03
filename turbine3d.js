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

// Landscape settings
const TERRAIN_SIZE_M = 4000; // the ground is a big square this wide
const TERRAIN_SEGMENTS = 120; // it is made of 120 x 120 small squares
const TREE_COUNT = 450;
const CLOUD_COUNT = 9;
const CLOUD_SPEED_PER_WIND = 2; // clouds drift 2 m/s per m/s of wind (exaggerated so you can see it)

let sceneContainer = null;
let renderer = null;
let scene = null;
let camera = null;
let controls = null; // lets the user drag to rotate the view
let ground = null; // the hilly ground
let groundHeights = []; // height of each ground point, used to colour the hills
let clouds = [];
let yawGroup = null; // turns the whole turbine head to face (or not face) the wind
let rotorGroup = null; // spins
let bladeMeshes = []; // the three blade shapes (stretched to the blade length)
let bladePitchGroups = []; // twist each blade about its own length

let rotorAngleRadians = 0;
let rotorRpm = 0;
let windSpeedMs = 0; // only used to make the clouds drift
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

// ---------- Landscape ----------

// A simple random number generator that always gives the same numbers, so the
// trees and clouds are in the same places every time the page loads.
function makeRandom(startNumber) {
  let seed = startNumber;
  return function () {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647; // a number between 0 and 1
  };
}

// Height of the ground at a point. Flat around the turbine (so the tower stands
// on level ground), then smoothly rising into rolling hills further away.
function terrainHeightAt(x, z) {
  const distance = Math.sqrt(x * x + z * z);
  const t = Math.min(1, Math.max(0, (distance - 110) / 350));
  const hillAmount = t * t * (3 - 2 * t); // 0 near the turbine, 1 far away, eased in
  // Adding a few waves of different sizes gives bumpy, natural-looking hills.
  const waves =
    Math.sin(x * 0.006 + 1.3) * Math.cos(z * 0.005) +
    0.5 * Math.sin(x * 0.013 + z * 0.011) +
    0.25 * Math.cos(z * 0.021 - x * 0.017);
  return hillAmount * (45 + 25 * waves); // between about 1 and 89 metres
}

function buildTerrain() {
  const geometry = new THREE.PlaneGeometry(
    TERRAIN_SIZE_M, TERRAIN_SIZE_M, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS
  );
  geometry.rotateX(-Math.PI / 2); // lay it flat
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const height = terrainHeightAt(positions.getX(i), positions.getZ(i));
    positions.setY(i, height);
    groundHeights.push(height);
  }
  geometry.computeVertexNormals(); // so the lighting follows the hills
  // Each point gets its own colour (set in applyThemeColours).
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3)
  );
  ground = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
  );
  scene.add(ground);
}

// Works out where each tree goes. Trees grow in patches (groves) on the hills,
// never right at the turbine and never in front of the wind arrow.
function chooseTreePositions() {
  const random = makeRandom(20240601);
  const trees = [];
  let attempts = 0;
  while (trees.length < TREE_COUNT && attempts < 20000) {
    attempts++;
    const angle = random() * 2 * Math.PI;
    const distance = 100 + 800 * Math.sqrt(random());
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;

    const grove = (Math.sin(x * 0.01 + 2) * Math.sin(z * 0.012) + 1) / 2; // 0 to 1
    if (random() > grove * grove) {
      continue; // not a woody spot
    }
    if (Math.abs(x + 30) < 45 && z > 40 && z < 230) {
      continue; // keep the area under the wind arrow clear
    }
    trees.push({
      x: x,
      y: terrainHeightAt(x, z),
      z: z,
      size: 0.8 + 0.7 * random(), // some trees bigger than others
      turn: random() * Math.PI,
      isPine: random() < 0.6,
      shade: random(),
    });
  }
  return trees;
}

// Draws many copies of one shape cheaply. An InstancedMesh is three.js's way
// to draw hundreds of identical trees in a single go, which keeps phones fast.
function makeInstances(geometry, count, material) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(count, 1));
  mesh.count = count;
  return mesh;
}

function buildTrees() {
  const trees = chooseTreePositions();
  const pines = trees.filter(function (tree) { return tree.isPine; });
  const roundTrees = trees.filter(function (tree) { return !tree.isPine; });

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });

  // Shapes are drawn once at a standard size, then each tree scales and moves them.
  // Pine: trunk + two cones. Round tree: trunk + a lumpy ball.
  const trunkShape = new THREE.CylinderGeometry(1, 1, 1, 6);
  const pineTrunks = makeInstances(trunkShape, pines.length, trunkMaterial);
  const roundTrunks = makeInstances(trunkShape, roundTrees.length, trunkMaterial);
  const pineLow = makeInstances(new THREE.ConeGeometry(5, 10, 8), pines.length, leafMaterial);
  const pineHigh = makeInstances(new THREE.ConeGeometry(3.5, 9, 8), pines.length, leafMaterial);
  const balls = makeInstances(new THREE.IcosahedronGeometry(5.5, 1), roundTrees.length, leafMaterial);

  const placer = new THREE.Object3D(); // a helper that builds position/size/turn matrices
  const colour = new THREE.Color();

  // Puts one part of a tree (trunk, cones or ball) at its place.
  function place(mesh, index, tree, partHeight, partWidth, partLength) {
    placer.position.set(tree.x, tree.y + partHeight * tree.size, tree.z);
    placer.rotation.set(0, tree.turn, 0);
    placer.scale.set(partWidth * tree.size, partLength * tree.size, partWidth * tree.size);
    placer.updateMatrix();
    mesh.setMatrixAt(index, placer.matrix);
  }

  pines.forEach(function (tree, i) {
    place(pineTrunks, i, tree, 2.5, 0.7, 5); // trunk: 5 m tall, centre 2.5 m up
    place(pineLow, i, tree, 9, 1, 1); // lower cone spans 4 to 14 m
    place(pineHigh, i, tree, 15.5, 1, 1); // upper cone spans 11 to 20 m
    colour.setHSL(0.36, 0.45, 0.17 + 0.1 * tree.shade); // dark green
    pineLow.setColorAt(i, colour);
    pineHigh.setColorAt(i, colour);
  });
  roundTrees.forEach(function (tree, i) {
    place(roundTrunks, i, tree, 3, 0.8, 6); // trunk: 6 m tall
    place(balls, i, tree, 10, 1, 1); // leaves centred 10 m up
    colour.setHSL(0.25 + 0.07 * tree.shade, 0.5, 0.25 + 0.12 * tree.shade); // lighter, yellower green
    balls.setColorAt(i, colour);
  });

  [pineTrunks, roundTrunks, pineLow, pineHigh, balls].forEach(function (mesh) {
    scene.add(mesh);
  });
}

// A few puffy clouds made from white balls. They drift with the wind.
function buildClouds() {
  const random = makeRandom(777);
  const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const puff = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const ball = new THREE.Mesh(puff, cloudMaterial);
      const size = 30 + 25 * random();
      ball.scale.set(size * 1.5, size * 0.6, size);
      ball.position.set((j - 1.5) * 40, 8 * random(), 15 * (random() - 0.5));
      cloud.add(ball);
    }
    cloud.position.set(
      (random() - 0.5) * 2400,
      260 + 80 * random(),
      (random() - 0.5) * 2400
    );
    scene.add(cloud);
    clouds.push(cloud);
  }
}

// Moves the clouds in the wind direction (-z) and loops them round when they leave.
function driftClouds(secondsPassed) {
  clouds.forEach(function (cloud) {
    cloud.position.z -= windSpeedMs * CLOUD_SPEED_PER_WIND * secondsPassed;
    if (cloud.position.z < -1200) {
      cloud.position.z += 2400;
    }
  });
}

// ---------- Colours that follow the light / dark theme ----------

function readCssColour(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function applyThemeColours() {
  const sky = readCssColour("--scene-sky", "#bcd4ea");
  scene.background = new THREE.Color(sky);
  scene.fog.color.set(sky); // distant hills fade into the sky colour

  // Low ground is the theme's green; higher ground fades towards dry grass.
  const lowColour = new THREE.Color(readCssColour("--scene-ground", "#6f9b6a"));
  const highColour = new THREE.Color(0xa9a583);
  const colours = ground.geometry.attributes.color;
  const mixed = new THREE.Color();
  for (let i = 0; i < groundHeights.length; i++) {
    mixed.copy(lowColour).lerp(highColour, (groundHeights[i] / 90) * 0.5);
    colours.setXYZ(i, mixed.r, mixed.g, mixed.b);
  }
  colours.needsUpdate = true;
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

  driftClouds(secondsPassed);
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
  scene.fog = new THREE.Fog(0xffffff, 400, 1200); // colour is set from the theme
  camera = new THREE.PerspectiveCamera(40, 4 / 3, 1, 4000);
  camera.position.set(250, 150, 210);

  // Dragging with a mouse or finger orbits the camera around the turbine.
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 90, 0);
  controls.enablePan = false;
  controls.enableDamping = true; // smooth, gentle stop after a drag
  controls.minDistance = 120;
  controls.maxDistance = 700;
  controls.maxPolarAngle = Math.PI * 0.44; // stays above the hills and the ground
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x667766, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(200, 300, 150);
  scene.add(sun);

  buildTerrain();
  buildTrees();
  buildClouds();
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
//   settings.windSpeedMs        wind speed (only used to drift the clouds)
function updateTurbine3D(settings) {
  if (renderer === null) {
    return; // 3D isn't running; nothing to update
  }
  const bladeLength = settings.bladeLengthMetres;
  yawGroup.rotation.y = (settings.yawDegrees * Math.PI) / 180;
  rotorRpm = settings.rotorRpm;
  windSpeedMs = settings.windSpeedMs;

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
