import * as THREE from 'three';

// A prediction is drawn from the simulation's exact trajectory. Nothing here guesses a landing.
export function createChargeView(parent, coarse = false) {
  const group = new THREE.Group(); group.name = 'Squish landing prediction'; parent.add(group);
  const resources = [], keep = value => (resources.push(value), value);
  const material = color => keep(new THREE.MeshBasicMaterial({color, toneMapped:false, transparent:true, opacity:.86, depthWrite:false, depthTest:true}));
  const arcMaterial = material(0x90f9eb), shadowMaterial = material(0x102536), dotMaterial = material(0xe5fff5);
  shadowMaterial.opacity = .88;
  const segmentGeometry = keep(new THREE.CylinderGeometry(1,1,1,5));
  const dotGeometry = keep(new THREE.SphereGeometry(1,8,6));
  const capacity=128, arc=new THREE.InstancedMesh(segmentGeometry,arcMaterial,capacity), outline=new THREE.InstancedMesh(segmentGeometry,shadowMaterial,capacity);
  const dots=new THREE.InstancedMesh(dotGeometry,dotMaterial,capacity);
  outline.renderOrder=4;arc.renderOrder=5;dots.renderOrder=6;
  for(const mesh of [outline,arc,dots]){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;group.add(mesh);}
  const landing=new THREE.Group();landing.name='Valid landing footprint';group.add(landing);
  const haloMaterial=material(0xa6ffde), fillMaterial=material(0x56d5c4);fillMaterial.opacity=.16;
  const make=(geometry,mat)=>{const mesh=new THREE.Mesh(keep(geometry),mat);landing.add(mesh);return mesh;};
  const halo=make(new THREE.RingGeometry(.61,.74,40),haloMaterial);halo.rotation.x=-Math.PI/2;
  const floor=make(new THREE.CircleGeometry(.61,40),fillMaterial);floor.rotation.x=-Math.PI/2;
  const crossGeometry=keep(new THREE.BoxGeometry(.42,.016,.042));
  const crossA=new THREE.Mesh(crossGeometry,dotMaterial),crossB=new THREE.Mesh(crossGeometry,dotMaterial);crossB.rotation.y=Math.PI/2;landing.add(crossA,crossB);
  const ticks=[];
  for(let i=0;i<4;i++){const tick=make(new THREE.BoxGeometry(.16,.025,.05),haloMaterial);const angle=i*Math.PI/2;tick.position.set(Math.cos(angle)*.88,.015,Math.sin(angle)*.88);tick.rotation.y=-angle;ticks.push(tick);}
  const dummy=new THREE.Object3D(),a=new THREE.Vector3(),b=new THREE.Vector3(),direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  group.visible=false;
  function update(time,state){
    const charge=state?.charge,points=charge?.points;
    group.visible=!!charge?.active&&Array.isArray(points)&&points.length>1;
    if(!group.visible)return;
    const count=Math.min(capacity,points.length-1),safe=charge.safe===true;
    arcMaterial.color.setHex(safe?0x90f9eb:0xf2c178);dotMaterial.color.setHex(safe?0xe5fff5:0xffdfa0);
    arc.count=outline.count=count;
    let dotCount=0;
    for(let i=0;i<count;i++){
      // The points describe Gizmo's feet; a small offset keeps the grounded end of the arc readable.
      a.fromArray(points[i]);b.fromArray(points[i+1]);a.y+=.10;b.y+=.10;direction.subVectors(b,a);
      dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(up,direction.clone().normalize());
      dummy.scale.set(.032,direction.length(),.032);dummy.updateMatrix();arc.setMatrixAt(i,dummy.matrix);
      dummy.scale.set(.043,direction.length(),.043);dummy.updateMatrix();outline.setMatrixAt(i,dummy.matrix);
      if(i%3===0){dummy.position.copy(a);dummy.rotation.set(0,0,0);const size=.050+(i/count)*.014;dummy.scale.setScalar(size);dummy.updateMatrix();dots.setMatrixAt(dotCount++,dummy.matrix);}
    }
    dots.count=dotCount;[arc,outline,dots].forEach(value=>value.instanceMatrix.needsUpdate=true);
    landing.visible=safe&&!!charge.landing;
    if(landing.visible){const p=charge.landing;landing.position.set(p.x,p.y+.12,p.z);const breath=1+Math.sin(time*4)*.025;halo.scale.setScalar(breath);fillMaterial.opacity=.13+.04*(charge.power||0);ticks.forEach((tick,i)=>{const angle=i*Math.PI/2;const radius=.88+Math.sin(time*4)*.025;tick.position.x=Math.cos(angle)*radius;tick.position.z=Math.sin(angle)*radius;});}
  }
  return {update,group,dispose(){parent.remove(group);resources.forEach(value=>value.dispose());}};
}
