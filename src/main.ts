import * as THREE from 'three';
import './style.css';
import { Car, CarColors, CARS } from './car';
import { BARN, FARM, GAS, GAS_PUMPS, PARK, createWorld } from './world';
import { Axis, Traffic } from './traffic';
import { Animals } from './animals';
import { HALF, POND, RAMPS, ROAD_LINES, ROAD_W, TOWN, groundHeight, inPond, terrainHeight } from './terrain';
import { Input } from './input';
import { Sound } from './sound';

/** Real RAV4 factory colours first, then some fun ones. */
export const PALETTE: { name: string; hex: string }[] = [
  { name: 'Lunar Rock', hex: '#a8a99a' },
  { name: 'Ruby Flare', hex: '#9b111e' },
  { name: 'Blueprint', hex: '#233a5e' },
  { name: 'Cavalry Blue', hex: '#6f8fb5' },
  { name: 'Magnetic Gray', hex: '#55585d' },
  { name: 'Midnight Black', hex: '#1b1c1e' },
  { name: 'Blizzard White', hex: '#f2f2ee' },
  { name: 'Silver Sky', hex: '#b9bcc0' },
  { name: 'Hot Orange', hex: '#ff7b00' },
  { name: 'Sunshine', hex: '#ffd60a' },
  { name: 'Lime', hex: '#80ed99' },
  { name: 'Ocean', hex: '#2a9d8f' },
  { name: 'Sky', hex: '#4cc9f0' },
  { name: 'Grape', hex: '#7b2cbf' },
  { name: 'Bubblegum', hex: '#ff70a6' },
];
const colorName = (hex: string) => PALETTE.find((p) => p.hex === hex)?.name ?? '';

// ---------- Save data (per-browser convenience; game works without it) ----------
interface Save {
  carId: string;
  colors: Record<string, CarColors>;
  muted: boolean;
  best?: number;
}
const SAVE_KEY = 'kids-car-game:v2';
function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '');
    if (s && s.colors) return s;
  } catch {}
  return { carId: CARS[0].id, colors: {}, muted: false };
}
function writeSave(s: Save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {}
}
const save = loadSave();
const carDef = CARS.find((c) => c.id === save.carId) ?? CARS[0];
const colors: CarColors = { ...carDef.defaultColors, ...save.colors[carDef.id] };

// ---------- Scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fdcff);
scene.fog = new THREE.Fog(0x9fdcff, 90, 300);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 700);
scene.add(new THREE.HemisphereLight(0xffffff, 0x5a8f3c, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const world = createWorld(scene);
const traffic = new Traffic(scene);
const animals = new Animals(scene, world.colliders);
const car = new Car(carDef, colors);
scene.add(car.model.root);

const input = new Input();
const sound = new Sound();
sound.setMuted(save.muted);
input.onHorn = () => {
  sound.unlock();
  sound.horn();
  animals.scare(car.position, 25);
};
animals.onSound = (s) => sound.animal(s);

// ---------- Sparkle particles ----------
interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; }
const particles: Particle[] = [];
const sparkGeo = new THREE.OctahedronGeometry(0.18);
function burst(at: THREE.Vector3, color: THREE.ColorRepresentation, count = 18, power = 10) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.position.copy(at);
    const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).multiplyScalar(power);
    particles.push({ mesh, vel, life: 1 });
    scene.add(mesh);
  }
}
function updateParticles(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt * 1.2;
    p.vel.y -= 18 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += dt * 8;
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(p.life, 0);
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }
}

// ---------- HUD ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const starCount = $('star-count');
const banner = $('banner');
let stars = 0;
let bannerTimer = 0;
let bannerPriority = 0;
function showBanner(text: string, secs = 2.5, priority = 1) {
  if (bannerTimer > 0 && priority < bannerPriority) return;
  banner.textContent = text;
  banner.classList.add('show');
  bannerTimer = secs;
  bannerPriority = priority;
}
function addStars(n: number) {
  stars += n;
  starCount.textContent = String(stars);
  const pill = starCount.parentElement!;
  pill.classList.remove('pop');
  void pill.offsetWidth;
  pill.classList.add('pop');
}

const muteBtn = $('mute');
const refreshMute = () => (muteBtn.textContent = sound.muted ? '🔇' : '🔊');
refreshMute();
muteBtn.addEventListener('click', () => {
  sound.unlock();
  sound.setMuted(!sound.muted);
  save.muted = sound.muted;
  writeSave(save);
  refreshMute();
});
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => sound.unlock(), { once: true });

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);
if (!isTouch) showBanner('Arrow keys to drive · Space to honk', 4);

// ---------- Fuel ----------
let fuel = 1;
let lowWarned = false;
let glugTimer = 0;
const fuelBar = $('fuel-bar');
const fuelPill = $('fuel');
function refreshFuel() {
  fuelBar.style.width = `${Math.round(fuel * 100)}%`;
  fuelPill.classList.toggle('low', fuel < 0.25);
}

// ---------- Minimap ----------
const mapCanvas = $<HTMLCanvasElement>('minimap');
const mapCtx = mapCanvas.getContext('2d')!;
const MS = mapCanvas.width;
const ME = HALF + 4;
// Right on the map = -x and up = +z, matching the starting camera view.
const mx = (x: number) => ((ME - x) / (2 * ME)) * MS;
const mz = (z: number) => ((ME - z) / (2 * ME)) * MS;
const mapBase = document.createElement('canvas');
mapBase.width = mapBase.height = MS;
{
  const g = mapBase.getContext('2d')!;
  const cell = 4;
  for (let py = 0; py < MS; py += cell) {
    for (let px = 0; px < MS; px += cell) {
      const x = ME - ((px + cell / 2) / MS) * 2 * ME;
      const z = ME - ((py + cell / 2) / MS) * 2 * ME;
      const h = terrainHeight(x, z);
      const l = 62 - Math.min(h, 14) * 1.6;
      g.fillStyle = h < -0.3 ? '#3fa7e0' : `hsl(100, 45%, ${l}%)`;
      g.fillRect(px, py, cell, cell);
    }
  }
  const rect = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, color: string) => {
    g.fillStyle = color;
    g.fillRect(mx(r.maxX), mz(r.maxZ), mx(r.minX) - mx(r.maxX), mz(r.minZ) - mz(r.maxZ));
  };
  rect(PARK, 'rgba(255,123,0,0.35)');
  rect(FARM, 'rgba(233,196,106,0.4)');
  g.fillStyle = '#6c727d';
  const rw = (ROAD_W / (2 * ME)) * MS;
  for (const l of ROAD_LINES) {
    g.fillRect(mx(l) - rw / 2, 0, rw, MS);
    g.fillRect(0, mz(l) - rw / 2, MS, rw);
  }
  for (const h of world.houses) rect(h, '#e9d8c4');
  rect(GAS, '#e63946');
  for (const r of RAMPS) {
    g.fillStyle = '#ff7b00';
    const cx = r.x + (r.dx * r.len) / 2, cz = r.z + (r.dz * r.len) / 2;
    g.fillRect(mx(cx) - 3, mz(cz) - 3, 6, 6);
  }
  g.fillStyle = '#b22222';
  g.fillRect(mx(BARN.x) - 5, mz(BARN.z) - 4, 10, 8);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.strokeRect(mx(TOWN), mz(TOWN), mx(-TOWN) - mx(TOWN), mz(-TOWN) - mz(TOWN));
}
function drawMinimap(t: number) {
  mapCtx.drawImage(mapBase, 0, 0);
  mapCtx.font = '22px sans-serif';
  mapCtx.textAlign = 'center';
  mapCtx.textBaseline = 'middle';
  const pulse = fuel < 0.25 ? 1 + Math.sin(t * 8) * 0.25 : 1;
  mapCtx.save();
  mapCtx.translate(mx(-13), mz(41));
  mapCtx.scale(pulse, pulse);
  mapCtx.fillText('⛽', 0, 0);
  mapCtx.restore();
  for (const s of world.stars) {
    if (!s.visible) continue;
    mapCtx.fillStyle = '#ffd60a';
    mapCtx.strokeStyle = '#7a5a00';
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.arc(mx(s.position.x), mz(s.position.z), 5, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.stroke();
  }
  // The car: an arrow pointing where it's heading.
  const ang = Math.atan2(-Math.cos(car.heading), -Math.sin(car.heading));
  mapCtx.save();
  mapCtx.translate(mx(car.position.x), mz(car.position.z));
  mapCtx.rotate(ang);
  mapCtx.fillStyle = colors.body;
  mapCtx.strokeStyle = '#fff';
  mapCtx.lineWidth = 2.5;
  mapCtx.beginPath();
  mapCtx.moveTo(10, 0);
  mapCtx.lineTo(-7, 7);
  mapCtx.lineTo(-3, 0);
  mapCtx.lineTo(-7, -7);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.stroke();
  mapCtx.restore();
}

// ---------- Garage ----------
let inGarage = false;
const garage = $('garage');
const showroom = new THREE.Scene();
showroom.background = new THREE.Color(0xffe8d6);
showroom.add(new THREE.HemisphereLight(0xffffff, 0xffc8a2, 1.6));
const showLight = new THREE.DirectionalLight(0xffffff, 2);
showLight.position.set(5, 10, 6);
showLight.castShadow = true;
showroom.add(showLight);
const turntable = new THREE.Group();
const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.3, 48), new THREE.MeshStandardMaterial({ color: 0xffffff }));
disc.position.y = -0.15;
disc.receiveShadow = true;
turntable.add(disc);
showroom.add(turntable);
const showCam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const parkedAt = new THREE.Vector3();

const PARTS: { key: keyof CarColors; label: string }[] = [
  { key: 'body', label: 'Body' },
  { key: 'roof', label: 'Roof' },
  { key: 'rims', label: 'Wheels' },
];
const rows = $('swatch-rows');
const partNames = new Map<keyof CarColors, HTMLElement>();
for (const part of PARTS) {
  const row = document.createElement('div');
  row.className = 'swatch-row';
  const label = document.createElement('div');
  label.className = 'swatch-label';
  label.innerHTML = `<b>${part.label}</b>`;
  const name = document.createElement('span');
  name.className = 'swatch-name';
  label.appendChild(name);
  partNames.set(part.key, name);
  row.appendChild(label);
  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  for (const c of PALETTE) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c.hex;
    b.dataset.part = part.key;
    b.dataset.color = c.hex;
    b.title = c.name;
    b.setAttribute('aria-label', `${part.label}: ${c.name}`);
    b.addEventListener('click', () => {
      colors[part.key] = c.hex;
      car.setColors(colors);
      sound.click();
      refreshSwatches();
      save.colors[carDef.id] = { ...colors };
      writeSave(save);
    });
    swatches.appendChild(b);
  }
  row.appendChild(swatches);
  rows.appendChild(row);
}
function refreshSwatches() {
  rows.querySelectorAll<HTMLElement>('.swatch').forEach((b) => {
    b.classList.toggle('selected', colors[b.dataset.part as keyof CarColors] === b.dataset.color);
  });
  for (const [k, el] of partNames) el.textContent = colorName(colors[k]);
}
refreshSwatches();
function setGarage(open: boolean) {
  inGarage = open;
  garage.classList.toggle('open', open);
  document.body.classList.toggle('in-garage', open);
  const root = car.model.root;
  if (open) {
    parkedAt.copy(root.position);
    car.speed = 0;
    turntable.rotation.y = 0;
    turntable.add(root);
    root.position.set(0, 0, 0);
    root.rotation.set(0, Math.PI * 0.2, 0);
    sound.engine(0);
  } else {
    scene.add(root);
    root.position.copy(parkedAt);
  }
}
$('garage-btn').addEventListener('click', () => setGarage(true));
$('drive-btn').addEventListener('click', () => setGarage(false));
$('car-name').textContent = carDef.name;

// ---------- Traffic light rules ----------
let waiting: { i: (typeof traffic.intersections)[number]; axis: Axis } | null = null;
let lastCore: (typeof traffic.intersections)[number] | null = traffic.intersections.find((i) => i.x === 0 && i.z === 0) ?? null;
function checkTraffic() {
  const p = car.position;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const axis: Axis = Math.abs(fx) > Math.abs(fz) ? 'ew' : 'ns';
  let approaching: (typeof traffic.intersections)[number] | null = null;
  let core: (typeof traffic.intersections)[number] | null = null;
  for (const i of traffic.intersections) {
    const dx = i.x - p.x, dz = i.z - p.z;
    if (Math.abs(dx) < 5.5 && Math.abs(dz) < 5.5) core = i;
    const ahead = axis === 'ns' ? dz * Math.sign(fz) : dx * Math.sign(fx);
    const side = axis === 'ns' ? Math.abs(dx) : Math.abs(dz);
    if (side < 5.5 && ahead > 6 && ahead < 16) approaching = i;
  }
  if (approaching && Math.abs(car.speed) < 0.4 && traffic.state(approaching, axis) === 'red' && !waiting) {
    waiting = { i: approaching, axis };
  }
  if (waiting) {
    const d = Math.hypot(waiting.i.x - p.x, waiting.i.z - p.z);
    if (d > 18) waiting = null;
    else if (traffic.state(waiting.i, waiting.axis) === 'green') {
      waiting = null;
      addStars(1);
      sound.goodDriving();
      showBanner('🚦 Great driving! You waited for green. +1 ⭐', 2.5, 2);
    }
  }
  if (core && core !== lastCore && Math.abs(car.speed) > 4 && traffic.state(core, axis) === 'red') {
    sound.oops();
    showBanner('🚨 Whoops! That light was red', 2, 2);
  }
  lastCore = core;
}

// ---------- Loop ----------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let wasInWash = false;
let wasInWater = false;
const clock = new THREE.Clock();

function placeCamera(dt: number, snap = false) {
  const p = car.position;
  const f = car.forward;
  const wantPos = new THREE.Vector3(p.x - f.x * 9, p.y + 4.6, p.z - f.z * 9);
  // Never let the camera dip into a hill.
  wantPos.y = Math.max(wantPos.y, groundHeight(wantPos.x, wantPos.z) + 2);
  const wantLook = new THREE.Vector3(p.x + f.x * 3, p.y + 1.2, p.z + f.z * 3);
  const k = snap ? 1 : Math.min(1, dt * 4);
  camPos.lerp(wantPos, k);
  camLook.lerp(wantLook, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}
placeCamera(0, true);
refreshFuel();

let simTime = 0;
let override: { throttle: number; steer: number } | null = null;

function frame() {
  tick(Math.min(clock.getDelta(), 1 / 20));
  render();
  requestAnimationFrame(frame);
}

function render() {
  if (inGarage) {
    // Keep the car in the upper part of the screen, above the paint panel.
    const aspect = window.innerWidth / window.innerHeight;
    const panelFrac = Math.min(garage.offsetHeight / window.innerHeight, 0.62);
    showCam.aspect = aspect;
    showCam.setViewOffset(window.innerWidth, window.innerHeight, 0, (panelFrac * window.innerHeight) / 2, window.innerWidth, window.innerHeight);
    const dist = aspect < 1 ? 7.5 / aspect : 10;
    showCam.position.set(0, dist * 0.3, dist);
    showCam.lookAt(0, 0.8, 0);
    renderer.render(showroom, showCam);
  } else {
    drawMinimap(simTime);
    renderer.render(scene, camera);
  }
}

function tick(dt: number) {
  simTime += dt;
  const t = simTime;
  traffic.update(dt);

  if (inGarage) {
    turntable.rotation.y += dt * 0.5;
    return;
  }

  const water = inPond(car.position.x, car.position.z);
  const speedScale = (fuel <= 0 ? 0.3 : 1) * (water ? 0.45 : 1);
  const ev = car.update(dt, override?.throttle ?? input.throttle, override?.steer ?? input.steer, { colliders: world.colliders, ground: groundHeight, speedScale });
  if (ev.bump > 2) sound.boing();
  if (ev.landed > 0.25) sound.land(ev.landed);
  if (ev.landed > 0.8) {
    burst(car.position.clone().setY(car.position.y + 0.3), 0xffffff, 14, 6);
    if (ev.landed > 1.1) {
      addStars(1);
      sound.goodDriving();
      showBanner(`🚀 BIG AIR! ${ev.landed.toFixed(1)} seconds +1 ⭐`, 2.5, 3);
    } else {
      showBanner(`Nice jump! ${ev.landed.toFixed(1)}s`, 1.5);
    }
  }
  sound.engine(Math.min(Math.abs(car.speed) / 21, 1));
  world.update(t);
  animals.update(dt, t, car.position);
  checkTraffic();

  // Fuel.
  if (fuel > 0) {
    fuel = Math.max(0, fuel - (Math.abs(car.speed) * dt) / 3000);
    if (fuel === 0) {
      sound.sputter();
      showBanner('⛽ Out of gas! Putter to the gas station', 4, 3);
    }
  }
  if (fuel < 0.25 && !lowWarned) {
    lowWarned = true;
    showBanner('⛽ Fuel is low! Find ⛽ on the map', 3.5, 2);
  }
  const p = car.position;
  if (p.x > GAS_PUMPS.minX && p.x < GAS_PUMPS.maxX && p.z > GAS_PUMPS.minZ && p.z < GAS_PUMPS.maxZ && Math.abs(car.speed) < 1 && fuel < 1) {
    fuel = Math.min(1, fuel + dt * 0.35);
    glugTimer -= dt;
    if (glugTimer <= 0) {
      sound.glug();
      glugTimer = 1;
    }
    if (fuel >= 1) {
      lowWarned = false;
      sound.goodDriving();
      showBanner('⛽ Tank full! Off you go', 2, 3);
    } else showBanner('⛽ Filling up…', 0.5, 2);
  }
  refreshFuel();

  // Collect stars.
  for (const s of world.stars) {
    if (!s.visible) continue;
    const dx = s.position.x - p.x, dz = s.position.z - p.z, dy = s.position.y - (p.y + 1);
    if (dx * dx + dz * dz < 2.8 * 2.8 && Math.abs(dy) < 2.6) {
      s.visible = false;
      addStars(1);
      burst(s.position, 0xffd60a);
      sound.star();
      if (world.stars.every((o) => !o.visible)) {
        sound.fanfare();
        showBanner('🎉 You found every star! 🎉', 3.5, 3);
        burst(p.clone().setY(p.y + 2), 0xff70a6, 40);
        setTimeout(() => world.stars.forEach((o) => world.respawnStar(o)), 2500);
      }
    }
  }

  // Car wash: drive through for a surprise colour.
  const inWash = world.washZone.containsPoint(p.clone().setY(1));
  if (inWash && !wasInWash) {
    const choices = PALETTE.filter((c) => c.hex !== colors.body);
    const pick = choices[Math.floor(Math.random() * choices.length)];
    colors.body = pick.hex;
    car.setColors(colors);
    refreshSwatches();
    save.colors[carDef.id] = { ...colors };
    writeSave(save);
    burst(p.clone().setY(2), 0x4cc9f0, 30);
    sound.splash();
    showBanner(`🫧 Fresh paint: ${pick.name}!`, 2, 2);
  }
  wasInWash = inWash;

  // Pond splash.
  if (water && !wasInWater) {
    burst(p.clone().setY(POND.level + 0.3), 0x7fd1ff, 30, 8);
    sound.splash();
    showBanner('💦 Splash! Quack quack!', 1.5);
  } else if (water && Math.abs(car.speed) > 2 && Math.random() < dt * 8) {
    burst(p.clone().setY(POND.level + 0.2), 0x7fd1ff, 3, 5);
  }
  wasInWater = water;

  updateParticles(dt);
  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) banner.classList.remove('show');

  // Keep the shadow area centred on the car.
  sun.position.set(p.x + 30, p.y + 60, p.z + 18);
  sun.target.position.copy(p);

  placeCamera(dt);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Handy for testing from the browser console.
(window as unknown as { game: unknown }).game = {
  car, world, traffic, animals,
  setFuel: (f: number) => (fuel = f),
  /** Run the game at a steady 60 fps for `secs`, holding the given controls. Returns jump info. */
  sim(secs: number, throttle = 0, steer = 0) {
    override = { throttle, steer };
    let maxY = 0, maxAir = 0;
    for (let i = 0; i < secs * 60; i++) {
      tick(1 / 60);
      maxY = Math.max(maxY, car.position.y);
      maxAir = Math.max(maxAir, car.airTime);
    }
    override = null;
    placeCamera(0, true);
    return { maxY: +maxY.toFixed(2), maxAir: +maxAir.toFixed(2), pos: car.position.toArray().map((v) => +v.toFixed(1)), speed: +car.speed.toFixed(1), stars, fuel: +fuel.toFixed(2), banner: banner.textContent };
  },
};
