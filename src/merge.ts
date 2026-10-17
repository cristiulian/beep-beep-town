import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Bring a geometry to a common shape (non-indexed; position/normal/uv only) so it can be merged. */
function normalise(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  g.applyMatrix4(m);
  return g;
}

/**
 * Replaces every static mesh under `root` with one merged mesh per material, so a model made of
 * hundreds of parts costs a handful of draw calls. Children marked `userData.keep` (things that
 * move on their own, like wheels or a head) are left alone.
 */
export function flattenByMaterial(root: THREE.Object3D, castShadow = true) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const merged: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    for (const c of [...o.children]) {
      if (c.userData.keep) continue;
      const mesh = c as THREE.Mesh;
      if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material)) {
        const list = buckets.get(mesh.material) ?? [];
        list.push(normalise(mesh.geometry, new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)));
        buckets.set(mesh.material, list);
        merged.push(mesh);
      }
      visit(c);
    }
  };
  visit(root);
  for (const mesh of merged) {
    // Keep anything hanging off a merged mesh (e.g. a kept child) in place.
    for (const child of [...mesh.children]) mesh.parent!.attach(child);
    mesh.removeFromParent();
  }
  for (const [mat, geos] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    root.add(m);
  }
}

/** Collects many coloured pieces into one vertex-coloured mesh (houses, cones…). */
export class ColorBatch {
  private geos: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, pos: THREE.Vector3Like, rotY = 0, scale?: THREE.Vector3Like) {
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    this.s.set(scale?.x ?? 1, scale?.y ?? 1, scale?.z ?? 1);
    const g = normalise(geo, this.m.compose(new THREE.Vector3(pos.x, pos.y, pos.z), this.q, this.s));
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
  }

  build(mat: THREE.MeshStandardMaterial, castShadow = true) {
    mat.vertexColors = true;
    const mesh = new THREE.Mesh(mergeGeometries(this.geos), mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}
