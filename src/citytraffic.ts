import * as THREE from 'three';
import { Collider } from './collide';
import { Axis, Traffic } from './traffic';
import { ROAD_LINES } from './terrain';
import { VEHICLES, VehicleModel } from './vehicles';

/**
 * Town traffic: cars drive in the right-hand lane between the town's crossings. Each picks a
 * destination crossing, plans the shortest way there, and on arrival picks a new one.
 * They stop for red lights, keep a gap to whatever is ahead (other cars or the player),
 * slow down for turns, and never block forever.
 */

type P = { x: number; z: number };
const LANE = 2.5; // lane centre from the road centre line
const EDGE = 7.2; // where the straight part ends, just behind the stop line (6.6)
const SPACING = 60;
const NODES: P[] = ROAD_LINES.flatMap((x) => ROAD_LINES.map((z) => ({ x, z })));
const same = (a: P, b: P) => a.x === b.x && a.z === b.z;
const neighbours = (n: P) =>
  NODES.filter((o) => (o.x === n.x && Math.abs(o.z - n.z) === SPACING) || (o.z === n.z && Math.abs(o.x - n.x) === SPACING));

/** Breadth-first route over the crossing grid, optionally not starting back towards `avoid`. */
function route(from: P, to: P, avoid?: P): P[] | null {
  const key = (p: P) => `${p.x},${p.z}`;
  const prev = new Map<string, P | null>([[key(from), null]]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    if (same(n, to)) break;
    const next = neighbours(n).sort(() => Math.random() - 0.5);
    for (const m of next) {
      if (prev.has(key(m)) || (avoid && same(n, from) && same(m, avoid))) continue;
      prev.set(key(m), n);
      queue.push(m);
    }
  }
  if (!prev.has(key(to))) return null;
  const out: P[] = [];
  for (let p: P | null | undefined = to; p; p = prev.get(key(p))) out.unshift(p);
  return out;
}

const dir = (a: P, b: P) => {
  const l = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
};
// Right-hand side of a direction of travel.
const right = (d: P) => ({ x: -d.z, z: d.x });

interface Hop {
  pts: P[];
  cum: number[]; // distance along the hop at each point
  length: number;
  straight: number; // distance where the straight part ends and the crossing begins
  stopAt: number; // where the car's centre stops for a red light
  turn: boolean;
  kind: 'straight' | 'left' | 'right';
  d: P; // direction of approach
  at: P; // the crossing at the end of the straight
  axis: Axis;
}

function makeHop(a: P, b: P, c: P, halfLen: number): Hop {
  const d1 = dir(a, b), r1 = right(d1), d2 = dir(b, c), r2 = right(d2);
  const start = { x: a.x + d1.x * EDGE + r1.x * LANE, z: a.z + d1.z * EDGE + r1.z * LANE };
  const end = { x: b.x - d1.x * EDGE + r1.x * LANE, z: b.z - d1.z * EDGE + r1.z * LANE };
  const exit = { x: b.x + d2.x * EDGE + r2.x * LANE, z: b.z + d2.z * EDGE + r2.z * LANE };
  const turn = Math.abs(d1.x * d2.x + d1.z * d2.z) < 0.5;
  // Sign of the cross product tells right turns from left ones.
  const kind = !turn ? 'straight' : d1.x * d2.z - d1.z * d2.x > 0 ? 'right' : 'left';
  const pts: P[] = [start, end];
  if (turn) {
    // Bezier through where the two lane lines cross, for a smooth corner.
    const t = (r2.x * d1.x + r2.z * d1.z) * LANE;
    const ctrl = { x: b.x + r1.x * LANE + d1.x * t, z: b.z + r1.z * LANE + d1.z * t };
    for (let i = 1; i <= 10; i++) {
      const s = i / 10, u = 1 - s;
      pts.push({ x: u * u * end.x + 2 * u * s * ctrl.x + s * s * exit.x, z: u * u * end.z + 2 * u * s * ctrl.z + s * s * exit.z });
    }
  } else pts.push(exit);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return {
    pts, cum, length: cum[cum.length - 1], straight: cum[1], stopAt: cum[1] - halfLen - 0.3, turn, kind, d: d1,
    at: b, axis: Math.abs(d1.x) > Math.abs(d1.z) ? 'ew' : 'ns',
  };
}

function pointAt(h: Hop, s: number): P {
  s = Math.max(0, Math.min(h.length, s));
  let i = 1;
  while (i < h.cum.length - 1 && h.cum[i] < s) i++;
  const t = (s - h.cum[i - 1]) / (h.cum[i] - h.cum[i - 1] || 1);
  return { x: h.pts[i - 1].x + (h.pts[i].x - h.pts[i - 1].x) * t, z: h.pts[i - 1].z + (h.pts[i].z - h.pts[i - 1].z) * t };
}

interface Npc {
  model: VehicleModel;
  obj: THREE.Group;
  from: P;
  to: P;
  plan: P[]; // crossings still to visit after `to`
  hop: Hop;
  s: number;
  speed: number;
  cruise: number;
  heading: number;
  halfLen: number;
  stillFor: number;
  blockedByPlayer: number;
  /** Has been let into the crossing ahead (holds it until through). */
  claimed: boolean;
  /** Order of entering the crossing: whoever got in first goes first. */
  claimedAt: number;
  /** Why the car is slowing right now (for debugging jams). */
  reason: string;
  /** Seconds since the player was last in front of us in our lane. */
  playerAwayFor: number;
  angryCooldown: number;
  /** Seconds left of flashing the headlights. */
  flash: number;
  headlights: THREE.MeshStandardMaterial;
  glows: THREE.Sprite[];
  colliders: Extract<Collider, { kind: 'circle' }>[];
}

export class CityTraffic {
  cars: Npc[] = [];
  /** Running totals, used by the automated tests to check the rules are kept. */
  private claimSeq = 0;
  stats = { redLightsRun: 0, overlaps: 0, tripsDone: 0, metres: 0, longestWait: 0, cutOffs: 0 };
  debug: unknown[] | null = null;
  /** Called when a car has been stuck behind the player for a while. */
  onHonk: (pos: THREE.Vector3) => void = () => {};
  /** Called when the player cuts in front of a car so it has to brake. */
  onCutOff: (car: { name: string; pos: THREE.Vector3 }) => void = () => {};

  constructor(scene: THREE.Scene, private lights: Traffic, colliders: Collider[], count = 10) {
    // A mix that always includes the fun ones.
    const lineup = ['taxi', 'bus', 'police', 'truck', 'sports', 'pickup', 'van', 'hatch', 'sedan', 'hatch', 'sedan', 'van'];
    const used = new Map<string, number>();
    for (let i = 0; i < count; i++) {
      const model = VEHICLES.find((v) => v.id === lineup[i % lineup.length])!;
      const color = model.colors[(used.get(model.id) ?? 0) % model.colors.length];
      used.set(model.id, (used.get(model.id) ?? 0) + 1);
      const obj = model.build(color);
      scene.add(obj);
      const halfLen = model.length / 2;
      // Collision circles spaced along the body, so long vehicles are solid end to end.
      const n = Math.max(2, Math.ceil(model.length / 2.4));
      const circles = Array.from({ length: n }, () => ({ kind: 'circle' as const, x: 0, z: 0, r: model.width / 2 + 0.1 }));
      colliders.push(...circles);
      const npc = this.spawn(model, obj, halfLen, circles);
      if (npc) this.cars.push(npc);
    }
  }

  private spawn(model: VehicleModel, obj: THREE.Group, halfLen: number, circles: Npc['colliders']): Npc | null {
    for (let tries = 0; tries < 50; tries++) {
      const from = NODES[Math.floor(Math.random() * NODES.length)];
      const nb = neighbours(from);
      const to = nb[Math.floor(Math.random() * nb.length)];
      const plan = this.newPlan(to, from);
      if (!plan) continue;
      const hop = makeHop(from, to, plan[0], halfLen);
      const s = 8 + Math.random() * (hop.straight - 30);
      const p = pointAt(hop, s);
      // Keep cars apart at the start, and away from the player's starting crossing.
      const clash = this.cars.some((c) => Math.hypot(c.obj.position.x - p.x, c.obj.position.z - p.z) < 14) || Math.hypot(p.x, p.z) < 14;
      if (clash) continue;
      const d = dir(from, to);
      obj.position.set(p.x, 0, p.z);
      return {
        model, obj, from, to, plan, hop, s, speed: 0, cruise: 8.5 + Math.random() * 2.5 - (model.id === 'bus' || model.id === 'truck' ? 1.5 : 0),
        heading: Math.atan2(d.x, d.z), halfLen, stillFor: 0, blockedByPlayer: 0, claimed: false, claimedAt: 0, colliders: circles,
        reason: '', playerAwayFor: 10, angryCooldown: 0, flash: 0, headlights: obj.userData.headlights, glows: this.addGlows(obj, model),
      };
    }
    return null;
  }

  private claim(c: Npc) {
    c.claimed = true;
    c.claimedAt = ++this.claimSeq;
  }

  /** Two soft glows in front of the headlights, shown while flashing. */
  private addGlows(obj: THREE.Group, model: VehicleModel) {
    return [-1, 1].map((side) => {
      const g = new THREE.Sprite(this.glowMat);
      g.scale.setScalar(2.4);
      g.position.set(side * (model.width / 2 - 0.3), model.headlightY, model.length / 2 + 0.3);
      g.visible = false;
      obj.add(g);
      return g;
    });
  }

  private glowMat = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,240,1)');
    grad.addColorStop(0.3, 'rgba(255,250,210,0.7)');
    grad.addColorStop(1, 'rgba(255,250,210,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  })();

  /** True when every car already let into this crossing is on a path that doesn't clash with ours. */
  private crossingClear(c: Npc) {
    const h = c.hop;
    for (const o of this.cars) {
      if (o === c || !o.claimed || !same(o.hop.at, h.at)) continue;
      const dot = h.d.x * o.hop.d.x + h.d.z * o.hop.d.z;
      if (dot > 0.5) continue; // same direction: the following gap handles it
      if (dot < -0.5 && h.kind !== 'left' && o.hop.kind !== 'left') continue; // oncoming, neither turning left
      return false;
    }
    return true;
  }

  /** Pick a new destination and the crossings to get there (not turning straight back). */
  private newPlan(at: P, cameFrom: P): P[] | null {
    for (let i = 0; i < 10; i++) {
      const dest = NODES[Math.floor(Math.random() * NODES.length)];
      if (same(dest, at)) continue;
      const r = route(at, dest, cameFrom);
      if (r && r.length > 1) return r.slice(1);
    }
    // Dead end (shouldn't happen on a grid): carry straight on or turn.
    const out = neighbours(at).filter((n) => !same(n, cameFrom));
    return out.length ? [out[0]] : null;
  }

  update(dt: number, player: THREE.Vector3, playerSpeed = 0, playerHeading = 0, playerHalfLen = 2.3) {
    for (const c of this.cars) {
      const h = c.hop;
      let target = h.turn && c.s > h.straight - 4 ? Math.min(c.cruise, 5.5) : c.cruise;
      c.reason = '';

      // At the line: stop for red (and yellow if there's room), and only enter the crossing
      // when nobody already in it is on a clashing path.
      if (!c.claimed) {
        const toLine = h.stopAt - c.s;
        if (toLine < -2.5 || (toLine < -0.3 && this.crossingClear(c))) this.claim(c); // over the line: carry on through
        else if (toLine < -0.3) {
          target = 0; // rolled over the line but the crossing is busy: wait
          c.reason = 'waiting for the crossing to clear';
        } else {
          const light = this.lights.state(this.lights.intersections.find((i) => i.x === h.at.x && i.z === h.at.z)!, h.axis);
          const canStop = toLine > (c.speed * c.speed) / (2 * 8) - 0.5;
          let stop = light === 'red' || (light === 'yellow' && canStop);
          if (!stop && toLine < 4) {
            if (this.crossingClear(c)) this.claim(c);
            else stop = true;
          }
          if (stop) {
            target = Math.min(target, toLine < 0.2 ? 0 : Math.sqrt(2 * 6 * toLine));
            c.reason = light === 'green' ? 'waiting for the crossing to clear' : `light ${light}`;
          }
        }
      }

      // Keep a gap to anything ahead in our lane: other cars and the player.
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      const ahead = (p: { x: number; z: number }, half: number) => {
        const rx = p.x - c.obj.position.x, rz = p.z - c.obj.position.z;
        const along = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
        if (along <= 0 || along > 26 || side > 2.3) return Infinity;
        return along - c.halfLen - half - 1.8;
      };
      let carGap = Infinity;
      for (const o of this.cars) {
        if (o === c) continue;
        if (c.claimed && same(o.hop.at, h.at)) {
          // Inside a crossing: cars still behind their stop lines aren't in our way,
          // and cars that got in after us wait for us (so two cars can never wait on each other).
          if (!o.claimed && o.hop.stopAt - o.s > -0.5) continue;
          if (o.claimed && o.claimedAt > c.claimedAt) continue;
        }
        const gp = ahead(o.obj.position, o.halfLen);
        if (gp < carGap) {
          carGap = gp;
          if (gp < 3) c.reason = `behind ${o.model.id}`;
        }
      }
      // The player's vehicle can be long (bus, truck): measure to its nearest part, not its middle.
      const reach = Math.max(0, playerHalfLen - 1.2);
      const px = Math.sin(playerHeading) * reach, pz = Math.cos(playerHeading) * reach;
      const playerGap = Math.min(
        ahead({ x: player.x + px, z: player.z + pz }, 1.2),
        ahead(player, 1.2),
        ahead({ x: player.x - px, z: player.z - pz }, 1.2),
      );

      // Cut off: the player suddenly appears close in front while we're moving.
      // (Catching up with the player normally doesn't count: they were already in front.)
      c.angryCooldown -= dt;
      if (playerGap < Infinity) {
        const tooClose = playerGap < Math.max(5, c.speed * 1.0);
        if (c.playerAwayFor > 0.6 && tooClose && c.speed > 4 && Math.abs(playerSpeed) > 2 && c.angryCooldown <= 0) {
          c.flash = 1.4;
          c.angryCooldown = 6;
          this.stats.cutOffs++;
          this.onCutOff({ name: c.model.name, pos: c.obj.position });
        }
        c.playerAwayFor = 0;
      } else c.playerAwayFor += dt;
      const gap = Math.min(carGap, playerGap);
      if (gap < Infinity) target = Math.min(target, Math.max(0, gap * 1.1));

      // How long this car has been standing still (the tests check nobody is stuck for good).
      c.stillFor = c.speed < 0.1 ? c.stillFor + dt : 0;
      this.stats.longestWait = Math.max(this.stats.longestWait, c.stillFor);
      c.blockedByPlayer = playerGap < 4 && c.speed < 0.3 ? c.blockedByPlayer + dt : Math.min(c.blockedByPlayer, 0);
      if (c.blockedByPlayer > 2.5) {
        this.onHonk(c.obj.position);
        c.blockedByPlayer = -4; // wait a bit before honking again
      }

      c.speed += Math.max(-10 * dt, Math.min(4 * dt, target - c.speed));
      c.speed = Math.max(0, c.speed);
      const before = c.s;
      c.s += c.speed * dt;
      this.stats.metres += c.speed * dt;
      const line = h.stopAt + 0.6;
      if (before <= line && c.s > line && this.lights.state(this.lights.intersections.find((i) => i.x === h.at.x && i.z === h.at.z)!, h.axis) === 'red') {
        this.stats.redLightsRun++;
      }

      // Finished this hop: move on to the next crossing, planning a new trip when needed.
      if (c.s >= h.length) {
        c.s -= h.length;
        if (!c.plan.length) c.plan = this.newPlan(c.to, c.from) ?? [c.from];
        const next = c.plan.shift()!;
        c.from = c.to;
        c.to = next;
        if (!c.plan.length) {
          // Arrived at this trip's destination crossing: pick the next trip.
          this.stats.tripsDone++;
          c.plan = this.newPlan(c.to, c.from) ?? [c.from];
        }
        c.hop = makeHop(c.from, c.to, c.plan[0], c.halfLen);
        c.claimed = false;
      }

      const p = pointAt(c.hop, c.s);
      const q = pointAt(c.hop, c.s + 1.5);
      const want = Math.atan2(q.x - p.x, q.z - p.z);
      let dh = want - c.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      c.heading += dh * Math.min(1, dt * 8);
      c.obj.position.set(p.x, 0, p.z);
      c.obj.rotation.y = c.heading;

      // Flash the headlights: three quick blinks.
      if (c.flash > 0) {
        c.flash -= dt;
        const on = c.flash > 0 && Math.floor(c.flash * 5) % 2 === 0;
        c.headlights.emissiveIntensity = on ? 4 : 0.1;
        for (const g of c.glows) g.visible = on;
      } else if (c.glows[0].visible || c.headlights.emissiveIntensity !== 0.7) {
        c.headlights.emissiveIntensity = 0.7;
        for (const g of c.glows) g.visible = false;
      }
      const n = c.colliders.length;
      c.colliders.forEach((col, i) => {
        const off = n === 1 ? 0 : -c.halfLen + col.r + ((2 * c.halfLen - 2 * col.r) * i) / (n - 1);
        col.x = p.x + Math.sin(c.heading) * off;
        col.z = p.z + Math.cos(c.heading) * off;
      });
    }
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const hit = this.cars[i].colliders.some((a) =>
          this.cars[j].colliders.some((b) => Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r - 0.5),
        );
        if (hit) {
          this.stats.overlaps++;
          if (this.debug) {
            const d = (c: Npc) => ({ id: c.model.id, pos: [Math.round(c.obj.position.x), Math.round(c.obj.position.z)], s: Math.round(c.s), straight: Math.round(c.hop.straight), turn: c.hop.turn, v: +c.speed.toFixed(1) });
            this.debug.push([d(this.cars[i]), d(this.cars[j])]);
          }
        }
      }
    }
  }
}
