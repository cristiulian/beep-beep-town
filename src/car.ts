import * as THREE from 'three';
import { Collider, resolveCircle } from './collide';
import { flattenByMaterial } from './merge';

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
  lights: { brake: THREE.MeshStandardMaterial; reverse: THREE.MeshStandardMaterial };
  steerPivots: THREE.Object3D[];
  spinners: THREE.Object3D[];
  wheelRadius: number;
}

export interface Handling {
  maxSpeed: number;
  accel: number;
  turn: number;
}

export interface CarDef {
  id: string;
  name: string;
  emoji: string;
  length: number;
  width: number;
  handling: Handling;
  defaultColors: CarColors;
  build: () => CarModel;
}

export type V2 = [number, number];

/** Points along an arc (used for wheel wells), from angle a0 to a1. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 10): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Side profile (x = length with the nose at +x, y = height) extruded across the width.
 * `shapeZ` narrows the width per vertex, for tumblehome and rounded corners.
 */
export function extrudeProfile(
  points: V2[],
  width: number,
  mat: THREE.Material,
  bevel: number,
  shapeZ?: (x: number, y: number) => number,
) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel, // keep the outline where it was drawn
    bevelSegments: 3,
    curveSegments: 4,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  if (shapeZ) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * shapeZ(p.getX(i), p.getY(i)));
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

/** A flat polygon facing +x (for grilles and lights on the nose), drawn in (z, y). */
function frontDecal(points: V2[], mat: THREE.Material, x: number, depth = 0.03) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.x = x - depth;
  return m;
}

export function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const mirrorZ = (pts: V2[]): V2[] => pts.map(([z, y]) => [-z, y]);

function textTexture(text: string, bg: string, fg: string, w = 256, h = 64) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `bold ${h * 0.62}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Toyota's three-ellipse emblem, facing +x. */
function toyotaEmblem(mat: THREE.Material, scale: number) {
  const g = new THREE.Group();
  const ring = (rx: number, ry: number, tube: number, y = 0) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(1, tube, 6, 28), mat);
    t.scale.set(rx, ry, 1);
    t.rotation.y = Math.PI / 2;
    t.position.y = y;
    g.add(t);
  };
  ring(1, 0.68, 0.09);
  ring(0.32, 0.6, 0.08, -0.02);
  ring(0.72, 0.24, 0.08, 0.36);
  g.scale.setScalar(scale);
  return g;
}

/** Fifth-generation (2019+) Toyota RAV4. */
function buildRav4(): CarModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = {
    body: new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.35 }),
    roof: new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.35 }),
    rims: new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.75 }),
  };
  const glass = new THREE.MeshStandardMaterial({ color: 0x141b24, roughness: 0.05, metalness: 0.7 });
  const cladding = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.85 });
  const gloss = new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.2, metalness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.15, metalness: 1 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.7 });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xeaf4ff, emissive: 0xdfefff, emissiveIntensity: 0.9, roughness: 0.1 });
  const lights = {
    brake: new THREE.MeshStandardMaterial({ color: 0xc8101a, emissive: 0xff0010, emissiveIntensity: 0.35, roughness: 0.2 }),
    reverse: new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2 }),
  };

  // Built along +x, then turned so the car faces +z.
  const shell = new THREE.Group();
  shell.rotation.y = -Math.PI / 2;
  body.add(shell);

  const FRONT_AXLE = 1.34, REAR_AXLE = -1.35, R = 0.36, WELL = 0.47;

  // ---- Lower body: upright squared nose, flat hood, rising beltline with the rear "kick".
  const lower: V2[] = [
    [2.24, 0.42], [2.29, 0.6], [2.29, 0.9], [2.2, 0.99], [1.7, 1.04], [0.8, 1.1],
    [-0.6, 1.13], [-1.33, 1.16], [-1.52, 1.25], [-2.18, 1.29], [-2.27, 1.22], [-2.31, 0.95],
    [-2.3, 0.56], [-2.22, 0.38], [-1.9, 0.34],
    ...arc(REAR_AXLE, R, WELL, Math.PI, 0),
    ...arc(FRONT_AXLE, R, WELL, Math.PI, 0),
    [2.05, 0.36],
  ];
  shell.add(
    extrudeProfile(lower, 1.86, paint.body, 0.08, (x, y) =>
      // Rounded corners in plan view, and slight tumblehome above the wheels.
      (1 - 0.09 * smoothstep(1.85, 2.32, Math.abs(x + 0.02))) * (1 - 0.05 * smoothstep(0.85, 1.25, y)),
    ),
  );

  // ---- Greenhouse: raked windshield, long roof, steep tailgate glass. Black pillars = "floating roof".
  const green: V2[] = [
    [0.82, 1.07], [-0.02, 1.62], [-1.93, 1.66], [-2.25, 1.25], [-1.54, 1.23], [-1.34, 1.13], [-0.6, 1.1],
  ];
  shell.add(extrudeProfile(green, 1.76, glass, 0.04, (_x, y) => 1 - 0.16 * smoothstep(1.1, 1.66, y)));

  // Roof panel (the roof colour slot) and spoiler.
  shell.add(box(1.96, 0.05, 1.46, paint.roof, -0.97, 1.675, 0));
  const spoiler = box(0.32, 0.05, 1.4, gloss, -2.02, 1.66, 0);
  spoiler.rotation.z = 0.12;
  shell.add(spoiler);
  // Roof rails and shark-fin antenna.
  for (const z of [-0.6, 0.6]) {
    shell.add(box(1.6, 0.05, 0.06, gloss, -1.0, 1.75, z));
    for (const x of [-1.75, -0.25]) shell.add(box(0.1, 0.06, 0.06, gloss, x, 1.71, z));
  }
  const fin = extrudeProfile([[-1.55, 1.69], [-1.72, 1.8], [-1.82, 1.69]], 0.07, gloss, 0);
  shell.add(fin);
  // Chrome-free black window trim along the beltline.
  for (const z of [-0.87, 0.87]) {
    const strip = box(2.9, 0.03, 0.02, gloss, -0.72, 1.115, z);
    strip.rotation.z = 0.02;
    shell.add(strip);
  }

  // ---- Mirrors (body colour on black stalks).
  for (const s of [-1, 1]) {
    shell.add(box(0.12, 0.05, 0.12, gloss, 0.66, 1.13, s * 0.92));
    shell.add(box(0.2, 0.15, 0.13, paint.body, 0.62, 1.2, s * 1.0));
  }

  // ---- Door seams and handles.
  for (const z of [-0.925, 0.925]) {
    shell.add(box(0.012, 0.62, 0.01, gloss, 0.84, 0.8, z));
    shell.add(box(0.012, 0.7, 0.01, gloss, -0.42, 0.78, z));
    shell.add(box(0.012, 0.36, 0.01, gloss, -1.36, 0.98, z));
    shell.add(box(0.012, 0.32, 0.01, gloss, -0.8, 0.48, z));
    for (const x of [0.1, -1.0]) shell.add(box(0.2, 0.035, 0.02, paint.body, x, 1.0, z * 1.01));
  }

  // ---- Rugged black cladding: squared wheel arches + rocker panels.
  const archShape = new THREE.Shape();
  const archPts: V2[] = [
    [-0.66, -0.06], [-0.6, 0.28], [-0.4, 0.53], [0.4, 0.53], [0.6, 0.28], [0.66, -0.06], [0.48, -0.06],
    ...arc(0, 0, 0.475, 0, Math.PI, 14), [-0.48, -0.06],
  ];
  archShape.setFromPoints(archPts.map(([x, y]) => new THREE.Vector2(x, y)));
  const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: 0.05, bevelEnabled: false });
  for (const ax of [FRONT_AXLE, REAR_AXLE]) {
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(archGeo, cladding);
      a.position.set(ax, R, s > 0 ? 0.9 : -0.95);
      shell.add(a);
    }
  }
  for (const s of [-1, 1]) shell.add(box(1.7, 0.16, 0.05, cladding, -0.005, 0.42, s * 0.92));

  // ---- Front: big trapezoid lower grille, slim upper grille, sharp headlights, skid plate.
  const NOSE = 2.32;
  shell.add(box(0.1, 0.09, 1.5, cladding, 2.25, 0.4, 0)); // lower lip
  shell.add(frontDecal([[-0.62, 0.43], [0.62, 0.43], [0.5, 0.76], [-0.5, 0.76]], gloss, NOSE, 0.05));
  // Hex mesh hint: rows of small dark tiles.
  const hex = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.5, metalness: 0.4 });
  for (let row = 0; row < 3; row++) {
    for (let i = -5; i <= 5; i++) {
      const y = 0.5 + row * 0.085;
      const spread = 0.58 - row * 0.04;
      if (Math.abs(i * 0.1 + (row % 2) * 0.05) > spread) continue;
      shell.add(box(0.02, 0.045, 0.06, hex, NOSE + 0.005, y, i * 0.1 + (row % 2) * 0.05));
    }
  }
  shell.add(frontDecal([[-0.5, 0.36], [0.5, 0.36], [0.44, 0.44], [-0.44, 0.44]], silver, NOSE - 0.02, 0.06)); // skid plate
  shell.add(frontDecal([[-0.36, 0.8], [0.36, 0.8], [0.4, 0.9], [-0.4, 0.9]], gloss, NOSE)); // upper grille
  const lamp: V2[] = [[0.42, 0.83], [0.78, 0.86], [0.8, 0.95], [0.5, 0.93]];
  const drl: V2[] = [[0.46, 0.805], [0.78, 0.835], [0.78, 0.848], [0.46, 0.818]];
  for (const s of [-1, 1]) {
    shell.add(frontDecal(s > 0 ? lamp : mirrorZ(lamp), headlight, NOSE + 0.005));
    // Dark upper edge gives the lamps their sharp "brow".
    shell.add(frontDecal([[0.5, 0.93], [0.8, 0.95], [0.8, 0.965], [0.5, 0.95]].map(([z, y]) => [s * z, y]) as V2[], gloss, NOSE + 0.008, 0.01));
  }
  for (const pts of [drl, mirrorZ(drl)]) shell.add(frontDecal(pts, headlight, NOSE + 0.012, 0.01));
  // Fog-light "C" housings.
  for (const s of [-1, 1]) shell.add(frontDecal([[0.64, 0.47], [0.76, 0.48], [0.75, 0.68], [0.67, 0.66]].map(([z, y]) => [s * z, y]) as V2[], cladding, NOSE - 0.01, 0.05));
  const emblem = toyotaEmblem(chrome, 0.075);
  emblem.position.set(NOSE + 0.02, 0.86, 0);
  shell.add(emblem);

  // ---- Rear: slim taillights wrapping round the corners, plate, emblem, black lower bumper.
  const TAIL = -2.33;
  shell.add(box(0.1, 0.15, 1.6, cladding, -2.28, 0.44, 0));
  for (const s of [-1, 1]) {
    shell.add(box(0.04, 0.08, 0.36, lights.brake, TAIL, 1.06, s * 0.6));
    shell.add(box(0.04, 0.045, 0.24, lights.brake, TAIL, 0.995, s * 0.66));
    shell.add(box(0.26, 0.08, 0.03, lights.brake, -2.17, 1.07, s * 0.855));
    shell.add(box(0.04, 0.05, 0.1, lights.reverse, TAIL - 0.005, 0.47, s * 0.6));
  }
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.13),
    new THREE.MeshStandardMaterial({ map: textTexture('RAV4', '#f4f4f4', '#1a2a6c') }),
  );
  plate.rotation.y = -Math.PI / 2;
  plate.position.set(TAIL - 0.005, 0.82, 0);
  shell.add(plate);
  const rearEmblem = toyotaEmblem(chrome, 0.07);
  rearEmblem.rotation.y = Math.PI;
  rearEmblem.position.set(TAIL - 0.01, 1.02, 0);
  shell.add(rearEmblem);

  // ---- Wheels: 18" five-double-spoke alloys on chunky tyres. They hang off the root.
  const tireGeo = new THREE.CylinderGeometry(R, R, 0.26, 28).rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.92 });
  const barrel = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.6, metalness: 0.4 });
  const steerPivots: THREE.Object3D[] = [];
  const spinners: THREE.Object3D[] = [];
  for (const zPos of [FRONT_AXLE, REAR_AXLE]) {
    for (const s of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.8, R, zPos);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      spin.add(tire);
      const face = new THREE.Group();
      face.add(new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.02, 24).rotateZ(Math.PI / 2), barrel));
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.022, 6, 28).rotateY(Math.PI / 2), paint.rims);
      face.add(lip);
      for (let k = 0; k < 5; k++) {
        for (const off of [-0.11, 0.11]) {
          const spoke = box(0.03, 0.2, 0.035, paint.rims, 0.01, 0.11, 0);
          const holder = new THREE.Group();
          holder.rotation.x = (k / 5) * Math.PI * 2 + off;
          holder.add(spoke);
          face.add(holder);
        }
      }
      face.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateZ(Math.PI / 2), paint.rims));
      face.position.x = s * 0.125;
      spin.add(face);
      pivot.add(spin);
      root.add(pivot);
      spinners.push(spin);
      if (zPos > 0) steerPivots.push(pivot);
    }
  }

  // ~150 parts become one mesh per material (paint and light materials stay live for recolouring).
  flattenByMaterial(shell);
  for (const s of spinners) flattenByMaterial(s);

  return { root, body, paint, lights, steerPivots, spinners, wheelRadius: R };
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const CARS: CarDef[] = [
  {
    id: 'rav4',
    name: 'RAV4',
    emoji: '🚙',
    length: 4.6,
    width: 1.86,
    handling: { maxSpeed: 21, accel: 10, turn: 1.8 },
    defaultColors: { body: '#a8a99a', roof: '#1b1c1e', rims: '#1b1c1e' },
    build: buildRav4,
  },
];

const MAX_REVERSE = 7;
const BRAKE = 24;
const COAST = 4;
const GRAVITY = 25;

export interface DriveEnv {
  colliders: Collider[];
  ground: (x: number, z: number) => number;
  /** 1 = normal; lower when out of fuel or in water. */
  speedScale: number;
}

export interface DriveEvents {
  bump: number;
  /** Seconds spent in the air, reported on landing. */
  landed: number;
}

export class Car {
  model: CarModel;
  speed = 0;
  heading = 0;
  steer = 0;
  vy = 0;
  grounded = true;
  airTime = 0;
  private pitch = 0;
  private roll = 0;
  private spin = 0;
  private bumpTimer = 0;
  readonly def: CarDef;
  /** Collision circles along the body (front, middle, back) and their radius. */
  private circleOffsets: number[];
  private collideR: number;
  private halfLen: number;

  constructor(def: CarDef, colors: CarColors) {
    this.def = def;
    this.model = def.build();
    this.setColors(colors);
    this.halfLen = def.length / 2;
    this.collideR = def.width / 2 + 0.07;
    const reach = Math.max(0, this.halfLen - this.collideR);
    this.circleOffsets = reach > 2 ? [reach, 0, -reach] : [reach, -reach];
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

  /** throttle and steer are -1..1; steer +1 turns right. */
  update(dt: number, throttle: number, steer: number, env: DriveEnv): DriveEvents {
    const ev: DriveEvents = { bump: 0, landed: 0 };
    this.steer += (steer - this.steer) * Math.min(1, dt * 8);
    const { maxSpeed, accel, turn } = this.def.handling;
    const max = maxSpeed * env.speedScale;

    if (this.grounded) {
      if (throttle !== 0) {
        const braking = Math.abs(this.speed) > 0.5 && Math.sign(throttle) !== Math.sign(this.speed);
        this.speed += throttle * (braking ? BRAKE : accel) * dt;
      } else {
        const d = COAST * dt;
        this.speed = Math.abs(this.speed) <= d ? 0 : this.speed - Math.sign(this.speed) * d;
      }
      // Hills slow you down going up and speed you up going down.
      this.speed += Math.sin(this.pitch) * 7 * dt;
      if (this.speed > max) this.speed = Math.max(max, this.speed - BRAKE * dt);
      this.speed = Math.max(this.speed, -MAX_REVERSE);
      const grip = THREE.MathUtils.clamp(this.speed / 4, -1, 1);
      this.heading -= this.steer * turn * grip * dt;
    } else {
      this.heading -= this.steer * 0.4 * dt; // a little air steering
    }

    const pos = this.position;
    const prevX = pos.x, prevZ = pos.z;
    pos.x += Math.sin(this.heading) * this.speed * dt;
    pos.z += Math.cos(this.heading) * this.speed * dt;

    // Two circles along the body so the nose doesn't sink into walls.
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const c = new THREE.Vector3();
    let hit = false;
    for (const off of this.circleOffsets) {
      for (const col of env.colliders) {
        c.set(pos.x + fx * off, 0, pos.z + fz * off);
        if (resolveCircle(c, this.collideR, col)) {
          pos.x = c.x - fx * off;
          pos.z = c.z - fz * off;
          hit = true;
        }
      }
    }

    // Ground: follow hills and ramps, fly off the end of them.
    let g = env.ground(pos.x, pos.z);
    if (this.grounded && g > pos.y + 0.6) {
      // Too steep to climb (the back of a ramp): treat it like a wall.
      pos.x = prevX;
      pos.z = prevZ;
      g = env.ground(pos.x, pos.z);
      hit = true;
    }
    if (hit) {
      ev.bump = Math.abs(this.speed);
      this.speed = -this.speed * 0.35;
      if (ev.bump > 2) this.bumpTimer = 0.35;
    }

    if (this.grounded) {
      if (g < pos.y - 0.35) {
        this.grounded = false; // drove off an edge: keep the upward speed from the ramp
        this.airTime = 0;
      } else {
        this.vy = THREE.MathUtils.clamp((g - pos.y) / Math.max(dt, 1e-3), -20, 12);
        pos.y = g;
      }
    }
    if (!this.grounded) {
      this.airTime += dt;
      this.vy -= GRAVITY * dt;
      pos.y += this.vy * dt;
      if (pos.y <= g) {
        pos.y = g;
        this.grounded = true;
        ev.landed = this.airTime;
        if (this.vy < -6) this.bumpTimer = 0.35;
        this.vy = 0;
      }
    }

    this.animate(dt, env, throttle);
    return ev;
  }

  private animate(dt: number, env: DriveEnv, throttle: number) {
    const m = this.model;
    const p = this.position;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let targetPitch: number, targetRoll: number;
    if (this.grounded) {
      // Tilt to match the ground under the wheels.
      const a = this.halfLen * 0.6, w = this.def.width * 0.43;
      const hf = env.ground(p.x + fx * a, p.z + fz * a);
      const hb = env.ground(p.x - fx * a, p.z - fz * a);
      const hl = env.ground(p.x + fz * w, p.z - fx * w);
      const hr = env.ground(p.x - fz * w, p.z + fx * w);
      targetPitch = -Math.atan2(hf - hb, 2 * a);
      targetRoll = Math.atan2(hl - hr, 2 * w);
    } else {
      targetPitch = -Math.atan2(this.vy, Math.max(Math.abs(this.speed), 4)) * 0.6;
      targetRoll = 0;
    }
    const k = Math.min(1, dt * (this.grounded ? 12 : 3));
    this.pitch += (targetPitch - this.pitch) * k;
    this.roll += (targetRoll - this.roll) * k;
    m.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');

    this.spin += (this.speed / m.wheelRadius) * dt;
    for (const s of m.spinners) s.rotation.x = this.spin;
    for (const pv of m.steerPivots) pv.rotation.y = -this.steer * 0.45;

    const lean = this.steer * Math.min(Math.abs(this.speed) / this.def.handling.maxSpeed, 1) * 0.06;
    m.body.rotation.z += (lean - m.body.rotation.z) * Math.min(1, dt * 6);

    this.bumpTimer = Math.max(0, this.bumpTimer - dt);
    const t = this.bumpTimer / 0.35;
    const squash = Math.sin(t * Math.PI * 3) * t * 0.1;
    m.body.scale.set(1 + squash, 1 - squash, 1 + squash);

    const braking = throttle < 0 && this.speed > 0.5;
    m.lights.brake.emissiveIntensity = braking ? 2.2 : 0.35;
    m.lights.reverse.emissiveIntensity = this.speed < -0.3 ? 1.5 : 0;
  }
}
