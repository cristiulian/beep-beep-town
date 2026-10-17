import * as THREE from 'three';
import { Collider, resolveCircle } from './collide';

export interface CarColors {
  body: string;
  roof: string;
  rims: string;
}

export interface CarModel {
  root: THREE.Group;
  /** Leans and bounces; wheels stay planted. */
  body: THREE.Group;
  paint: { body: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial; rims: THREE.MeshStandardMaterial };
  steerPivots: THREE.Object3D[];
  spinners: THREE.Object3D[];
  wheelRadius: number;
}

export interface CarDef {
  id: string;
  name: string;
  defaultColors: CarColors;
  build: () => CarModel;
}

const darkPlastic = () => new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.8 });

/** Side-profile shape (x = length, front at +x; y = height) extruded across the car's width. */
function extrudeProfile(points: [number, number][], width: number, mat: THREE.Material, bevel = 0.06) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** A chunky, toy-like compact SUV in the spirit of a RAV4 (no badges). */
function buildRav4(): CarModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = {
    body: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 }),
    roof: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 }),
    rims: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.5 }),
  };
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d2a38, roughness: 0.1, metalness: 0.6 });
  const plastic = darkPlastic();

  // Built along +x, then turned so the car faces +z.
  const shell = new THREE.Group();
  shell.rotation.y = -Math.PI / 2;
  body.add(shell);

  // Lower body: squared-off nose, flat hood, upright tail.
  shell.add(
    extrudeProfile(
      [
        [-2.3, 0.42], [2.2, 0.42], [2.32, 0.6], [2.32, 0.86], [2.18, 1.0],
        [0.95, 1.06], [-2.3, 1.08],
      ],
      1.86,
      paint.body,
    ),
  );
  // Greenhouse (glass) with raked windshield.
  shell.add(extrudeProfile([[0.95, 1.04], [0.05, 1.6], [-2.0, 1.6], [-2.26, 1.04]], 1.72, glass, 0.04));
  // Roof slab + pillars in paint.
  shell.add(box(2.15, 0.09, 1.76, paint.roof, -0.98, 1.66, 0));
  shell.add(box(0.14, 0.56, 1.75, paint.body, -0.85, 1.33, 0));
  for (const z of [-0.84, 0.84]) shell.add(box(0.14, 0.52, 0.1, paint.body, -2.12, 1.32, z));
  // Roof rails.
  for (const z of [-0.66, 0.66]) shell.add(box(1.9, 0.07, 0.07, plastic, -1.0, 1.75, z));
  // Mirrors.
  for (const z of [-1.0, 1.0]) shell.add(box(0.2, 0.14, 0.18, paint.body, 0.8, 1.12, z));

  // Rugged black cladding: sills, bumpers, wheel arches.
  for (const z of [-0.94, 0.94]) shell.add(box(2.0, 0.16, 0.04, plastic, 0, 0.5, z));
  shell.add(box(0.12, 0.26, 1.8, plastic, 2.34, 0.52, 0));
  shell.add(box(0.12, 0.26, 1.8, plastic, -2.34, 0.52, 0));
  const archGeo = new THREE.RingGeometry(0.43, 0.56, 20, 1, 0, Math.PI);
  for (const x of [-1.45, 1.45]) {
    for (const z of [-0.95, 0.95]) {
      const arch = new THREE.Mesh(archGeo, new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.8, side: THREE.DoubleSide }));
      arch.position.set(x, 0.4, z);
      shell.add(arch);
    }
  }

  // Grille + lights.
  shell.add(box(0.06, 0.2, 1.1, plastic, 2.33, 0.75, 0));
  const headlight = new THREE.MeshStandardMaterial({ color: 0xfffbe6, emissive: 0xfff3b0, emissiveIntensity: 0.6 });
  const taillight = new THREE.MeshStandardMaterial({ color: 0xd61f26, emissive: 0x900000, emissiveIntensity: 0.5 });
  for (const z of [-0.68, 0.68]) {
    shell.add(box(0.06, 0.1, 0.42, headlight, 2.27, 0.92, z));
    shell.add(box(0.06, 0.22, 0.26, taillight, -2.33, 0.92, z * 1.1));
  }

  // Wheels hang off the root so the body can lean independently.
  const wheelRadius = 0.38;
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.32, 24).rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.34, 12).rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const steerPivots: THREE.Object3D[] = [];
  const spinners: THREE.Object3D[] = [];
  for (const zPos of [1.45, -1.45]) {
    for (const xPos of [0.84, -0.84]) {
      const pivot = new THREE.Group();
      pivot.position.set(xPos, wheelRadius, zPos);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      spin.add(tire, new THREE.Mesh(rimGeo, paint.rims));
      // A spoke so you can see the wheels turn.
      spin.add(box(0.36, 0.42, 0.07, paint.rims, 0, 0, 0));
      pivot.add(spin);
      root.add(pivot);
      spinners.push(spin);
      if (zPos > 0) steerPivots.push(pivot);
    }
  }

  return { root, body, paint, steerPivots, spinners, wheelRadius };
}

export const CARS: CarDef[] = [
  {
    id: 'rav4',
    name: 'RAV4',
    defaultColors: { body: '#e63946', roof: '#ffffff', rims: '#d9d9d9' },
    build: buildRav4,
  },
];

const MAX_SPEED = 15;
const MAX_REVERSE = 6;
const ACCEL = 9;
const BRAKE = 22;
const COAST = 5;
const TURN_RATE = 1.9;
const RADIUS = 1.3;

export class Car {
  model: CarModel;
  speed = 0;
  heading = 0;
  steer = 0;
  private spin = 0;
  private bumpTimer = 0;

  constructor(def: CarDef, colors: CarColors) {
    this.model = def.build();
    this.setColors(colors);
  }

  get position() {
    return this.model.root.position;
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  setColors(c: CarColors) {
    this.model.paint.body.color.set(c.body);
    this.model.paint.roof.color.set(c.roof);
    this.model.paint.rims.color.set(c.rims);
  }

  /** throttle and steer are -1..1; steer +1 turns right. Returns bump strength (0 if none). */
  update(dt: number, throttle: number, steer: number, colliders: Collider[]): number {
    this.steer += (steer - this.steer) * Math.min(1, dt * 8);

    if (throttle !== 0) {
      const braking = Math.abs(this.speed) > 0.5 && Math.sign(throttle) !== Math.sign(this.speed);
      this.speed += throttle * (braking ? BRAKE : ACCEL) * dt;
    } else {
      const d = COAST * dt;
      this.speed = Math.abs(this.speed) <= d ? 0 : this.speed - Math.sign(this.speed) * d;
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -MAX_REVERSE, MAX_SPEED);

    const grip = THREE.MathUtils.clamp(this.speed / 4, -1, 1);
    this.heading -= this.steer * TURN_RATE * grip * dt;

    const pos = this.position;
    pos.x += Math.sin(this.heading) * this.speed * dt;
    pos.z += Math.cos(this.heading) * this.speed * dt;

    let bump = 0;
    for (const c of colliders) {
      if (resolveCircle(pos, RADIUS, c)) bump = Math.max(bump, Math.abs(this.speed));
    }
    if (bump > 0) {
      // Boing! Bounce back gently instead of crashing.
      this.speed = -this.speed * 0.35;
      if (bump > 2) this.bumpTimer = 0.35;
    }

    this.animate(dt);
    return bump;
  }

  private animate(dt: number) {
    const m = this.model;
    m.root.rotation.y = this.heading;
    this.spin += (this.speed / m.wheelRadius) * dt;
    for (const s of m.spinners) s.rotation.x = this.spin;
    for (const p of m.steerPivots) p.rotation.y = -this.steer * 0.45;

    const roll = this.steer * Math.min(Math.abs(this.speed) / MAX_SPEED, 1) * 0.07;
    m.body.rotation.z += (roll - m.body.rotation.z) * Math.min(1, dt * 6);

    this.bumpTimer = Math.max(0, this.bumpTimer - dt);
    const t = this.bumpTimer / 0.35;
    const squash = Math.sin(t * Math.PI * 3) * t * 0.12;
    m.body.scale.set(1 + squash, 1 - squash, 1 + squash);
  }
}
