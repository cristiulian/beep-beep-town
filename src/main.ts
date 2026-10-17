import * as THREE from 'three';
import './style.css';
import { Car, CarColors, CARS } from './car';
import { createWorld } from './world';
import { Input } from './input';
import { Sound } from './sound';

export const PALETTE = [
  '#e63946', '#ff7b00', '#ffd60a', '#80ed99', '#2a9d8f', '#4cc9f0',
  '#3a86ff', '#7b2cbf', '#ff70a6', '#ffffff', '#adb5bd', '#22223b',
];

// ---------- Save data (per-browser convenience; game works without it) ----------
interface Save {
  carId: string;
  colors: Record<string, CarColors>;
  muted: boolean;
}
const SAVE_KEY = 'kids-car-game:v1';
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
scene.fog = new THREE.Fog(0x9fdcff, 60, 150);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xffffff, 0x5a8f3c, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const world = createWorld(scene);
const car = new Car(carDef, colors);
scene.add(car.model.root);

const input = new Input();
const sound = new Sound();
sound.setMuted(save.muted);
input.onHorn = () => {
  sound.unlock();
  sound.horn();
};

// ---------- Sparkle particles ----------
interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; }
const particles: Particle[] = [];
const sparkGeo = new THREE.OctahedronGeometry(0.18);
function burst(at: THREE.Vector3, color: THREE.ColorRepresentation, count = 18) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.position.copy(at);
    const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).multiplyScalar(10);
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
function showBanner(text: string, secs = 2.5) {
  banner.textContent = text;
  banner.classList.add('show');
  bannerTimer = secs;
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

// Any first touch/click/key unlocks audio.
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => sound.unlock(), { once: true });

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);
if (!isTouch) showBanner('Arrow keys to drive · Space to honk!', 4);

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
const showCam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const parkedAt = new THREE.Vector3();
const PARTS: { key: keyof CarColors; label: string }[] = [
  { key: 'body', label: '🚙 Car' },
  { key: 'roof', label: '⬜ Roof' },
  { key: 'rims', label: '⚙️ Wheels' },
];
const rows = $('swatch-rows');
for (const part of PARTS) {
  const row = document.createElement('div');
  row.className = 'swatch-row';
  const label = document.createElement('span');
  label.className = 'swatch-label';
  label.textContent = part.label;
  row.appendChild(label);
  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  for (const c of PALETTE) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = c;
    b.dataset.part = part.key;
    b.dataset.color = c;
    b.setAttribute('aria-label', `${part.key} ${c}`);
    b.addEventListener('click', () => {
      colors[part.key] = c;
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
    root.rotation.y = Math.PI * 0.2;
    sound.engine(0);
  } else {
    scene.add(root);
    root.position.copy(parkedAt);
  }
}
$('garage-btn').addEventListener('click', () => setGarage(true));
$('drive-btn').addEventListener('click', () => setGarage(false));
$('car-name').textContent = carDef.name;

// ---------- Loop ----------
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let wasInWash = false;
const clock = new THREE.Clock();

function placeCamera(dt: number, snap = false) {
  const p = car.position;
  const f = car.forward;
  const wantPos = new THREE.Vector3(p.x - f.x * 9, 4.8, p.z - f.z * 9);
  const wantLook = new THREE.Vector3(p.x + f.x * 3, 1.2, p.z + f.z * 3);
  const k = snap ? 1 : Math.min(1, dt * 4);
  camPos.lerp(wantPos, k);
  camLook.lerp(wantLook, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}
placeCamera(0, true);

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const t = clock.elapsedTime;

  if (inGarage) {
    turntable.rotation.y += dt * 0.5;
    // Keep the car in the upper part of the screen, above the paint panel.
    const aspect = window.innerWidth / window.innerHeight;
    const panelFrac = Math.min(garage.offsetHeight / window.innerHeight, 0.6);
    showCam.aspect = aspect;
    showCam.setViewOffset(window.innerWidth, window.innerHeight, 0, (panelFrac * window.innerHeight) / 2, window.innerWidth, window.innerHeight);
    const dist = aspect < 1 ? 7 / aspect : 9;
    showCam.position.set(0, dist * 0.32, dist);
    showCam.lookAt(0, 0.7, 0);
    renderer.render(showroom, showCam);
    requestAnimationFrame(frame);
    return;
  }

  const bump = car.update(dt, input.throttle, input.steer, world.colliders);
  if (bump > 2) sound.boing();
  sound.engine(Math.min(Math.abs(car.speed) / 15, 1));
  world.update(t);

  // Collect stars.
  for (const s of world.stars) {
    if (!s.visible) continue;
    const dx = s.position.x - car.position.x, dz = s.position.z - car.position.z;
    if (dx * dx + dz * dz < 2.6 * 2.6) {
      s.visible = false;
      stars++;
      starCount.textContent = String(stars);
      starCount.parentElement!.classList.remove('pop');
      void starCount.parentElement!.offsetWidth;
      starCount.parentElement!.classList.add('pop');
      burst(s.position, 0xffd60a);
      sound.star();
      if (world.stars.every((o) => !o.visible)) {
        sound.fanfare();
        showBanner('🎉 You found all the stars! 🎉', 3.5);
        burst(car.position.clone().setY(2), 0xff70a6, 40);
        setTimeout(() => world.stars.forEach((o) => world.respawnStar(o)), 2500);
      }
    }
  }

  // Car wash: drive through for a surprise new colour.
  const inWash = world.washZone.containsPoint(car.position.clone().setY(1));
  if (inWash && !wasInWash) {
    const choices = PALETTE.filter((c) => c !== colors.body);
    colors.body = choices[Math.floor(Math.random() * choices.length)];
    car.setColors(colors);
    refreshSwatches();
    save.colors[carDef.id] = { ...colors };
    writeSave(save);
    burst(car.position.clone().setY(2), 0x4cc9f0, 30);
    sound.splash();
    showBanner('🫧 Sparkly new colour! 🫧', 2);
  }
  wasInWash = inWash;

  updateParticles(dt);
  if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) banner.classList.remove('show');

  // Keep the shadow area centred on the car.
  sun.position.set(car.position.x + 25, 50, car.position.z + 15);
  sun.target.position.copy(car.position);

  placeCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
