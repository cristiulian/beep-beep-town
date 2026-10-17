import type { Vector3 } from 'three';

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number };

/** Pushes a circle at `pos` out of the collider. Returns true if they overlapped. */
export function resolveCircle(pos: Vector3, r: number, c: Collider): boolean {
  let cx: number, cz: number, minDist: number;
  if (c.kind === 'circle') {
    cx = c.x;
    cz = c.z;
    minDist = r + c.r;
  } else {
    cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    minDist = r;
  }
  let dx = pos.x - cx;
  let dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minDist * minDist) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-4) {
    dx = 1;
    dz = 0;
    d = 1;
  }
  const push = minDist - Math.sqrt(d2);
  pos.x += (dx / d) * push;
  pos.z += (dz / d) * push;
  return true;
}

export function overlapsAny(x: number, z: number, r: number, colliders: Collider[]): boolean {
  for (const c of colliders) {
    if (c.kind === 'circle') {
      const dx = x - c.x, dz = z - c.z, m = r + c.r;
      if (dx * dx + dz * dz < m * m) return true;
    } else if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) {
      return true;
    }
  }
  return false;
}
