// Shows every vehicle in the library side by side, for checking the models.
import * as THREE from 'three';
import { VEHICLES } from '../src/vehicles';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7ee);
scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(10, 20, 15);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 });
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9d1d8 }));
floor.receiveShadow = true;
scene.add(floor);
let x = -20;
for (const v of VEHICLES) {
  const g = v.build(v.colors[0]);
  g.position.set(x + v.width / 2, 0, 0);
  g.rotation.y = 0.5;
  scene.add(g);
  x += v.width + 2.8;
}
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
cam.position.set(2, 9, 26);
cam.lookAt(2, 1, 0);
renderer.render(scene, cam);
