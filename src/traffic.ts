import * as THREE from 'three';
import { ROAD_LINES } from './terrain';

export type Axis = 'ns' | 'ew';
export type Light = 'green' | 'yellow' | 'red';

const PERIOD = 18;
const GREEN = 7;
const YELLOW = 2;

interface Intersection {
  x: number;
  z: number;
  offset: number;
  mats: Record<Axis, Record<Light, THREE.MeshStandardMaterial>>;
}

const COLORS: Record<Light, number> = { red: 0xff2a2a, yellow: 0xffc300, green: 0x2bd96b };

export class Traffic {
  intersections: Intersection[] = [];
  private t = 0;

  constructor(scene: THREE.Scene) {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d4148, metalness: 0.5, roughness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x1c1d20 });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 4.4, 8);
    const headGeo = new THREE.BoxGeometry(0.6, 1.6, 0.45);
    const lampGeo = new THREE.CircleGeometry(0.19, 16);
    const visorGeo = new THREE.BoxGeometry(0.5, 0.06, 0.25);

    let k = 0;
    for (const x of ROAD_LINES) {
      for (const z of ROAD_LINES) {
        const mats = {} as Intersection['mats'];
        for (const axis of ['ns', 'ew'] as Axis[]) {
          mats[axis] = {} as Record<Light, THREE.MeshStandardMaterial>;
          for (const l of ['red', 'yellow', 'green'] as Light[]) {
            mats[axis][l] = new THREE.MeshStandardMaterial({ color: COLORS[l], emissive: COLORS[l], emissiveIntensity: 0 });
          }
        }
        // Each pole sits on the far-right corner for one direction of travel and faces it.
        const poles: [number, number, number, Axis][] = [
          [-6.8, 6.8, Math.PI, 'ns'], // seen by cars heading +z
          [6.8, -6.8, 0, 'ns'], // heading -z
          [6.8, 6.8, -Math.PI / 2, 'ew'], // heading +x
          [-6.8, -6.8, Math.PI / 2, 'ew'], // heading -x
        ];
        for (const [dx, dz, rot, axis] of poles) {
          const g = new THREE.Group();
          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.y = 2.2;
          const head = new THREE.Mesh(headGeo, headMat);
          head.position.y = 4.9;
          g.add(pole, head);
          (['red', 'yellow', 'green'] as Light[]).forEach((l, i) => {
            const lamp = new THREE.Mesh(lampGeo, mats[axis][l]);
            lamp.position.set(0, 5.4 - i * 0.5, 0.23);
            const visor = new THREE.Mesh(visorGeo, headMat);
            visor.position.set(0, 5.62 - i * 0.5, 0.33);
            g.add(lamp, visor);
          });
          g.traverse((o) => (o.castShadow = true));
          g.position.set(x + dx, 0, z + dz);
          g.rotation.y = rot;
          scene.add(g);
        }
        this.intersections.push({ x, z, offset: (k * 5.3) % PERIOD, mats });
        k++;
      }
    }
  }

  state(i: Intersection, axis: Axis): Light {
    const p = (this.t + i.offset) % PERIOD;
    // NS gets the first half of the cycle, EW the second.
    const q = axis === 'ns' ? p : (p + PERIOD / 2) % PERIOD;
    if (q < GREEN) return 'green';
    if (q < GREEN + YELLOW) return 'yellow';
    return 'red';
  }

  update(dt: number) {
    this.t += dt;
    for (const i of this.intersections) {
      for (const axis of ['ns', 'ew'] as Axis[]) {
        const s = this.state(i, axis);
        for (const l of ['red', 'yellow', 'green'] as Light[]) {
          i.mats[axis][l].emissiveIntensity = l === s ? 2.2 : 0.02;
          i.mats[axis][l].color.setHex(l === s ? COLORS[l] : 0x333333);
        }
      }
    }
  }
}
