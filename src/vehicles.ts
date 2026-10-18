import * as THREE from 'three';
import { CarColors, CarDef, CarModel, Handling, V2, arc, box, extrudeProfile } from './car';
import { flattenByMaterial } from './merge';
import { textTexture } from './world';

/**
 * Library of generic vehicles. Every model is built from the same parametric body
 * (side profile + cabin + wheels + lights) and can be built two ways:
 * - for town traffic: merged into a few static meshes, cheap to draw;
 * - for the player: wheels that spin and steer, and paint/light materials of its own.
 * Models face +z with their origin on the ground at the centre.
 */
export interface VehicleModel {
  id: string;
  name: string;
  emoji: string;
  length: number;
  width: number;
  /** Height of the headlights, for the flash glow. */
  headlightY: number;
  /** Paint colours this model is usually seen in. */
  colors: string[];
  handling: Handling;
  /** Traffic version. `userData.headlights` is this car's own headlight material. */
  build: (color: string) => THREE.Group;
  /** Drivable version for the player. */
  buildPlayable: () => CarModel;
}

interface BodySpec {
  length: number;
  width: number;
  wheelbase: number;
  wheelR: number;
  hood: number; // bonnet height at the nose
  belt: number; // bottom of the side windows
  roof: number;
  cabFront: number; // x of windshield base (nose is +x)
  cabTopFront: number;
  cabTopRear: number;
  cabRear: number;
  tail: 'trunk' | 'hatch' | 'flat';
  trunkH?: number;
}

// ---------- Shared materials ----------
const paintCache = new Map<string, THREE.MeshStandardMaterial>();
const newPaint = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.3 });
const paint = (c: string) => {
  let m = paintCache.get(c);
  if (!m) paintCache.set(c, (m = newPaint(c)));
  return m;
};
const MAT = {
  glass: new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.08, metalness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.85 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.3, metalness: 0.7 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xc8101a, emissive: 0x8a0008, emissiveIntensity: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 }),
  black: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.4 }),
  red: new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff0010, emissiveIntensity: 1.2 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x2050ff, emissive: 0x0030ff, emissiveIntensity: 1.2 }),
  crate: new THREE.MeshStandardMaterial({ color: 0xb07a3c }),
};
const headMat = () => new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff3c0, emissiveIntensity: 0.7 });
const signMat = (text: string, bg: string, fg: string) => new THREE.MeshStandardMaterial({ map: textTexture(text, bg, fg) });

/** Materials one vehicle is built with. The player's car gets its own copies so it can be repainted. */
interface Kit {
  body: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  rims: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
  brake: THREE.MeshStandardMaterial;
  reverse?: THREE.MeshStandardMaterial;
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Builds the shared body. Returns the root, a lean-able body group, and the shell (x = forward) for extras. */
function body(s: BodySpec, kit: Kit, playable: boolean) {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  const shell = new THREE.Group();
  shell.rotation.y = -Math.PI / 2; // build along +x, face +z
  root.add(lean);
  lean.add(shell);
  const F = s.length / 2, Rr = -s.length / 2, b = 0.3, R = s.wheelR, well = R + 0.09;
  const ax = s.wheelbase / 2;

  const top: V2[] =
    s.tail === 'trunk'
      ? [[s.cabRear, s.belt], [Rr + 0.25, s.trunkH ?? s.belt], [Rr, (s.trunkH ?? s.belt) - 0.12]]
      : [[Rr + 0.04, s.belt]];
  const lower: V2[] = [
    [F - 0.12, b], [F, b + 0.18], [F, s.hood - 0.1], [F - 0.2, s.hood], [s.cabFront, s.belt],
    ...top,
    [Rr, b + 0.2], [Rr + 0.12, b],
    ...arc(-ax, R, well, Math.PI, 0, 8),
    ...arc(ax, R, well, Math.PI, 0, 8),
  ];
  shell.add(extrudeProfile(lower, s.width, kit.body, 0.07, (x, y) => (1 - 0.06 * smooth(F - 0.5, F, Math.abs(x))) * (1 - 0.05 * smooth(s.belt - 0.3, s.belt, y))));
  const cab: V2[] = [[s.cabFront, s.belt - 0.03], [s.cabTopFront, s.roof], [s.cabTopRear, s.roof], [s.cabRear, s.belt - 0.03]];
  shell.add(extrudeProfile(cab, s.width - 0.1, MAT.glass, 0.04, (_x, y) => 1 - 0.14 * smooth(s.belt, s.roof, y)));
  // Roof (its own paint slot) and body-coloured pillars.
  const roofW = (s.width - 0.1) * 0.86;
  shell.add(box(s.cabTopFront - s.cabTopRear + 0.05, 0.06, roofW, kit.roof, (s.cabTopFront + s.cabTopRear) / 2, s.roof + 0.02, 0));
  const midX = (s.cabFront + s.cabRear) / 2 - 0.15;
  for (const z of [-1, 1]) shell.add(box(0.12, s.roof - s.belt, 0.04, kit.body, midX, (s.roof + s.belt) / 2, z * (s.width / 2 - 0.1)));

  // Bumpers and lights.
  shell.add(box(0.1, 0.16, s.width - 0.1, MAT.dark, F - 0.02, b + 0.12, 0));
  shell.add(box(0.1, 0.16, s.width - 0.1, MAT.dark, Rr + 0.02, b + 0.12, 0));
  const tailY = Math.min(s.belt, s.trunkH ?? s.belt) - 0.15;
  for (const z of [-1, 1]) {
    shell.add(box(0.05, 0.12, 0.34, kit.head, F + 0.01, s.hood - 0.2, z * (s.width / 2 - 0.3)));
    shell.add(box(0.05, 0.14, 0.3, kit.brake, Rr - 0.01, tailY, z * (s.width / 2 - 0.28)));
    if (kit.reverse) shell.add(box(0.05, 0.08, 0.14, kit.reverse, Rr - 0.015, b + 0.3, z * (s.width / 2 - 0.55)));
  }

  // Wheels: static on traffic; separate spinning/steering wheels on the player's car.
  const tireGeo = new THREE.CylinderGeometry(R, R, 0.24, 18);
  const rimGeo = new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.26, 10);
  const steerPivots: THREE.Object3D[] = [];
  const spinners: THREE.Object3D[] = [];
  for (const x of [ax, -ax]) {
    for (const side of [-1, 1]) {
      if (!playable) {
        const t = new THREE.Mesh(tireGeo.clone().rotateX(Math.PI / 2), MAT.tire);
        t.position.set(x, R, side * (s.width / 2 - 0.13));
        const r = new THREE.Mesh(rimGeo.clone().rotateX(Math.PI / 2), kit.rims);
        r.position.copy(t.position);
        shell.add(t, r);
        continue;
      }
      // Root space: shell +x is root +z, shell +z is root -x.
      const pivot = new THREE.Group();
      pivot.position.set(-side * (s.width / 2 - 0.13), R, x);
      pivot.userData.keep = true;
      const spin = new THREE.Group();
      spin.add(new THREE.Mesh(tireGeo.clone().rotateZ(Math.PI / 2), MAT.tire));
      spin.add(new THREE.Mesh(rimGeo.clone().rotateZ(Math.PI / 2), kit.rims));
      spin.add(box(0.27, R * 1.1, 0.08, kit.rims, 0, 0, 0)); // a spoke, so you can see them turn
      pivot.add(spin);
      root.add(pivot);
      spinners.push(spin);
      if (x > 0) steerPivots.push(pivot);
    }
  }
  return { root, lean, shell, F, Rr, R, steerPivots, spinners };
}

interface ModelDef {
  id: string;
  name: string;
  emoji: string;
  colors: string[];
  handling: Handling;
  spec: BodySpec;
  /** Extra parts (signs, wings, cargo) added in shell space. */
  extras?: (shell: THREE.Group, kit: Kit, F: number, Rr: number) => void;
}

function makeModel(d: ModelDef): VehicleModel {
  return {
    id: d.id, name: d.name, emoji: d.emoji, colors: d.colors, handling: d.handling,
    length: d.spec.length, width: d.spec.width, headlightY: d.spec.hood - 0.2,
    build(color) {
      const kit: Kit = { body: paint(color), roof: paint(color), rims: MAT.rim, head: headMat(), brake: MAT.tail };
      const v = body(d.spec, kit, false);
      d.extras?.(v.shell, kit, v.F, v.Rr);
      flattenByMaterial(v.root);
      v.root.userData.headlights = kit.head;
      return v.root;
    },
    buildPlayable() {
      const kit: Kit = {
        body: newPaint(d.colors[0]), roof: newPaint(d.colors[0]),
        rims: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.7 }),
        head: headMat(), brake: MAT.tail.clone(),
        reverse: new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0 }),
      };
      const v = body(d.spec, kit, true);
      d.extras?.(v.shell, kit, v.F, v.Rr);
      flattenByMaterial(v.shell);
      for (const s of v.spinners) flattenByMaterial(s);
      return {
        root: v.root, body: v.lean, paint: { body: kit.body, roof: kit.roof, rims: kit.rims },
        lights: { brake: kit.brake, reverse: kit.reverse! }, steerPivots: v.steerPivots, spinners: v.spinners, wheelRadius: v.R,
      };
    },
  };
}

const SEDAN: BodySpec = {
  length: 4.6, width: 1.8, wheelbase: 2.7, wheelR: 0.33, hood: 0.86, belt: 0.96, roof: 1.44,
  cabFront: 0.85, cabTopFront: 0.1, cabTopRear: -1.0, cabRear: -1.55, tail: 'trunk', trunkH: 0.98,
};

const MODELS: ModelDef[] = [
  {
    id: 'sedan', name: 'Family Sedan', emoji: '🚗',
    colors: ['#c0c4c8', '#1f3b70', '#7a1020', '#f2f2ee', '#2b2d31', '#5c7c4a'],
    handling: { maxSpeed: 22, accel: 10, turn: 1.9 },
    spec: SEDAN,
  },
  {
    id: 'hatch', name: 'City Hatchback', emoji: '🚘',
    colors: ['#e63946', '#4cc9f0', '#ffd60a', '#80ed99', '#f2f2ee', '#ff7b00'],
    handling: { maxSpeed: 20, accel: 11, turn: 2.2 },
    spec: {
      length: 3.9, width: 1.72, wheelbase: 2.45, wheelR: 0.31, hood: 0.84, belt: 0.97, roof: 1.5,
      cabFront: 0.72, cabTopFront: 0.05, cabTopRear: -1.55, cabRear: -1.9, tail: 'hatch',
    },
  },
  {
    id: 'sports', name: 'Sports Coupe', emoji: '🏎️',
    colors: ['#e63946', '#ffd60a', '#ff7b00', '#2b2d31', '#3a86ff'],
    handling: { maxSpeed: 28, accel: 15, turn: 2.0 },
    spec: {
      length: 4.4, width: 1.9, wheelbase: 2.6, wheelR: 0.34, hood: 0.7, belt: 0.82, roof: 1.18,
      cabFront: 0.45, cabTopFront: -0.25, cabTopRear: -0.95, cabRear: -1.8, tail: 'trunk', trunkH: 0.86,
    },
    extras: (shell, _k, _F, Rr) => {
      shell.add(box(0.3, 0.05, 1.6, MAT.black, Rr + 0.25, 1.05, 0)); // rear wing
      for (const z of [-0.6, 0.6]) shell.add(box(0.06, 0.18, 0.06, MAT.black, Rr + 0.3, 0.95, z));
    },
  },
  {
    id: 'van', name: 'Minivan', emoji: '🚐',
    colors: ['#f2f2ee', '#c0c4c8', '#1f3b70', '#6f8fb5', '#7a1020'],
    handling: { maxSpeed: 19, accel: 8, turn: 1.6 },
    spec: {
      length: 5.0, width: 1.95, wheelbase: 3.0, wheelR: 0.34, hood: 1.0, belt: 1.1, roof: 1.95,
      cabFront: 1.55, cabTopFront: 0.95, cabTopRear: -2.35, cabRear: -2.45, tail: 'hatch',
    },
  },
  {
    id: 'pickup', name: 'Pickup Truck', emoji: '🛻',
    colors: ['#7a1020', '#2b2d31', '#f2f2ee', '#1f3b70', '#5c7c4a', '#ff7b00'],
    handling: { maxSpeed: 21, accel: 10, turn: 1.6 },
    spec: {
      length: 5.3, width: 1.95, wheelbase: 3.2, wheelR: 0.4, hood: 1.15, belt: 1.22, roof: 1.88,
      cabFront: 1.05, cabTopFront: 0.5, cabTopRear: -0.45, cabRear: -0.55, tail: 'flat',
    },
    extras: (shell, _k, _F, Rr) => {
      // Open bed: dark floor with a crate in it.
      shell.add(box(-0.7 - (Rr + 0.15), 0.03, 1.65, MAT.dark, (-0.7 + Rr + 0.15) / 2, 1.235, 0));
      shell.add(box(0.7, 0.5, 0.7, MAT.crate, -1.6, 1.5, 0.3));
    },
  },
  {
    id: 'taxi', name: 'Taxi', emoji: '🚕',
    colors: ['#ffc300'],
    handling: { maxSpeed: 22, accel: 10, turn: 1.9 },
    spec: SEDAN,
    extras: (shell) => {
      const taxi = signMat('TAXI', '#ffffff', '#111111');
      // Across the roof, readable from in front and behind.
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.75), [taxi, taxi, MAT.white, MAT.white, MAT.white, MAT.white]);
      sign.position.set(-0.45, 1.6, 0);
      shell.add(sign);
      for (const z of [-0.91, 0.91]) shell.add(box(2.6, 0.08, 0.02, MAT.black, -0.2, 0.78, z)); // checker stripe
    },
  },
  {
    id: 'police', name: 'Police Car', emoji: '🚓',
    colors: ['#141416'],
    handling: { maxSpeed: 25, accel: 12, turn: 1.9 },
    spec: SEDAN,
    extras: (shell) => {
      for (const z of [-0.905, 0.905]) shell.add(box(1.9, 0.5, 0.02, MAT.white, -0.1, 0.7, z)); // white doors
      shell.add(box(0.25, 0.12, 0.55, MAT.red, -0.45, 1.53, 0.3));
      shell.add(box(0.25, 0.12, 0.55, MAT.blue, -0.45, 1.53, -0.3));
    },
  },
  {
    id: 'bus', name: 'School Bus', emoji: '🚌',
    colors: ['#ffb703'],
    handling: { maxSpeed: 15, accel: 5, turn: 1.1 },
    spec: {
      length: 9.0, width: 2.4, wheelbase: 5.2, wheelR: 0.46, hood: 1.35, belt: 1.5, roof: 2.85,
      cabFront: 3.6, cabTopFront: 3.45, cabTopRear: -4.35, cabRear: -4.42, tail: 'hatch',
    },
    extras: (shell, kit, F, Rr) => {
      for (let x = -4.0; x < 3.3; x += 0.9) for (const z of [-1, 1]) shell.add(box(0.12, 1.3, 0.05, kit.body, x, 2.15, z * 1.13)); // window posts
      for (const z of [-1.205, 1.205]) {
        shell.add(box(8.6, 0.06, 0.02, MAT.black, 0, 1.2, z));
        shell.add(box(8.6, 0.06, 0.02, MAT.black, 0, 0.9, z));
      }
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 1.6), [signMat('SCHOOL BUS', '#ffb703', '#111111'), MAT.black, MAT.black, MAT.black, MAT.black, MAT.black]);
      sign.position.set(F - 1.2, 2.7, 0);
      const back = sign.clone();
      back.rotation.y = Math.PI;
      back.position.x = Rr - 0.03;
      shell.add(sign, back);
    },
  },
  {
    id: 'truck', name: 'Delivery Truck', emoji: '🚚',
    colors: ['#f2f2ee', '#3a86ff', '#e63946', '#2a9d8f'],
    handling: { maxSpeed: 17, accel: 6, turn: 1.3 },
    spec: {
      length: 6.6, width: 2.2, wheelbase: 4.0, wheelR: 0.45, hood: 1.25, belt: 1.35, roof: 2.3,
      cabFront: 2.6, cabTopFront: 2.25, cabTopRear: 1.3, cabRear: 1.25, tail: 'flat',
    },
    extras: (shell, _k, _F, Rr) => {
      const cargo = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.0, 2.2), [MAT.white, MAT.white, MAT.white, MAT.white, signMat('DELIVERY', '#ffffff', '#e63946'), signMat('DELIVERY', '#ffffff', '#e63946')]);
      cargo.position.set(Rr + 2.15, 2.4, 0);
      shell.add(cargo);
    },
  },
];

export const VEHICLES: VehicleModel[] = MODELS.map(makeModel);

/** Every vehicle as a drivable car for the garage picker. */
export function playableDefs(): CarDef[] {
  return VEHICLES.map((v) => ({
    id: v.id, name: v.name, emoji: v.emoji, length: v.length, width: v.width, handling: v.handling,
    defaultColors: { body: v.colors[0], roof: v.colors[0], rims: '#c4c8cc' } as CarColors,
    build: v.buildPlayable,
  }));
}
