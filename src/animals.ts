import * as THREE from 'three';
import { Collider } from './collide';
import { POND, groundHeight } from './terrain';
import { flattenByMaterial } from './merge';

export type Species = 'cow' | 'sheep' | 'pig' | 'duck';

interface Animal {
  species: Species;
  root: THREE.Group;
  head: THREE.Object3D;
  legs: THREE.Object3D[];
  home: THREE.Vector2;
  homeR: number;
  target: THREE.Vector2;
  heading: number;
  speed: number;
  idle: number;
  flee: number;
  gait: number;
  collider: Extract<Collider, { kind: 'circle' }>;
  soundCooldown: number;
}

const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
function part(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}
const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Legs pivot at the hip so they can swing. */
function leg(geo: THREE.BufferGeometry, m: THREE.Material, x: number, hipY: number, z: number, len: number) {
  const pivot = new THREE.Group();
  pivot.position.set(x, hipY, z);
  pivot.add(part(geo, m, 0, -len / 2, 0));
  return pivot;
}

function buildCow() {
  const g = new THREE.Group();
  const white = mat(0xf8f8f2), black = mat(0x1d1d1d), pink = mat(0xf4a6b0), horn = mat(0xe9dcc0);
  g.add(part(B(1.0, 0.9, 1.9), white, 0, 1.25, 0));
  for (const [x, y, z, w, h, d] of [[0.51, 1.35, 0.3, 0.02, 0.5, 0.6], [-0.51, 1.2, -0.4, 0.02, 0.45, 0.7], [0.2, 1.71, -0.3, 0.5, 0.02, 0.6], [-0.51, 1.4, 0.5, 0.02, 0.35, 0.35]]) {
    g.add(part(B(w, h, d), black, x, y, z));
  }
  const head = new THREE.Group();
  head.position.set(0, 1.55, 1.0);
  head.add(part(B(0.55, 0.55, 0.6), white, 0, 0, 0.25));
  head.add(part(B(0.5, 0.3, 0.2), pink, 0, -0.15, 0.6));
  head.add(part(B(0.08, 0.2, 0.08), horn, 0.2, 0.35, 0.15), part(B(0.08, 0.2, 0.08), horn, -0.2, 0.35, 0.15));
  head.add(part(B(0.25, 0.1, 0.15), black, 0.38, 0.12, 0.1), part(B(0.25, 0.1, 0.15), black, -0.38, 0.12, 0.1));
  head.add(part(B(0.07, 0.07, 0.02), black, 0.15, 0.08, 0.56), part(B(0.07, 0.07, 0.02), black, -0.15, 0.08, 0.56));
  g.add(head);
  const legGeo = B(0.22, 0.85, 0.22);
  const legs = [[0.3, 0.7], [-0.3, 0.7], [0.3, -0.7], [-0.3, -0.7]].map(([x, z]) => leg(legGeo, white, x, 0.85, z, 0.85));
  g.add(...legs);
  g.add(part(B(0.06, 0.7, 0.06), white, 0, 1.25, -1.0));
  return { g, head, legs };
}

function buildSheep() {
  const g = new THREE.Group();
  const wool = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const face = mat(0x2b2b2b);
  const puff = new THREE.IcosahedronGeometry(0.42, 0);
  for (const [x, y, z] of [[0, 0.95, 0], [0.25, 1.05, 0.35], [-0.25, 1.05, 0.35], [0.25, 1.0, -0.35], [-0.25, 1.0, -0.35], [0, 1.25, 0], [0, 0.95, -0.55], [0, 1.0, 0.55]]) {
    g.add(part(puff, wool, x, y, z));
  }
  const head = new THREE.Group();
  head.position.set(0, 1.15, 0.85);
  head.add(part(B(0.34, 0.4, 0.42), face, 0, 0, 0.1));
  head.add(part(new THREE.IcosahedronGeometry(0.2, 0), wool, 0, 0.25, 0));
  head.add(part(B(0.25, 0.08, 0.12), face, 0.22, 0.05, 0), part(B(0.25, 0.08, 0.12), face, -0.22, 0.05, 0));
  g.add(head);
  const legGeo = B(0.12, 0.6, 0.12);
  const legs = [[0.2, 0.4], [-0.2, 0.4], [0.2, -0.4], [-0.2, -0.4]].map(([x, z]) => leg(legGeo, face, x, 0.6, z, 0.6));
  g.add(...legs);
  return { g, head, legs };
}

function buildPig() {
  const g = new THREE.Group();
  const pink = mat(0xf7a8b8), dark = mat(0xd77a8f);
  g.add(part(B(0.8, 0.7, 1.25), pink, 0, 0.7, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.8, 0.65);
  head.add(part(B(0.6, 0.55, 0.45), pink, 0, 0, 0.15));
  head.add(part(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12).rotateX(Math.PI / 2), dark, 0, -0.05, 0.42));
  head.add(part(B(0.18, 0.18, 0.05), dark, 0.2, 0.3, 0.1), part(B(0.18, 0.18, 0.05), dark, -0.2, 0.3, 0.1));
  g.add(head);
  const tail = part(new THREE.TorusGeometry(0.1, 0.03, 6, 12), dark, 0, 0.85, -0.66);
  g.add(tail);
  const legGeo = B(0.16, 0.38, 0.16);
  const legs = [[0.25, 0.4], [-0.25, 0.4], [0.25, -0.4], [-0.25, -0.4]].map(([x, z]) => leg(legGeo, pink, x, 0.38, z, 0.38));
  g.add(...legs);
  return { g, head, legs };
}

function buildDuck() {
  const g = new THREE.Group();
  const yellow = mat(0xffd23f), orange = mat(0xff8c1a), black = mat(0x111111);
  const bodyM = part(new THREE.SphereGeometry(0.35, 12, 8), yellow, 0, 0.3, 0);
  bodyM.scale.set(1, 0.8, 1.35);
  g.add(bodyM);
  g.add(part(B(0.08, 0.2, 0.08), yellow, 0, 0.42, -0.45));
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.3);
  head.add(part(new THREE.SphereGeometry(0.2, 12, 8), yellow, 0, 0, 0));
  head.add(part(B(0.18, 0.06, 0.2), orange, 0, -0.03, 0.22));
  head.add(part(B(0.04, 0.04, 0.02), black, 0.1, 0.06, 0.17), part(B(0.04, 0.04, 0.02), black, -0.1, 0.06, 0.17));
  g.add(head);
  return { g, head, legs: [] as THREE.Object3D[] };
}

const BUILDERS: Record<Species, () => { g: THREE.Group; head: THREE.Object3D; legs: THREE.Object3D[] }> = {
  cow: buildCow, sheep: buildSheep, pig: buildPig, duck: buildDuck,
};
const RADIUS: Record<Species, number> = { cow: 1.0, sheep: 0.7, pig: 0.6, duck: 0.35 };
const WALK: Record<Species, number> = { cow: 1.0, sheep: 1.3, pig: 1.2, duck: 0.9 };
const RUN: Record<Species, number> = { cow: 5, sheep: 6.5, pig: 5.5, duck: 4 };

export class Animals {
  list: Animal[] = [];
  onSound: (s: Species) => void = () => {};

  constructor(scene: THREE.Scene, colliders: Collider[]) {
    const herd = (species: Species, n: number, x: number, z: number, r: number) => {
      for (let i = 0; i < n; i++) {
        const { g, head, legs } = BUILDERS[species]();
        // Merge each rigid part (body, head, each leg) so an animal is a few draw calls, not dozens.
        head.userData.keep = true;
        legs.forEach((l) => (l.userData.keep = true));
        flattenByMaterial(g);
        flattenByMaterial(head);
        const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.8;
        const pos = new THREE.Vector2(x + Math.cos(a) * d, z + Math.sin(a) * d);
        g.position.set(pos.x, groundHeight(pos.x, pos.y), pos.y);
        scene.add(g);
        const collider = { kind: 'circle' as const, x: pos.x, z: pos.y, r: RADIUS[species] };
        colliders.push(collider);
        this.list.push({
          species, root: g, head, legs, home: new THREE.Vector2(x, z), homeR: r, target: pos.clone(),
          heading: Math.random() * Math.PI * 2, speed: 0, idle: Math.random() * 3, flee: 0, gait: 0,
          collider, soundCooldown: 0,
        });
      }
    };
    herd('cow', 6, 108, -25, 20);
    herd('pig', 4, 98, -46, 8);
    herd('sheep', 8, -108, -100, 22);
    herd('sheep', 5, 100, 105, 16);
    herd('duck', 6, POND.x, POND.z, POND.r - 3);
    herd('cow', 3, -110, 40, 14);
  }

  /** Honking makes nearby animals run and call out. */
  scare(from: THREE.Vector3, radius: number) {
    let called = false;
    for (const a of this.list) {
      if (Math.hypot(a.root.position.x - from.x, a.root.position.z - from.z) < radius) {
        a.flee = 1.5 + Math.random();
        if (!called) {
          this.onSound(a.species);
          called = true;
        }
      }
    }
  }

  update(dt: number, t: number, car: THREE.Vector3) {
    for (const a of this.list) {
      const p = a.root.position;
      a.soundCooldown -= dt;
      const dx = p.x - car.x, dz = p.z - car.z;
      const dCar = Math.hypot(dx, dz);
      a.root.visible = dCar < 90; // tiny in the fog beyond this; skip drawing them
      if (dCar < 7) {
        if (a.flee <= 0 && a.soundCooldown <= 0) {
          this.onSound(a.species);
          a.soundCooldown = 4;
        }
        a.flee = 1.2;
      }

      let want = 0;
      if (a.flee > 0) {
        a.flee -= dt;
        // Run away from the car, but drift back towards home if straying too far.
        let ax = dx / (dCar || 1), az = dz / (dCar || 1);
        const hx = a.home.x - p.x, hz = a.home.y - p.z;
        const hd = Math.hypot(hx, hz);
        if (hd > a.homeR) {
          ax += (hx / hd) * 1.5;
          az += (hz / hd) * 1.5;
        }
        a.heading = turnTowards(a.heading, Math.atan2(ax, az), dt * 6);
        want = RUN[a.species];
        a.idle = 1 + Math.random() * 2;
        a.target.set(p.x, p.z);
      } else if (a.idle > 0) {
        a.idle -= dt;
        if (a.idle <= 0) {
          const ang = Math.random() * Math.PI * 2, d = Math.random() * a.homeR;
          a.target.set(a.home.x + Math.cos(ang) * d, a.home.y + Math.sin(ang) * d);
        }
      } else {
        const tx = a.target.x - p.x, tz = a.target.y - p.z;
        if (Math.hypot(tx, tz) < 0.6) a.idle = 2 + Math.random() * 5;
        else {
          a.heading = turnTowards(a.heading, Math.atan2(tx, tz), dt * 2.5);
          want = WALK[a.species];
        }
      }
      a.speed += (want - a.speed) * Math.min(1, dt * 4);
      p.x += Math.sin(a.heading) * a.speed * dt;
      p.z += Math.cos(a.heading) * a.speed * dt;

      // Ducks float; everyone else walks on the ground.
      const g = groundHeight(p.x, p.z);
      p.y = a.species === 'duck' ? Math.max(g, POND.level - 0.12) + Math.sin(t * 2 + a.home.x) * 0.03 : g;
      a.root.rotation.y = a.heading;

      a.gait += a.speed * dt * 4;
      const swing = Math.sin(a.gait) * Math.min(a.speed, 2) * 0.35;
      a.legs.forEach((l, i) => (l.rotation.x = i % 3 === 0 ? swing : -swing));
      // Graze when standing still.
      const graze = a.speed < 0.2 && a.species !== 'duck' ? (Math.sin(t * 0.8 + a.home.y + p.x) > 0.3 ? 0.6 : 0) : 0;
      a.head.rotation.x += (graze - a.head.rotation.x) * Math.min(1, dt * 3);
      a.root.position.y += a.speed > 2 ? Math.abs(Math.sin(a.gait)) * 0.12 : 0;

      a.collider.x = p.x;
      a.collider.z = p.z;
    }
  }
}

function turnTowards(cur: number, target: number, maxStep: number) {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}
