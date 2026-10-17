import * as THREE from 'three';
import { Collider, overlapsAny } from './collide';

export const HALF = 90;
const ROAD_LINES = [-60, 0, 60];
const ROAD_W = 10;
const STAR_COUNT = 12;

/** Small seeded RNG so the town looks the same every visit. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const HOUSE_COLORS = [0xffd166, 0x8ecae6, 0xf4a261, 0xb5e48c, 0xffafcc, 0xcdb4db, 0xfefae0];
const ROOF_COLORS = [0xd62828, 0x3a86ff, 0x6a4c93, 0x2a9d8f, 0xe76f51];

function onRoad(x: number, z: number, margin: number) {
  const h = ROAD_W / 2 + margin;
  return ROAD_LINES.some((l) => Math.abs(x - l) < h || Math.abs(z - l) < h);
}

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.9 : 0.4;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const fn = i === 0 ? 'moveTo' : 'lineTo';
    s[fn](Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
  g.center();
  return g;
}

export interface World {
  colliders: Collider[];
  stars: THREE.Mesh[];
  washZone: THREE.Box3;
  respawnStar: (s: THREE.Mesh) => void;
  update: (t: number) => void;
}

export function createWorld(scene: THREE.Scene): World {
  const rand = rng(7);
  const colliders: Collider[] = [];

  // Grass.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 80, HALF * 2 + 80),
    new THREE.MeshStandardMaterial({ color: 0x7ccf5a, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Roads with dashed centre lines.
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x5a5f6a, roughness: 0.95 });
  const len = HALF * 2;
  for (const l of ROAD_LINES) {
    for (const vertical of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? ROAD_W : len, vertical ? len : ROAD_W), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(vertical ? l : 0, vertical ? 0.01 : 0.012, vertical ? 0 : l);
      road.receiveShadow = true;
      scene.add(road);
    }
  }
  const dashGeo = new THREE.PlaneGeometry(0.35, 2).rotateX(-Math.PI / 2);
  const dashPositions: [number, number, boolean][] = [];
  for (const l of ROAD_LINES) {
    for (let p = -HALF + 2; p < HALF; p += 5) {
      if (ROAD_LINES.some((o) => Math.abs(p - o) < ROAD_W / 2 + 1)) continue; // keep intersections clear
      dashPositions.push([l, p, true], [p, l, false]);
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), dashPositions.length);
  const m4 = new THREE.Matrix4();
  dashPositions.forEach(([a, b, vertical], i) => {
    m4.makeRotationY(vertical ? 0 : Math.PI / 2).setPosition(a, 0.03, b);
    dashes.setMatrixAt(i, m4);
  });
  scene.add(dashes);

  // Car wash arch across the road just ahead of the start.
  const washZ = 30;
  const wash = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a86ff, roughness: 0.5 });
  const postGeo = new THREE.BoxGeometry(0.8, 5, 4);
  for (const x of [-ROAD_W / 2 - 0.4, ROAD_W / 2 + 0.4]) {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(x, 2.5, 0);
    post.castShadow = true;
    wash.add(post);
    colliders.push({ kind: 'box', minX: x - 0.4, maxX: x + 0.4, minZ: washZ - 2, maxZ: washZ + 2 });
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 1.6, 1, 4.4), frameMat);
  top.position.y = 5.3;
  top.castShadow = true;
  wash.add(top);
  // Soap bubbles on top.
  const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xbde0fe, transparent: true, opacity: 0.85, roughness: 0.1 });
  for (const [x, y, r] of [[-1.8, 6.2, 0.7], [0, 6.6, 1], [1.7, 6.2, 0.6], [0.9, 7.6, 0.45]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), bubbleMat);
    b.position.set(x, y, 0);
    wash.add(b);
  }
  const brushMat = new THREE.MeshStandardMaterial({ color: 0xff70a6, roughness: 1 });
  const brushes: THREE.Mesh[] = [];
  for (const x of [-3.8, 3.8]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4, 10), brushMat);
    b.position.set(x, 2.4, 0);
    wash.add(b);
    brushes.push(b);
  }
  wash.position.set(0, 0, washZ);
  scene.add(wash);
  const washZone = new THREE.Box3(new THREE.Vector3(-3, 0, washZ - 1.5), new THREE.Vector3(3, 5, washZ + 1.5));

  // Houses in each block.
  const roofGeo = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x8d5524 });
  for (let i = 0; i < 260; i++) {
    const w = 5 + rand() * 4, d = 5 + rand() * 4, h = 3 + rand() * 3;
    const x = (rand() * 2 - 1) * (HALF - 8), z = (rand() * 2 - 1) * (HALF - 8);
    const r = Math.max(w, d) / 2 + 2;
    if (onRoad(x, z, r) || overlapsAny(x, z, r, colliders) || Math.hypot(x, z) < 15) continue;
    const house = new THREE.Group();
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: HOUSE_COLORS[Math.floor(rand() * HOUSE_COLORS.length)] }),
    );
    walls.position.y = h / 2;
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: ROOF_COLORS[Math.floor(rand() * ROOF_COLORS.length)] }));
    roof.scale.set(w * 0.78, 2.2, d * 0.78);
    roof.position.y = h + 1.1;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.1), doorMat);
    // Face the door towards the nearest road.
    const nearestX = ROAD_LINES.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    const nearestZ = ROAD_LINES.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
    if (Math.abs(nearestX - x) < Math.abs(nearestZ - z)) {
      door.rotation.y = Math.PI / 2;
      door.position.set(Math.sign(nearestX - x) * (w / 2 + 0.05), 1, 0);
    } else {
      door.position.set(0, 1, Math.sign(nearestZ - z) * (d / 2 + 0.05));
    }
    for (const m of [walls, roof]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    house.add(walls, roof, door);
    house.position.set(x, 0, z);
    scene.add(house);
    colliders.push({ kind: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  // Trees: scattered in blocks plus a thick ring around the edge.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
  const leafGeo = new THREE.IcosahedronGeometry(1.4, 1);
  const leafMats = [0x2d9b46, 0x3fb950, 0x1f7a3a].map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true }));
  const addTree = (x: number, z: number, s: number) => {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.8;
    const leaves = new THREE.Mesh(leafGeo, leafMats[Math.floor(rand() * leafMats.length)]);
    leaves.position.y = 2.4;
    trunk.castShadow = leaves.castShadow = true;
    t.add(trunk, leaves);
    t.scale.setScalar(s);
    t.position.set(x, 0, z);
    scene.add(t);
  };
  for (let i = 0; i < 400; i++) {
    const x = (rand() * 2 - 1) * (HALF - 3), z = (rand() * 2 - 1) * (HALF - 3);
    if (onRoad(x, z, 1.5) || overlapsAny(x, z, 2, colliders) || Math.hypot(x, z) < 12) continue;
    const s = 0.8 + rand() * 0.6;
    addTree(x, z, s);
    colliders.push({ kind: 'circle', x, z, r: 0.5 * s });
  }
  for (let a = 0; a < Math.PI * 2; a += 0.035) {
    const k = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const d = HALF + 4 + rand() * 8;
    addTree((Math.cos(a) / k) * d, (Math.sin(a) / k) * d, 1.2 + rand() * 0.8);
  }
  // Invisible edge walls.
  const E = HALF + 2;
  colliders.push(
    { kind: 'box', minX: -E - 5, maxX: -E, minZ: -E - 5, maxZ: E + 5 },
    { kind: 'box', minX: E, maxX: E + 5, minZ: -E - 5, maxZ: E + 5 },
    { kind: 'box', minX: -E - 5, maxX: E + 5, minZ: -E - 5, maxZ: -E },
    { kind: 'box', minX: -E - 5, maxX: E + 5, minZ: E, maxZ: E + 5 },
  );

  // Stars to collect, mostly placed on roads so kids can follow them.
  const starGeo = starGeometry();
  const starMat = new THREE.MeshStandardMaterial({ color: 0xffd60a, emissive: 0xffb000, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.3 });
  const stars: THREE.Mesh[] = [];
  const respawnStar = (s: THREE.Mesh) => {
    for (let tries = 0; tries < 200; tries++) {
      let x: number, z: number;
      if (Math.random() < 0.75) {
        const l = ROAD_LINES[Math.floor(Math.random() * 3)];
        const p = (Math.random() * 2 - 1) * (HALF - 5);
        [x, z] = Math.random() < 0.5 ? [l, p] : [p, l];
      } else {
        x = (Math.random() * 2 - 1) * (HALF - 5);
        z = (Math.random() * 2 - 1) * (HALF - 5);
      }
      if (overlapsAny(x, z, 2, colliders) || washZone.containsPoint(new THREE.Vector3(x, 1, z))) continue;
      if (stars.some((o) => o !== s && o.visible && o.position.distanceTo(new THREE.Vector3(x, 1.4, z)) < 12)) continue;
      s.position.set(x, 1.4, z);
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
    update(t) {
      for (const [i, s] of stars.entries()) {
        s.rotation.y = t * 2 + i;
        s.position.y = 1.4 + Math.sin(t * 3 + i) * 0.25;
      }
      for (const b of brushes) b.rotation.y = t * 6;
    },
  };
}
