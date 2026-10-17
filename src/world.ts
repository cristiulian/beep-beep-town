import * as THREE from 'three';
import { Collider, overlapsAny } from './collide';
import { ColorBatch, flattenByMaterial } from './merge';
import {
  AIR_SPOTS, HALF, POND, RAMPS, ROAD_LINES, ROAD_W, TOWN, buildTerrain, groundHeight, roadDist, terrainHeight,
} from './terrain';

const STAR_COUNT = 15;

/** Small seeded RNG so the world looks the same every visit. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const HOUSE_COLORS = [0xffd166, 0x8ecae6, 0xf4a261, 0xb5e48c, 0xffafcc, 0xcdb4db, 0xfefae0];
const ROOF_COLORS = [0xd62828, 0x3a86ff, 0x6a4c93, 0x2a9d8f, 0xe76f51];

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;

/** Areas kept free of houses and trees. */
export const PARK: Rect = { minX: 5, maxX: 55, minZ: -55, maxZ: -5 };
export const GAS: Rect = { minX: -30, maxX: -5, minZ: 30, maxZ: 54 };
export const FARM: Rect = { minX: 84, maxX: 136, minZ: -55, maxZ: -6 };
export const GAS_PUMPS: Rect = { minX: -20, maxX: -6, minZ: 35, maxZ: 47 };
export const BARN = { x: 112, z: -45 };

export function textTexture(text: string, bg: string, fg: string, w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `900 ${h * 0.6}px "Baloo 2", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signBoard(text: string, bg: string, fg: string, w: number, h: number) {
  const mat = new THREE.MeshStandardMaterial({ map: textTexture(text, bg, fg) });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), [mat, mat, mat, mat, mat, mat]);
  m.castShadow = true;
  return m;
}

export interface World {
  colliders: Collider[];
  stars: THREE.Mesh[];
  washZone: THREE.Box3;
  respawnStar: (s: THREE.Mesh) => void;
  update: (t: number) => void;
  /** Static items the minimap draws. */
  houses: Rect[];
}

export function createWorld(scene: THREE.Scene): World {
  const rand = rng(7);
  const colliders: Collider[] = [];
  const houses: Rect[] = [];
  const boxCollider = (x: number, z: number, w: number, d: number) => {
    const r = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
    colliders.push({ kind: 'box', ...r });
    return r;
  };

  buildTerrain(scene);
  // Static props are collected here and merged into a few meshes at the end.
  const props = new THREE.Group();

  // ---------- Roads ----------
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x5a5f6a, roughness: 0.95 });
  const len = HALF * 2;
  for (const l of ROAD_LINES) {
    for (const vertical of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? ROAD_W : len, vertical ? len : ROAD_W), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(vertical ? l : 0, vertical ? 0.03 : 0.032, vertical ? 0 : l);
      road.receiveShadow = true;
      props.add(road);
    }
  }
  const dashGeo = new THREE.PlaneGeometry(0.35, 2).rotateX(-Math.PI / 2);
  const stopGeo = new THREE.PlaneGeometry(ROAD_W - 0.6, 0.6).rotateX(-Math.PI / 2);
  const marks: [THREE.BufferGeometry, number, number, number][] = [];
  for (const l of ROAD_LINES) {
    for (let p = -HALF + 2; p < HALF; p += 5) {
      if (ROAD_LINES.some((o) => Math.abs(p - o) < ROAD_W / 2 + 2)) continue; // keep intersections clear
      marks.push([dashGeo, l, p, 0], [dashGeo, p, l, Math.PI / 2]);
    }
  }
  for (const a of ROAD_LINES) for (const b of ROAD_LINES) {
    marks.push([stopGeo, a, b - 6.6, 0], [stopGeo, a, b + 6.6, 0], [stopGeo, a - 6.6, b, Math.PI / 2], [stopGeo, a + 6.6, b, Math.PI / 2]);
  }
  const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const geo of [dashGeo, stopGeo]) {
    const list = marks.filter((m) => m[0] === geo);
    const inst = new THREE.InstancedMesh(geo, markMat, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach(([, x, z, rot], i) => inst.setMatrixAt(i, m4.makeRotationY(rot).setPosition(x, 0.05, z)));
    scene.add(inst);
  }
  // Striped barriers where roads leave the world.
  const stripe = textTexture('', '#ffffff', '#000');
  {
    const g = (stripe.image as HTMLCanvasElement).getContext('2d')!;
    g.fillStyle = '#e63946';
    for (let i = -2; i < 10; i++) {
      g.beginPath();
      g.moveTo(i * 64, 128);
      g.lineTo(i * 64 + 32, 128);
      g.lineTo(i * 64 + 96, 0);
      g.lineTo(i * 64 + 64, 0);
      g.fill();
    }
    stripe.needsUpdate = true;
  }
  const barrierMat = new THREE.MeshStandardMaterial({ map: stripe });
  for (const l of ROAD_LINES) {
    for (const s of [-1, 1]) {
      for (const vertical of [true, false]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 2, 1.2, 0.4), barrierMat);
        b.position.set(vertical ? l : s * (HALF + 1), 0.9, vertical ? s * (HALF + 1) : l);
        if (!vertical) b.rotation.y = Math.PI / 2;
        props.add(b);
      }
    }
  }
  const E = HALF + 1.5;
  colliders.push(
    { kind: 'box', minX: -E - 5, maxX: -E, minZ: -E - 5, maxZ: E + 5 },
    { kind: 'box', minX: E, maxX: E + 5, minZ: -E - 5, maxZ: E + 5 },
    { kind: 'box', minX: -E - 5, maxX: E + 5, minZ: -E - 5, maxZ: -E },
    { kind: 'box', minX: -E - 5, maxX: E + 5, minZ: E, maxZ: E + 5 },
  );

  // ---------- Car wash ----------
  const washZ = 30;
  const wash = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a86ff, roughness: 0.5 });
  for (const x of [-ROAD_W / 2 - 0.4, ROAD_W / 2 + 0.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 4), frameMat);
    post.position.set(x, 2.5, 0);
    post.castShadow = true;
    wash.add(post);
    boxCollider(x, washZ, 0.8, 4);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 1.6, 1, 4.4), frameMat);
  top.position.y = 5.3;
  wash.add(top);
  const washSign = signBoard('CAR WASH', '#3a86ff', '#ffffff', 7, 1.6);
  washSign.position.set(0, 6.6, 0);
  wash.add(washSign);
  const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xbde0fe, transparent: true, opacity: 0.85, roughness: 0.1 });
  for (const [x, y, r] of [[-4.2, 7.8, 0.6], [4.3, 7.6, 0.5], [3.4, 8.3, 0.35]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), bubbleMat);
    b.position.set(x, y, 0);
    wash.add(b);
  }
  const brushMat = new THREE.MeshStandardMaterial({ color: 0xff70a6, roughness: 1 });
  const brushes: THREE.Mesh[] = [];
  for (const x of [-3.8, 3.8]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4, 10), brushMat);
    b.position.set(x, 2.4, 0);
    b.userData.keep = true;
    wash.add(b);
    brushes.push(b);
  }
  wash.position.set(0, 0, washZ);
  props.add(wash);
  const washZone = new THREE.Box3(new THREE.Vector3(-3, 0, washZ - 1.5), new THREE.Vector3(3, 5, washZ + 1.5));

  // ---------- Gas station ----------
  {
    const cx = -13, cz = 41;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(GAS.maxX - GAS.minX, 0.1, GAS.maxZ - GAS.minZ), new THREE.MeshStandardMaterial({ color: 0xb8bcc4 }));
    slab.position.set((GAS.minX + GAS.maxX) / 2, 0.05, (GAS.minZ + GAS.maxZ) / 2);
    slab.receiveShadow = true;
    props.add(slab);
    const red = new THREE.MeshStandardMaterial({ color: 0xe63946 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(14, 0.8, 12), white);
    canopy.position.set(cx, 5, cz);
    canopy.castShadow = true;
    props.add(canopy);
    const band = new THREE.Mesh(new THREE.BoxGeometry(14.1, 0.35, 12.1), red);
    band.position.set(cx, 4.75, cz);
    props.add(band);
    for (const [px, pz] of [[-6.5, -5.5], [6.5, -5.5], [-6.5, 5.5], [6.5, 5.5]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 5, 10), white);
      post.position.set(cx + px, 2.5, cz + pz);
      props.add(post);
      colliders.push({ kind: 'circle', x: cx + px, z: cz + pz, r: 0.3 });
    }
    // Pump island with two pumps.
    const island = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 1.4), new THREE.MeshStandardMaterial({ color: 0xffd60a }));
    island.position.set(cx, 0.2, cz);
    props.add(island);
    boxCollider(cx, cz, 7, 1.4);
    for (const dx of [-2, 2]) {
      const pump = new THREE.Group();
      const bodyM = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.8), red);
      bodyM.position.y = 1.3;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.85), new THREE.MeshStandardMaterial({ color: 0x9ef01a, emissive: 0x4a7a00 }));
      screen.position.y = 1.8;
      const hose = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      hose.position.set(0.5, 1.1, 0);
      hose.rotation.z = -Math.PI / 2;
      pump.add(bodyM, screen, hose);
      pump.position.set(cx + dx, 0.3, cz);
      pump.traverse((o) => (o.castShadow = true));
      props.add(pump);
    }
    // Shop.
    const shop = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 14), new THREE.MeshStandardMaterial({ color: 0xf1faee }));
    shop.position.set(-26, 2, cz);
    shop.castShadow = true;
    props.add(shop);
    const shopWin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 10), new THREE.MeshStandardMaterial({ color: 0x8ecae6, metalness: 0.5, roughness: 0.1 }));
    shopWin.position.set(-22.45, 2, cz);
    props.add(shopWin);
    const shopSign = signBoard('SHOP', '#e63946', '#ffffff', 0.2, 1.2);
    (shopSign.geometry as THREE.BoxGeometry).dispose();
    shopSign.geometry = new THREE.BoxGeometry(0.2, 1.2, 5);
    shopSign.position.set(-22.4, 3.5, cz);
    props.add(shopSign);
    boxCollider(-26, cz, 7, 14);
    // Tall roadside sign.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8, 8), white);
    pole.position.set(-7, 4, 53);
    props.add(pole);
    colliders.push({ kind: 'circle', x: -7, z: 53, r: 0.3 });
    const gasSign = signBoard('GAS', '#e63946', '#ffffff', 4, 2);
    gasSign.position.set(-7, 8.5, 53);
    gasSign.rotation.y = Math.PI / 2;
    props.add(gasSign);
  }

  // ---------- Stunt park: concrete pad, cones and signs ----------
  {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(PARK.maxX - PARK.minX, PARK.maxZ - PARK.minZ).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xc9c3b5, roughness: 0.95 }),
    );
    pad.position.set((PARK.minX + PARK.maxX) / 2, 0.02, (PARK.minZ + PARK.maxZ) / 2);
    pad.receiveShadow = true;
    props.add(pad);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6b00 });
    const coneGeo = new THREE.ConeGeometry(0.3, 0.8, 10);
    for (let x = PARK.minX + 1; x <= PARK.maxX - 1; x += 4) {
      for (const z of [PARK.minZ + 0.6, PARK.maxZ - 0.6]) {
        if (x < 18 && z > -10) continue; // leave the entrance open
        const c = new THREE.Mesh(coneGeo, coneMat);
        c.position.set(x, 0.4, z);
        c.castShadow = true;
        props.add(c);
      }
    }
  }
  {
    const s = signBoard('STUNT PARK', '#ff7b00', '#ffffff', 8, 1.8);
    s.position.set(12, 4.5, -6.5);
    props.add(s);
    for (const x of [8.6, 15.4]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x444444 }));
      p.position.set(x, 2.25, -6.5);
      props.add(p);
      colliders.push({ kind: 'circle', x, z: -6.5, r: 0.25 });
    }
    const big = signBoard('BIG JUMP!', '#ff7b00', '#ffffff', 7, 1.6);
    big.position.set(8.5, 4, 85);
    big.rotation.y = Math.PI;
    props.add(big);
    const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4, 8), new THREE.MeshStandardMaterial({ color: 0x444444 }));
    bp.position.set(8.5, 2, 85);
    props.add(bp);
    colliders.push({ kind: 'circle', x: 8.5, z: 85, r: 0.25 });
  }

  // ---------- Farm: barn + silo ----------
  {
    const barnRed = new THREE.MeshStandardMaterial({ color: 0xb22222 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const g = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 8), barnRed);
    walls.position.y = 3;
    const roofShape = new THREE.Shape([new THREE.Vector2(-5.6, 0), new THREE.Vector2(5.6, 0), new THREE.Vector2(0, 3.6)]);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 8.6, bevelEnabled: false }).translate(0, 0, -4.3), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
    roof.position.y = 6;
    const door = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.1), trim);
    door.position.set(0, 2, 4.05);
    const doorIn = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 0.12), barnRed);
    doorIn.position.set(0, 2, 4.06);
    const x1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.8, 0.14), trim);
    x1.position.set(0, 2, 4.07);
    x1.rotation.z = 0.78;
    const x2 = x1.clone();
    x2.rotation.z = -0.78;
    g.add(walls, roof, door, doorIn, x1, x2);
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 10, 20), new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 0.4 }));
    silo.position.set(7.5, 5, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.5 }));
    dome.position.set(7.5, 10, 0);
    g.add(silo, dome);
    g.traverse((o) => (o.castShadow = true));
    g.position.set(BARN.x, terrainHeight(BARN.x, BARN.z), BARN.z);
    props.add(g);
    boxCollider(BARN.x, BARN.z, 10, 8);
    colliders.push({ kind: 'circle', x: BARN.x + 7.5, z: BARN.z, r: 2 });
    // Hay bales.
    const hay = new THREE.MeshStandardMaterial({ color: 0xe9c46a });
    for (const [hx, hz] of [[100, -30], [102, -28], [125, -20], [96, -50]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 14).rotateZ(Math.PI / 2), hay);
      b.position.set(hx, terrainHeight(hx, hz) + 0.8, hz);
      b.castShadow = true;
      props.add(b);
      colliders.push({ kind: 'circle', x: hx, z: hz, r: 0.8 });
    }
  }

  // ---------- Traffic light poles go in first so houses avoid them ----------
  for (const a of ROAD_LINES) for (const b of ROAD_LINES) {
    for (const [dx, dz] of [[-6.8, 6.8], [6.8, -6.8], [6.8, 6.8], [-6.8, -6.8]]) {
      colliders.push({ kind: 'circle', x: a + dx, z: b + dz, r: 0.3 });
    }
  }

  flattenByMaterial(props);
  scene.add(props);

  // ---------- Houses (town only): merged into one vertex-coloured mesh ----------
  const roofGeo = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const houseBatch = new ColorBatch();
  for (let i = 0; i < 320; i++) {
    const w = 5 + rand() * 4, d = 5 + rand() * 4, h = 3 + rand() * 3;
    const x = (rand() * 2 - 1) * (TOWN - 4), z = (rand() * 2 - 1) * (TOWN - 4);
    const r = Math.max(w, d) / 2 + 2;
    if (roadDist(x, z) < ROAD_W / 2 + r || overlapsAny(x, z, r, colliders) || Math.hypot(x, z) < 15) continue;
    if ([PARK, GAS].some((rc) => inRect(rc, x, z, r))) continue;
    houseBatch.add(unitBox, HOUSE_COLORS[Math.floor(rand() * HOUSE_COLORS.length)], { x, y: h / 2, z }, 0, { x: w, y: h, z: d });
    houseBatch.add(roofGeo, ROOF_COLORS[Math.floor(rand() * ROOF_COLORS.length)], { x, y: h + 1.1, z }, 0, { x: w * 0.78, y: 2.2, z: d * 0.78 });
    // Door and two windows on the side facing the nearest road.
    const nx = ROAD_LINES.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    const nz = ROAD_LINES.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
    const sideX = Math.abs(nx - x) < Math.abs(nz - z);
    const face = (along: number, y: number, sw: number, sh: number, color: number) => {
      const pos = sideX
        ? { x: x + Math.sign(nx - x) * (w / 2 + 0.05), y, z: z + along }
        : { x: x + along, y, z: z + Math.sign(nz - z) * (d / 2 + 0.05) };
      houseBatch.add(unitBox, color, pos, sideX ? Math.PI / 2 : 0, { x: sw, y: sh, z: 0.1 });
    };
    face(0, 1, 1.2, 2, 0x8d5524);
    for (const wx of [-1.6, 1.6]) face(wx, Math.min(h - 0.9, 1.8), 0.9, 0.9, 0x8ecae6);
    houses.push(boxCollider(x, z, w, d));
  }
  scene.add(houseBatch.build(new THREE.MeshStandardMaterial({ roughness: 0.85 })));

  // ---------- Trees ----------
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
  const leafGeo = new THREE.IcosahedronGeometry(1.4, 1);
  const pineGeo = new THREE.ConeGeometry(1.3, 3.2, 7);
  const leafMats = [0x2d9b46, 0x3fb950, 0x1f7a3a].map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true }));
  // Trees are drawn as instanced meshes (a few draw calls instead of thousands).
  const treeList: { x: number; z: number; s: number; pine: boolean; leaf: number }[] = [];
  const addTree = (x: number, z: number, s: number, pine: boolean) =>
    treeList.push({ x, z, s, pine, leaf: Math.floor(rand() * leafMats.length) });
  const rampClear = (x: number, z: number) =>
    RAMPS.some((r) => Math.hypot(x - (r.x + r.dx * r.len / 2), z - (r.z + r.dz * r.len / 2)) < r.len + 10);
  for (let i = 0; i < 650; i++) {
    const x = (rand() * 2 - 1) * (HALF - 3), z = (rand() * 2 - 1) * (HALF - 3);
    const country = Math.max(Math.abs(x), Math.abs(z)) > TOWN;
    if (!country && rand() < 0.5) continue;
    if (roadDist(x, z) < ROAD_W / 2 + 1.5 || overlapsAny(x, z, 2, colliders) || Math.hypot(x, z) < 12) continue;
    if ([PARK, GAS, FARM].some((rc) => inRect(rc, x, z, 2)) || rampClear(x, z)) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 4) continue;
    const s = 0.8 + rand() * 0.6;
    addTree(x, z, s, country && rand() < 0.45);
    colliders.push({ kind: 'circle', x, z, r: 0.5 * s });
  }
  for (let a = 0; a < Math.PI * 2; a += 0.022) {
    const k = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const d = HALF + 6 + rand() * 14;
    addTree((Math.cos(a) / k) * d, (Math.sin(a) / k) * d, 1.3 + rand() * 0.9, rand() < 0.6);
  }

  {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const place = (mesh: THREE.InstancedMesh, list: typeof treeList, yOff: number) => {
      list.forEach((t, i) => {
        const yaw = q.setFromAxisAngle(v.set(0, 1, 0), t.x * 7.3 + t.z);
        mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, terrainHeight(t.x, t.z) - 0.1 + yOff * t.s, t.z), yaw, sc.setScalar(t.s)));
      });
      mesh.castShadow = true;
      scene.add(mesh);
    };
    place(new THREE.InstancedMesh(trunkGeo, trunkMat, treeList.length), treeList, 0.8);
    for (const pine of [false, true]) {
      leafMats.forEach((lm, li) => {
        const list = treeList.filter((t) => t.pine === pine && t.leaf === li);
        if (list.length) place(new THREE.InstancedMesh(pine ? pineGeo : leafGeo, lm, list.length), list, pine ? 3 : 2.4);
      });
    }
  }

  // ---------- Stars ----------
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.9 : 0.4;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.2, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }).center();
  const starMat = new THREE.MeshStandardMaterial({ color: 0xffd60a, emissive: 0xffb000, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.3 });
  const stars: THREE.Mesh[] = [];
  const base = new Map<THREE.Mesh, number>();
  const tooClose = (s: THREE.Mesh, x: number, z: number) =>
    stars.some((o) => o !== s && o.visible && Math.hypot(o.position.x - x, o.position.z - z) < 15);
  const respawnStar = (s: THREE.Mesh) => {
    // Sometimes hang a star over a jump so you have to fly to get it.
    if (Math.random() < 0.25) {
      const free = AIR_SPOTS.filter(([x, , z]) => !tooClose(s, x, z));
      if (free.length) {
        const [x, y, z] = free[Math.floor(Math.random() * free.length)];
        s.position.set(x, y, z);
        base.set(s, y);
        s.visible = true;
        return;
      }
    }
    for (let tries = 0; tries < 300; tries++) {
      let x: number, z: number;
      if (Math.random() < 0.6) {
        const l = ROAD_LINES[Math.floor(Math.random() * 3)];
        const p = (Math.random() * 2 - 1) * (HALF - 6);
        [x, z] = Math.random() < 0.5 ? [l, p] : [p, l];
      } else {
        x = (Math.random() * 2 - 1) * (HALF - 6);
        z = (Math.random() * 2 - 1) * (HALF - 6);
      }
      if (overlapsAny(x, z, 2.5, colliders) || washZone.containsPoint(new THREE.Vector3(x, 1, z)) || tooClose(s, x, z)) continue;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r) continue;
      const y = groundHeight(x, z) + 1.4;
      s.position.set(x, y, z);
      base.set(s, y);
      s.visible = true;
      return;
    }
  };
  for (let i = 0; i < STAR_COUNT; i++) {
    const s = new THREE.Mesh(starGeo, starMat);
    s.castShadow = true;
    stars.push(s);
    scene.add(s);
    respawnStar(s);
  }

  return {
    colliders,
    stars,
    washZone,
    respawnStar,
    houses,
    update(t) {
      for (const [i, s] of stars.entries()) {
        s.rotation.y = t * 2 + i;
        s.position.y = (base.get(s) ?? 1.4) + Math.sin(t * 3 + i) * 0.25;
      }
      for (const b of brushes) b.rotation.y = t * 6;
    },
  };
}
