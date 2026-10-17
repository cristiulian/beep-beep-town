import * as THREE from 'three';
import { ROAD_LINES } from './terrain';
import { flattenByMaterial } from './merge';

export type Axis = 'ns' | 'ew';
export type Light = 'green' | 'yellow' | 'red';

const PERIOD = 18;
const GREEN = 7;
const YELLOW = 2;
const LIGHTS: Light[] = ['red', 'yellow', 'green'];

interface Intersection {
  x: number;
  z: number;
  offset: number;
  /** Instance indices of each lamp, per direction and colour. */
  lamps: Record<Axis, Record<Light, number[]>>;
}

const ON: Record<Light, THREE.Color> = {
  red: new THREE.Color(0xff2a2a),
  yellow: new THREE.Color(0xffc300),
  green: new THREE.Color(0x2bd96b),
};
const OFF = new THREE.Color(0x2a2a2a);

export class Traffic {
  intersections: Intersection[] = [];
  private t = 0;
  private lampMesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d4148, metalness: 0.5, roughness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x1c1d20 });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 4.4, 8);
    const headGeo = new THREE.BoxGeometry(0.6, 1.6, 0.45);
    const visorGeo = new THREE.BoxGeometry(0.5, 0.06, 0.25);

    const poles = new THREE.Group();
    const lampMatrices: THREE.Matrix4[] = [];
    let k = 0;
    for (const x of ROAD_LINES) {
      for (const z of ROAD_LINES) {
        const lamps = { ns: { red: [], yellow: [], green: [] }, ew: { red: [], yellow: [], green: [] } } as Intersection['lamps'];
        // Each pole sits on the far-right corner for one direction of travel and faces it.
        const corners: [number, number, number, Axis][] = [
          [-6.8, 6.8, Math.PI, 'ns'], // seen by cars heading +z
          [6.8, -6.8, 0, 'ns'], // heading -z
          [6.8, 6.8, -Math.PI / 2, 'ew'], // heading +x
          [-6.8, -6.8, Math.PI / 2, 'ew'], // heading -x
        ];
        for (const [dx, dz, rot, axis] of corners) {
          const g = new THREE.Group();
          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.y = 2.2;
          const head = new THREE.Mesh(headGeo, headMat);
          head.position.y = 4.9;
          g.add(pole, head);
          g.position.set(x + dx, 0, z + dz);
          g.rotation.y = rot;
          LIGHTS.forEach((l, i) => {
            const visor = new THREE.Mesh(visorGeo, headMat);
            visor.position.set(0, 5.62 - i * 0.5, 0.33);
            g.add(visor);
            g.updateMatrixWorld();
            const lampLocal = new THREE.Matrix4().makeTranslation(0, 5.4 - i * 0.5, 0.23);
            lamps[axis][l].push(lampMatrices.length);
            lampMatrices.push(g.matrixWorld.clone().multiply(lampLocal));
          });
          poles.add(g);
        }
        this.intersections.push({ x, z, offset: (k * 5.3) % PERIOD, lamps });
        k++;
      }
    }
    flattenByMaterial(poles);
    scene.add(poles);

    this.lampMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.19, 16), new THREE.MeshBasicMaterial(), lampMatrices.length);
    lampMatrices.forEach((m, i) => {
      this.lampMesh.setMatrixAt(i, m);
      this.lampMesh.setColorAt(i, OFF);
    });
    scene.add(this.lampMesh);
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
        for (const l of LIGHTS) for (const idx of i.lamps[axis][l]) this.lampMesh.setColorAt(idx, l === s ? ON[l] : OFF);
      }
    }
    this.lampMesh.instanceColor!.needsUpdate = true;
  }
}
