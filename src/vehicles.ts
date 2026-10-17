import * as THREE from 'three';
import { V2, arc, box, extrudeProfile } from './car';
import { flattenByMaterial } from './merge';
import { textTexture } from './world';

/**
 * Library of generic town vehicles. Every model is built from the same parametric body
 * (side profile + cabin + wheels + lights) and merged into a few meshes, so traffic stays cheap.
 * Models face +z with their origin on the ground at the centre.
 */
export interface VehicleModel {
  id: string;
  name: string;
  length: number;
  width: number;
  /** Paint colours this model is usually seen in. */
  colors: string[];
  build: (color: string) => THREE.Group;
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
const paint = (c: string) => {
  let m = paintCache.get(c);
  if (!m) paintCache.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.3 })));
  return m;
};
const MAT = {
  glass: new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.08, metalness: 0.6 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.85 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.3, metalness: 0.7 }),
  head: new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff3c0, emissiveIntensity: 0.7 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xc8101a, emissive: 0x8a0008, emissiveIntensity: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 }),
  black: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.4 }),
  red: new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff0010, emissiveIntensity: 1.2 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x2050ff, emissive: 0x0030ff, emissiveIntensity: 1.2 }),
};
const signMat = (text: string, bg: string, fg: string) => new THREE.MeshStandardMaterial({ map: textTexture(text, bg, fg) });

/** The shared body: returns the model group plus the shell (x = forward) for adding extras. */
function body(s: BodySpec, color: string) {
  const root = new THREE.Group();
  const shell = new THREE.Group();
  shell.rotation.y = -Math.PI / 2; // build along +x, face +z
  root.add(shell);
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
  const p = paint(color);
  shell.add(extrudeProfile(lower, s.width, p, 0.07, (x, y) => (1 - 0.06 * smooth(F - 0.5, F, Math.abs(x))) * (1 - 0.05 * smooth(s.belt - 0.3, s.belt, y))));
  const cab: V2[] = [[s.cabFront, s.belt - 0.03], [s.cabTopFront, s.roof], [s.cabTopRear, s.roof], [s.cabRear, s.belt - 0.03]];
  shell.add(extrudeProfile(cab, s.width - 0.1, MAT.glass, 0.04, (_x, y) => 1 - 0.14 * smooth(s.belt, s.roof, y)));
  // Body-coloured roof and pillars.
  const roofW = (s.width - 0.1) * 0.86;
  shell.add(box(s.cabTopFront - s.cabTopRear + 0.05, 0.06, roofW, p, (s.cabTopFront + s.cabTopRear) / 2, s.roof + 0.02, 0));
  const midX = (s.cabFront + s.cabRear) / 2 - 0.15;
  for (const z of [-1, 1]) shell.add(box(0.12, s.roof - s.belt, 0.04, p, midX, (s.roof + s.belt) / 2, z * (s.width / 2 - 0.1)));

  // Bumpers and lights.
  shell.add(box(0.1, 0.16, s.width - 0.1, MAT.dark, F - 0.02, b + 0.12, 0));
  shell.add(box(0.1, 0.16, s.width - 0.1, MAT.dark, Rr + 0.02, b + 0.12, 0));
  for (const z of [-1, 1]) {
    shell.add(box(0.05, 0.12, 0.34, MAT.head, F + 0.01, s.hood - 0.2, z * (s.width / 2 - 0.3)));
    shell.add(box(0.05, 0.14, 0.3, MAT.tail, Rr - 0.01, Math.min(s.belt, s.trunkH ?? s.belt) - 0.15, z * (s.width / 2 - 0.28)));
  }

  // Wheels (static: at traffic speeds nobody notices them not turning).
  const tire = new THREE.CylinderGeometry(R, R, 0.24, 18).rotateX(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.26, 10).rotateX(Math.PI / 2);
  for (const x of [-ax, ax]) {
    for (const z of [-1, 1]) {
      const t = new THREE.Mesh(tire, MAT.tire);
      t.position.set(x, R, z * (s.width / 2 - 0.13));
      const r = new THREE.Mesh(rim, MAT.rim);
      r.position.copy(t.position);
      shell.add(t, r);
    }
  }
  return { root, shell, F, Rr };
}

function finish(root: THREE.Group) {
  flattenByMaterial(root);
  return root;
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const SEDAN: BodySpec = {
  length: 4.6, width: 1.8, wheelbase: 2.7, wheelR: 0.33, hood: 0.86, belt: 0.96, roof: 1.44,
  cabFront: 0.85, cabTopFront: 0.1, cabTopRear: -1.0, cabRear: -1.55, tail: 'trunk', trunkH: 0.98,
};

export const VEHICLES: VehicleModel[] = [
  {
    id: 'sedan', name: 'Family Sedan', length: 4.6, width: 1.8,
    colors: ['#c0c4c8', '#1f3b70', '#7a1020', '#f2f2ee', '#2b2d31', '#5c7c4a'],
    build: (c) => finish(body(SEDAN, c).root),
  },
  {
    id: 'hatch', name: 'City Hatchback', length: 3.9, width: 1.72,
    colors: ['#e63946', '#4cc9f0', '#ffd60a', '#80ed99', '#f2f2ee', '#ff7b00'],
    build: (c) => finish(body({
      length: 3.9, width: 1.72, wheelbase: 2.45, wheelR: 0.31, hood: 0.84, belt: 0.97, roof: 1.5,
      cabFront: 0.72, cabTopFront: 0.05, cabTopRear: -1.55, cabRear: -1.9, tail: 'hatch',
    }, c).root),
  },
  {
    id: 'sports', name: 'Sports Coupe', length: 4.4, width: 1.9,
    colors: ['#e63946', '#ffd60a', '#ff7b00', '#2b2d31', '#3a86ff'],
    build: (c) => {
      const { root, shell, Rr } = body({
        length: 4.4, width: 1.9, wheelbase: 2.6, wheelR: 0.34, hood: 0.7, belt: 0.82, roof: 1.18,
        cabFront: 0.45, cabTopFront: -0.25, cabTopRear: -0.95, cabRear: -1.8, tail: 'trunk', trunkH: 0.86,
      }, c);
      shell.add(box(0.3, 0.05, 1.6, MAT.black, Rr + 0.25, 1.05, 0)); // rear wing
      for (const z of [-0.6, 0.6]) shell.add(box(0.06, 0.18, 0.06, MAT.black, Rr + 0.3, 0.95, z));
      return finish(root);
    },
  },
  {
    id: 'van', name: 'Minivan', length: 5.0, width: 1.95,
    colors: ['#f2f2ee', '#c0c4c8', '#1f3b70', '#6f8fb5', '#7a1020'],
    build: (c) => finish(body({
      length: 5.0, width: 1.95, wheelbase: 3.0, wheelR: 0.34, hood: 1.0, belt: 1.1, roof: 1.95,
      cabFront: 1.55, cabTopFront: 0.95, cabTopRear: -2.35, cabRear: -2.45, tail: 'hatch',
    }, c).root),
  },
  {
    id: 'pickup', name: 'Pickup Truck', length: 5.3, width: 1.95,
    colors: ['#7a1020', '#2b2d31', '#f2f2ee', '#1f3b70', '#5c7c4a', '#ff7b00'],
    build: (c) => {
      const { root, shell, Rr } = body({
        length: 5.3, width: 1.95, wheelbase: 3.2, wheelR: 0.4, hood: 1.15, belt: 1.22, roof: 1.88,
        cabFront: 1.05, cabTopFront: 0.5, cabTopRear: -0.45, cabRear: -0.55, tail: 'flat',
      }, c);
      // Open bed: dark floor with a crate in it.
      shell.add(box(-0.7 - (Rr + 0.15), 0.03, 1.65, MAT.dark, (-0.7 + Rr + 0.15) / 2, 1.235, 0));
      shell.add(box(0.7, 0.5, 0.7, new THREE.MeshStandardMaterial({ color: 0xb07a3c }), -1.6, 1.5, 0.3));
      return finish(root);
    },
  },
  {
    id: 'taxi', name: 'Taxi', length: 4.6, width: 1.8,
    colors: ['#ffc300'],
    build: (c) => {
      const { root, shell } = body(SEDAN, c);
      const taxi = signMat('TAXI', '#ffffff', '#111111');
      // Across the roof, readable from in front and behind.
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.75), [taxi, taxi, MAT.white, MAT.white, MAT.white, MAT.white]);
      sign.position.set(-0.45, 1.6, 0);
      shell.add(sign);
      for (const z of [-0.91, 0.91]) shell.add(box(2.6, 0.08, 0.02, MAT.black, -0.2, 0.78, z)); // checker stripe
      return finish(root);
    },
  },
  {
    id: 'police', name: 'Police Car', length: 4.6, width: 1.8,
    colors: ['#141416'],
    build: (c) => {
      const { root, shell } = body(SEDAN, c);
      for (const z of [-0.905, 0.905]) shell.add(box(1.9, 0.5, 0.02, MAT.white, -0.1, 0.7, z)); // white doors
      shell.add(box(0.25, 0.12, 0.55, MAT.red, -0.45, 1.53, 0.3));
      shell.add(box(0.25, 0.12, 0.55, MAT.blue, -0.45, 1.53, -0.3));
      return finish(root);
    },
  },
  {
    id: 'bus', name: 'School Bus', length: 9.0, width: 2.4,
    colors: ['#ffb703'],
    build: (c) => {
      const { root, shell, F, Rr } = body({
        length: 9.0, width: 2.4, wheelbase: 5.2, wheelR: 0.46, hood: 1.35, belt: 1.5, roof: 2.85,
        cabFront: 3.6, cabTopFront: 3.45, cabTopRear: -4.35, cabRear: -4.42, tail: 'hatch',
      }, c);
      const p = paint(c);
      for (let x = -4.0; x < 3.3; x += 0.9) for (const z of [-1, 1]) shell.add(box(0.12, 1.3, 0.05, p, x, 2.15, z * 1.13)); // window posts
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
      return finish(root);
    },
  },
  {
    id: 'truck', name: 'Delivery Truck', length: 6.6, width: 2.2,
    colors: ['#f2f2ee', '#3a86ff', '#e63946', '#2a9d8f'],
    build: (c) => {
      const { root, shell, Rr } = body({
        length: 6.6, width: 2.2, wheelbase: 4.0, wheelR: 0.45, hood: 1.25, belt: 1.35, roof: 2.3,
        cabFront: 2.6, cabTopFront: 2.25, cabTopRear: 1.3, cabRear: 1.25, tail: 'flat',
      }, c);
      const cargo = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.0, 2.2), [MAT.white, MAT.white, MAT.white, MAT.white, signMat('DELIVERY', '#ffffff', '#e63946'), signMat('DELIVERY', '#ffffff', '#e63946')]);
      cargo.position.set(Rr + 2.15, 2.4, 0);
      shell.add(cargo);
      return finish(root);
    },
  },
];
