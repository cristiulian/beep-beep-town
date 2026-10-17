import * as THREE from 'three';

/** Playable area is -HALF..HALF on both axes; the town is the flat middle. */
export const HALF = 140;
export const TOWN = 78;
export const ROAD_LINES = [-60, 0, 60];
export const ROAD_W = 10;
export const POND = { x: -105, z: 100, r: 14, level: -0.35 };

export interface Ramp {
  x: number; // start of the slope
  z: number;
  dx: number; // unit direction you drive up it
  dz: number;
  len: number;
  w: number;
  h: number;
}

const ramp = (x: number, z: number, dir: '+x' | '-x' | '+z' | '-z', len: number, w: number, h: number): Ramp => {
  const [dx, dz] = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[dir];
  return { x, z, dx, dz, len, w, h };
};

export const RAMPS: Ramp[] = [
  // The Big Jump on the north road: kicker, gap, landing.
  ramp(0, 95, '+z', 9, 7, 3),
  ramp(0, 123, '-z', 10, 7, 2.2),
  // Stunt park (block east of the main road, south of the centre).
  ramp(10, -15, '+x', 4, 5, 0.8),
  ramp(22, -30, '+x', 5, 6, 1.3),
  ramp(32, -30, '-x', 5, 6, 1.3),
  ramp(15, -50, '+z', 6, 5, 1.6),
  ramp(45, -52, '+z', 5, 5, 1),
  ramp(45, -40, '-z', 5, 5, 1),
  ramp(40, -12, '-x', 6, 5, 1.8),
  // Country road jumps.
  ramp(-100, 0, '-x', 6, 7, 1.6),
  ramp(60, -100, '-z', 6, 7, 1.6),
  ramp(100, 60, '+x', 6, 7, 1.6),
];

/** Spots in the air worth putting a star in (centre of each jump's arc). */
export const AIR_SPOTS: [number, number, number][] = [
  [0, 6, 109],
  [27, 3.2, -30],
  [-110, 4, 0],
  [60, 4, -110],
  [110, 4, 60],
];

const HILLS: [number, number, number, number][] = [
  // x, z, radius, height
  [-110, -105, 28, 14],
  [-30, -115, 20, 9],
  [105, 112, 24, 11],
  [30, 112, 16, 7],
  [-112, 35, 18, 8],
  [112, 100, 14, 6],
  [-108, -40, 16, 6],
  [110, -100, 20, 9],
];

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function roadDist(x: number, z: number) {
  let d = Infinity;
  for (const l of ROAD_LINES) d = Math.min(d, Math.abs(x - l), Math.abs(z - l));
  return d;
}

export function terrainHeight(x: number, z: number) {
  const edge = Math.max(Math.abs(x), Math.abs(z));
  // Steep rim beyond the edge so the world feels like a valley.
  const rim = smoothstep(HALF + 2, HALF + 35, edge) * 22;
  const country = smoothstep(TOWN + 2, TOWN + 18, edge);
  if (country <= 0) return rim;

  let h = 0;
  for (const [hx, hz, r, hh] of HILLS) {
    const d2 = (x - hx) ** 2 + (z - hz) ** 2;
    h += hh * Math.exp(-d2 / (r * r));
  }
  h += (Math.sin(x * 0.07) + Math.sin(z * 0.05 + 1)) * 0.7 + Math.sin((x + z) * 0.11) * 0.4;
  h *= country * smoothstep(7, 16, roadDist(x, z));

  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.r + 5) h = THREE.MathUtils.lerp(-1.4, h, smoothstep(POND.r - 4, POND.r + 5, pd));
  return h + rim;
}

export function rampHeight(x: number, z: number) {
  let h = 0;
  for (const r of RAMPS) {
    const px = x - r.x, pz = z - r.z;
    const u = px * r.dx + pz * r.dz;
    const v = -px * r.dz + pz * r.dx;
    if (u >= 0 && u <= r.len && Math.abs(v) <= r.w / 2) h = Math.max(h, (r.h * u) / r.len);
  }
  return h;
}

export const groundHeight = (x: number, z: number) => terrainHeight(x, z) + rampHeight(x, z);

export function inPond(x: number, z: number) {
  return Math.hypot(x - POND.x, z - POND.z) < POND.r && terrainHeight(x, z) < POND.level;
}

export function buildTerrain(scene: THREE.Scene) {
  const size = (HALF + 45) * 2;
  const seg = 185;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x7ccf5a);
  const dark = new THREE.Color(0x4f9e3c);
  const sand = new THREE.Color(0xd9c58b);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    c.copy(grass).lerp(dark, Math.min(1, Math.max(0, h / 12)));
    // Speckle so big fields don't look flat.
    c.offsetHSL(0, 0, (Math.sin(x * 1.7) * Math.sin(z * 1.3)) * 0.02);
    if (h < -0.1) c.copy(sand);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  scene.add(mesh);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.r + 1.5, 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3fa7e0, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.2 }),
  );
  water.position.set(POND.x, POND.level, POND.z);
  scene.add(water);

  // Ramps: orange wedges with yellow sides and a white lip.
  const top = new THREE.MeshStandardMaterial({ color: 0xff7b00, roughness: 0.6 });
  const side = new THREE.MeshStandardMaterial({ color: 0xffd60a, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
  for (const r of RAMPS) {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(r.len, 0), new THREE.Vector2(r.len, r.h)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: r.w, bevelEnabled: false });
    g.translate(0, 0, -r.w / 2);
    const m = new THREE.Mesh(g, [side, top]);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, r.w + 0.02), white);
    lip.position.set(r.len - 0.12, r.h + 0.01, 0);
    const grp = new THREE.Group();
    grp.add(m, lip);
    grp.position.set(r.x, terrainHeight(r.x, r.z) + 0.02, r.z);
    grp.rotation.y = Math.atan2(-r.dz, r.dx);
    m.castShadow = m.receiveShadow = true;
    scene.add(grp);
  }
}
