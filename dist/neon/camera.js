import * as THREE from '../vendor/three.module.min.js';

// Owns orbit placement and obstruction recovery; never hides material-batched scenery.
export function createCameraRig(camera,occluders){
  const target=new THREE.Vector3(),wanted=new THREE.Vector3(),candidate=new THREE.Vector3(),delta=new THREE.Vector3(),ray=new THREE.Raycaster();
  function safe(position){
    delta.subVectors(position,target);const distance=delta.length();if(distance<.001)return position;
    ray.set(target,delta.normalize());ray.far=distance;
    const hit=ray.intersectObjects(occluders,false)[0];
    if(!hit)return position;
    if(hit.distance<2){
      // The player capsule guarantees this narrow column is outside solid walls.
      // Raising the view keeps Gizmo visible even with his back against a machine.
      position.set(target.x+delta.x*.24,target.y+5.3,target.z+delta.z*.24);
    }else position.copy(target).addScaledVector(delta,Math.max(.15,hit.distance-.3));
    return position;
  }
  return {
    target,
    update(player,orbit,dt,snap=false){
      target.set(player.x,player.y+1,player.z);
      const distance=orbit.distance*(camera.aspect<.8?1.2:1);
      wanted.set(Math.sin(orbit.yaw)*Math.cos(orbit.pitch)*distance,Math.sin(orbit.pitch)*distance,Math.cos(orbit.yaw)*Math.cos(orbit.pitch)*distance).add(target);
      safe(wanted);
      if(snap)candidate.copy(wanted);else candidate.copy(camera.position).lerp(wanted,1-Math.exp(-dt*14));
      // Resolve the actual smoothed segment as well as its destination.
      safe(candidate);candidate.y=Math.max(.55,candidate.y);
      camera.position.copy(candidate);camera.lookAt(target);camera.updateMatrixWorld();
    }
  };
}
