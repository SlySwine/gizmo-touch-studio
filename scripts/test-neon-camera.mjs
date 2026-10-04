import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import {createCameraRig} from '../dist/neon/camera.js';
const layout=JSON.parse(readFileSync(new URL('../dist/neon/world.json',import.meta.url)));
const colliders=[...layout.colliders,...layout.surfaces.filter(s=>s.type==='box')];
function setup(){const camera=new THREE.PerspectiveCamera(58,1.6,.12,180);const meshes=colliders.map(c=>{const m=new THREE.Mesh(new THREE.BoxGeometry(c.width,c.height,c.depth));m.position.set(c.x,c.height/2,c.z);m.updateMatrixWorld();return m;});return {camera,rig:createCameraRig(camera,meshes)};}
function outside(position){for(const c of colliders)assert(!(position.x>c.x-c.width/2+.001&&position.x<c.x+c.width/2-.001&&position.z>c.z-c.depth/2+.001&&position.z<c.z+c.depth/2-.001&&position.y>.001&&position.y<c.height-.001),`camera inside ${c.id}: ${position.toArray()}`);}
test('close-wall orbit remains outside the divider, machine, planter and secret screen',()=>{for(const [x,z,yaw] of [[23.81,-18,-Math.PI/2],[25,14.55,Math.PI],[-25,-6.94,Math.PI],[-7.94,23,-Math.PI/2]]){const {camera,rig}=setup();rig.update({x,z,y:0},{yaw,pitch:.43,distance:9},.016,true);outside(camera.position);assert(camera.position.y>4,'blocked close-up should lift to a readable overhead view');}});
test('smooth camera return and repeated orbit cannot cut through collider interiors',()=>{const {camera,rig}=setup();for(let i=0;i<1200;i++){const p={x:25+Math.sin(i*.006)*.15,z:14.56,y:0};rig.update(p,{yaw:i*.016,pitch:.18+(Math.sin(i*.009)+1)*.38,distance:5+i%9},1/60,i===0);outside(camera.position);assert(camera.position.toArray().every(Number.isFinite));assert(camera.position.distanceTo(rig.target)>=.12);}});
test('raised deck camera and portrait orbit remain finite and outside geometry',()=>{const {camera,rig}=setup();camera.aspect=.46;for(let i=0;i<120;i++){rig.update({x:0,y:4,z:-37},{yaw:i*.1,pitch:.43,distance:9},1/30,i===0);outside(camera.position);assert(camera.position.y>4);}});
