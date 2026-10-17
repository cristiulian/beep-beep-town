// Renders the car from four angles for checking the model. Open /tools/car-preview.html?body=%23..&roof=..
import * as THREE from 'three';
import { Car, CARS } from '../src/car';

const q = new URLSearchParams(location.search);
const def = CARS[0];
const car = new Car(def, {
  body: q.get('body') ?? def.defaultColors.body,
  roof: q.get('roof') ?? def.defaultColors.roof,
  rims: q.get('rims') ?? def.defaultColors.rims,
});
const W = 1200, H = 800;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7ee);
scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 10, 8);
sun.castShadow = true;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9d1d8 }));
floor.receiveShadow = true;
scene.add(floor, car.model.root);
const views: [number, number, number][] = (q.get("close") ? [[2.2, 1.1, 5.5], [-2, 1.3, -5.5], [7.5, 1.0, 0.01], [0.01, 1.0, 5]] : [[6, 2, 4.5], [-6, 2.2, -4.5], [7.5, 1.0, 0.01], [0.01, 1.4, 7]]) as [number, number, number][];
const cam = new THREE.PerspectiveCamera(35, W / 2 / (H / 2), 0.1, 100);
views.forEach(([x, y, z], i) => {
  const vx = (i % 2) * W / 2, vy = (1 - Math.floor(i / 2)) * H / 2;
  renderer.setViewport(vx, vy, W / 2, H / 2);
  renderer.setScissor(vx, vy, W / 2, H / 2);
  // Swap x/z so view 3 is a pure side view and view 4 straight on the nose.
  cam.position.set(x, y, z);
  cam.lookAt(0, 0.8, 0);
  renderer.render(scene, cam);
});
