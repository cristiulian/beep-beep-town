import * as THREE from 'three';
import { HALF, ROAD_LINES, groundHeight } from './terrain';

type P = { x: number; z: number };

/**
 * Shortest route along the road grid from `from` to `to` (which must lie on a road).
 * Off-road starts first cut straight to the nearest road.
 */
export function roadRoute(from: P, to: P): P[] {
  // Snap the start onto the nearest road.
  let start: P = from, best = Infinity;
  for (const l of ROAD_LINES) {
    const cz = THREE.MathUtils.clamp(from.z, -HALF, HALF), cx = THREE.MathUtils.clamp(from.x, -HALF, HALF);
    if (Math.abs(from.x - l) < best) { best = Math.abs(from.x - l); start = { x: l, z: cz }; }
    if (Math.abs(from.z - l) < best) { best = Math.abs(from.z - l); start = { x: cx, z: l }; }
  }

  // Nodes: every crossing, every road end, plus start and goal.
  const nodes: P[] = [start, to];
  for (const a of ROAD_LINES) {
    nodes.push({ x: a, z: -HALF }, { x: a, z: HALF }, { x: -HALF, z: a }, { x: HALF, z: a });
    for (const b of ROAD_LINES) nodes.push({ x: a, z: b });
  }
  // Edges join neighbouring nodes along each road.
  const adj: [number, number][][] = nodes.map(() => []);
  for (const l of ROAD_LINES) {
    for (const vertical of [true, false]) {
      const on = nodes
        .map((n, i) => ({ i, t: vertical ? n.z : n.x, ok: Math.abs((vertical ? n.x : n.z) - l) < 0.01 }))
        .filter((n) => n.ok)
        .sort((a, b) => a.t - b.t);
      for (let k = 1; k < on.length; k++) {
        const d = on[k].t - on[k - 1].t;
        adj[on[k].i].push([on[k - 1].i, d]);
        adj[on[k - 1].i].push([on[k].i, d]);
      }
    }
  }
  // Dijkstra (the graph is tiny, so a plain array scan is fine).
  const dist = nodes.map(() => Infinity);
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity || u === 1) break;
    done[u] = true;
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  const path: P[] = [];
  for (let i = 1; i >= 0; i = prev[i]) path.unshift(nodes[i]);
  if (best > 0.5) path.unshift(from);
  return path.filter((p, i) => i === 0 || Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z) > 0.01);
}

/** Round off the corners so the line sweeps through turns like a racing line. */
function fillet(path: P[], r = 5): P[] {
  if (path.length < 3) return path;
  const out: P[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1], v = path[i], b = path[i + 1];
    const la = Math.hypot(a.x - v.x, a.z - v.z), lb = Math.hypot(b.x - v.x, b.z - v.z);
    const ra = Math.min(r, la / 2), rb = Math.min(r, lb / 2);
    const p1 = { x: v.x + ((a.x - v.x) / la) * ra, z: v.z + ((a.z - v.z) / la) * ra };
    const p2 = { x: v.x + ((b.x - v.x) / lb) * rb, z: v.z + ((b.z - v.z) / lb) * rb };
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, u = 1 - t;
      out.push({ x: u * u * p1.x + 2 * u * t * v.x + t * t * p2.x, z: u * u * p1.z + 2 * u * t * v.z + t * t * p2.z });
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

const MAX = 700;
const STEP = 1.5;
const WIDTH = 2.6;

/** Forza-style animated chevron ribbon drawn on the ground. */
export class GuideLine {
  readonly mesh: THREE.Mesh;
  private tex: THREE.CanvasTexture;
  private pos = new Float32Array(MAX * 2 * 3);
  private uv = new Float32Array(MAX * 2 * 2);
  private col = new Float32Array(MAX * 2 * 4);
  private geo = new THREE.BufferGeometry();
  /** Route length in metres, from the car to the end. */
  length = 0;
  /** The last route, for the minimap. */
  route: P[] = [];

  constructor(scene: THREE.Scene) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(40, 170, 255, 0.55)';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 11;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(12, 46);
    g.lineTo(32, 22);
    g.lineTo(52, 46);
    g.stroke();
    this.tex = new THREE.CanvasTexture(c);
    this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.colorSpace = THREE.SRGBColorSpace;

    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), HALF * 2);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({ map: this.tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Lay the ribbon along `path` (starting at the car). */
  set(path: P[], dt: number) {
    this.route = path;
    const pts = fillet(path);
    // Resample evenly.
    const samples: P[] = [];
    let carry = 0;
    for (let i = 1; i < pts.length && samples.length < MAX; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      let d = carry;
      while (d < len && samples.length < MAX) {
        const t = d / len;
        samples.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        d += STEP;
      }
      carry = d - len;
    }
    samples.push(pts[pts.length - 1]);
    const n = Math.min(samples.length, MAX);
    this.length = (n - 1) * STEP;
    for (let i = 0; i < n; i++) {
      const p = samples[i];
      const a = samples[Math.max(0, i - 1)], b = samples[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const nx = -tz * (WIDTH / 2), nz = tx * (WIDTH / 2);
      const y = groundHeight(p.x, p.z) + 0.14;
      this.pos.set([p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz], i * 6);
      const v = (i * STEP) / 3; // one chevron every 3 m
      this.uv.set([0, v, 1, v], i * 4);
      // Fade in just ahead of the car and out at the very end.
      const d = i * STEP;
      const alpha = Math.min(1, Math.max(0, (d - 3) / 6)) * Math.min(1, (this.length - d) / 4 + 0.25);
      this.col.set([1, 1, 1, alpha, 1, 1, 1, alpha], i * 8);
    }
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
    for (const name of ['position', 'uv', 'color']) this.geo.attributes[name].needsUpdate = true;
    this.tex.offset.y -= dt * 1.6; // chevrons flow towards the goal
  }
}
