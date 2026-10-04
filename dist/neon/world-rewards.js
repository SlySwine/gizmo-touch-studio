import * as THREE from 'three';
import { createGardenBloom } from './garden-bloom.js';

// The three restorations turn the same authored place into usable new routes.
export function createWorldRewards(parent,layout,coarse=false){
  const root=new THREE.Group();root.name='Restored sanctuary routes';parent.add(root);
  const owned=[],keep=v=>(owned.push(v),v);
  const material=(options)=>keep(new THREE.MeshStandardMaterial(options));
  const glow=(color,opacity=1)=>keep(new THREE.MeshBasicMaterial({color,opacity,transparent:opacity<1,depthWrite:opacity===1,toneMapped:false}));
  const dark=material({color:0x203747,metalness:.6,roughness:.45}),brass=material({color:0x80673e,metalness:.7,roughness:.4});
  const pink=glow(0xf9a5dd),blue=glow(0x8edff4),gold=glow(0xf7ce8c);
  const sphere=keep(new THREE.SphereGeometry(1,16,10)),cylinder=keep(new THREE.CylinderGeometry(1,1,1,24)),linkGeo=keep(new THREE.CylinderGeometry(1,1,1,6));
  function mesh(geometry,mat,p=root){const value=new THREE.Mesh(geometry,mat);p.add(value);return value;}
  function ball(p,pos,size,mat){const m=mesh(sphere,mat,p);m.position.set(...pos);m.scale.setScalar(size);return m;}
  function torus(p,r,t,mat,pos=[0,0,0],floor=false){const m=mesh(keep(new THREE.TorusGeometry(r,t,6,48)),mat,p);m.position.set(...pos);if(floor)m.rotation.x=-Math.PI/2;return m;}
  function line(p,a,b,width,mat){const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from),m=mesh(linkGeo,mat,p);m.position.copy(from).add(to).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());m.scale.set(width,delta.length(),width);return m;}
  const rides=new Map(),dockIndicators=[];
  for(const transport of layout.transports||[]){
    const isJelly=transport.kind==='jelly',color=isJelly?0xe89fdc:0xf5c982,vehicle=new THREE.Group();vehicle.name=transport.id;root.add(vehicle);
    const floor=mesh(cylinder,material({color:isJelly?0x69497c:0x594631,metalness:.5,roughness:.33,emissive:isJelly?0x341933:0x2b1d07,emissiveIntensity:.45}),vehicle);floor.scale.set(1.2,.14,1.2);floor.position.y=-.09;floor.castShadow=true;floor.receiveShadow=true;
    const edge=torus(vehicle,1.18,.045,isJelly?pink:gold,[0,-.01,0],true);
    const seat=mesh(keep(new THREE.RingGeometry(.94,1.06,32)),glow(color,.3),vehicle);seat.rotation.x=-Math.PI/2;seat.position.y=.01;
    let bell=null,tendrils=[];
    if(isJelly){
      const bellMat=keep(new THREE.MeshPhysicalMaterial({color:0xdc98d4,emissive:0x673b82,emissiveIntensity:.3,roughness:.26,metalness:.1,clearcoat:1,iridescence:coarse?0:.55,transparent:true,opacity:.64,depthWrite:false,side:THREE.DoubleSide}));
      bell=mesh(keep(new THREE.SphereGeometry(1.55,28,14,0,Math.PI*2,0,Math.PI*.57)),bellMat,vehicle);bell.position.y=2.5;bell.scale.y=.56;
      torus(vehicle,1.52,.025,pink,[0,2.3,0],true);
      ball(vehicle,[0,2.66,0],.25,glow(0xf9d3f2,.55));
      for(let i=0;i<8;i++){const angle=i*Math.PI/4,points=[];for(let j=0;j<7;j++){const a=j/6;points.push(new THREE.Vector3(Math.cos(angle)*(1.45-a*.26)+Math.sin(a*5+angle)*.09,2.32-a*2.28,Math.sin(angle)*(1.45-a*.26)));}const strand=mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),18,.018,4,false)),glow(color,.58),vehicle);tendrils.push(strand);}
      // Four petal seats read as a living carriage, rather than an unsupported disk.
      for(let i=0;i<4;i++){const a=i*Math.PI/2,m=mesh(sphere,material({color:0x6e4a79,roughness:.35,metalness:.32,emissive:0x2a1534}),vehicle);m.position.set(Math.cos(a)*1,-.12,Math.sin(a)*1);m.scale.set(.4,.17,.4);}
    }else{
      const grille=mesh(keep(new THREE.CircleGeometry(1.10,24)),dark,vehicle);grille.rotation.x=-Math.PI/2;grille.position.y=.014;
      for(let i=-3;i<=3;i++){const stripe=mesh(keep(new THREE.BoxGeometry(1.75,.016,.025)),gold,vehicle);stripe.position.set(0,.027,i*.23);}
      for(const x of [-1.08,1.08]){line(vehicle,[x,.03,-.67],[x,.9,-.67],.045,brass);line(vehicle,[x,.9,-.67],[x,.9,.67],.04,brass);line(vehicle,[x,.9,.67],[x,.03,.67],.045,brass);}
      const lowerHalo=torus(vehicle,.78,.045,glow(color,.55),[0,-.21,0],true);lowerHalo.scale.y=.78;
    }
    const docks=[];
    for(const [index,endpoint]of[transport.from,transport.to].entries()){
      const dock=new THREE.Group();dock.position.set(endpoint.x,endpoint.y+.025,endpoint.z);root.add(dock);
      const ring=torus(dock,1.55,.04,glow(color,.12),[0,.035,0],true);
      const dots=Array.from({length:6},(_,i)=>{const angle=i*Math.PI/3;return ball(dock,[Math.cos(angle)*1.55,.04,Math.sin(angle)*1.55],.075,glow(color,.16));});
      const arrow=mesh(keep(new THREE.ConeGeometry(.15,.30,3)),glow(color,.7),dock);arrow.position.set(1.82,.38,0);arrow.rotation.z=Math.PI;
      docks.push({group:dock,ring,dots,arrow,endpoint,index});dockIndicators.push({transport,dock,ring});
    }
    const trackGlow=glow(color,.14);
    const trackPoints=[];for(let i=0;i<=24;i++){const p=i/24;trackPoints.push(new THREE.Vector3(THREE.MathUtils.lerp(transport.from.x,transport.to.x,p),THREE.MathUtils.lerp(transport.from.y,transport.to.y,p)+Math.sin(p*Math.PI)*(transport.arc||0)+.025,THREE.MathUtils.lerp(transport.from.z,transport.to.z,p)));}
    // Only the mechanical lift has a visible rail. Jellyfish travel through open air naturally.
    let rail=null;if(!isJelly){const railPath=new THREE.CurvePath();const waypoints=transport.waypoints||[transport.from,transport.to];for(let i=1;i<waypoints.length;i++){const a=waypoints[i-1],b=waypoints[i];railPath.add(new THREE.LineCurve3(new THREE.Vector3(a.x,a.y+.025,a.z),new THREE.Vector3(b.x,b.y+.025,b.z)));}rail=mesh(keep(new THREE.TubeGeometry(railPath,30,.025,5,false)),trackGlow);rail.visible=false;}
    rides.set(transport.id,{data:transport,vehicle,bell,tendrils,docks,rail,active:false,rest:{...transport.from},lastRide:null});
  }
  const canalMaterial=keep(new THREE.ShaderMaterial({
    transparent:false,depthWrite:true,side:THREE.FrontSide,
    uniforms:{time:{value:0},awake:{value:0}},
    vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;uniform float time;uniform float awake;
      void main(){vec2 p=vUv*vec2(15.65,6.95);float wave=sin(p.x*2.2+sin(p.y*1.7+time*.35)*1.2+time*.48);
      float ripple=sin(p.y*3.1-p.x*.7-time*.32);float caustic=pow(max(0.,1.-abs(wave+ripple)*.7),7.);
      float shore=smoothstep(0.,.12,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y)));
      vec3 color=mix(vec3(.021,.039,.060),vec3(.018,.092,.120),shore);
      color+=vec3(.030,.14,.16)*caustic*(.32+awake*.2)*shore;
      color+=vec3(.030,.06,.070)*pow(max(0.,sin(p.y*1.1+time*.23)),14.);
      gl_FragColor=vec4(color,1.);}`
  }));
  const canal=mesh(keep(new THREE.PlaneGeometry(15.65,6.95)),canalMaterial);canal.rotation.x=-Math.PI/2;canal.position.set(25,.052,-35);canal.name='Shallow prism lightwater';
  const bridges=[];
  for(const surface of (layout.surfaces||[]).filter(s=>s.requires)){
    const bridge=new THREE.Group();bridge.name=surface.id;bridge.position.set(surface.x,surface.height,surface.z);root.add(bridge);
    const slab=mesh(keep(new THREE.BoxGeometry(surface.width,.22,surface.depth)),material({color:0x25788e,roughness:.34,metalness:.45,emissive:0x0d304a,emissiveIntensity:.72}),bridge);slab.position.y=-.11;slab.receiveShadow=true;slab.castShadow=true;
    for(const z of[-surface.depth/2+.10,surface.depth/2-.10]){const edge=mesh(keep(new THREE.BoxGeometry(surface.width,.06,.09)),blue,bridge);edge.position.set(0,.022,z);}
    const seams=[];for(let i=0;i<=16;i++){const strip=mesh(keep(new THREE.BoxGeometry(.027,.012,surface.depth-.22)),glow(0x8fdeef,.3),bridge);strip.position.set(-surface.width/2+i*surface.width/16,.007,0);seams.push(strip);}
    const under=mesh(keep(new THREE.BoxGeometry(surface.width,Math.max(.2,surface.height-.22),surface.depth)),material({color:0x113246,transparent:true,opacity:.20,roughness:.5,metalness:.1,depthWrite:false}),bridge);under.position.y=-surface.height/2-.11;
    // Solid light visibly fills the collision volume so the underpass never promises a false route.
    bridges.push({surface,bridge,seams});bridge.visible=false;
  }
  const chimes=[];
  for(const item of layout.objects.filter(o=>o.kind==='chime')){
    const g=new THREE.Group();g.name=item.id;g.position.set(item.x,item.y||1.4,item.z);root.add(g);
    const glass=keep(new THREE.MeshPhysicalMaterial({color:0xd6d9f7,emissive:0x38405a,emissiveIntensity:.7,metalness:.42,roughness:.13,clearcoat:1}));
    const gem=new THREE.Group();g.add(gem);
    for(let i=-1;i<=1;i++){const shard=mesh(keep(new THREE.OctahedronGeometry(.19)),glass,gem);shard.position.set(i*.30,i===0?-.07:.05,0);shard.scale.set(.8,i===0?2.6:2.0,.8);line(g,[i*.3,.50,0],[i*.3,.31,0],.012,gold);}
    const ring=mesh(keep(new THREE.TorusGeometry(.64,.024,6,30,Math.PI)),glow(0xecc38e,.5),g);ring.position.y=.03;
    const wave=torus(g,.65,.022,glow(0xc6ffed,.0));wave.rotation.x=Math.PI/2;
    const floorY=Math.max(0,(item.y||1.4)-1.25),foot=torus(root,.6,.02,glow(0xc8c0e9,.16),[item.x,floorY+.08,item.z],true);
    chimes.push({item,g,gem,glass,ring,wave,foot,litAt:-100,wasFound:false});
  }
  const gardenBloom=createGardenBloom(root,layout.garden||{x:0,y:0,z:4},coarse);
  const moonCrystals=Array.from({length:4},(_,i)=>{const m=mesh(keep(new THREE.OctahedronGeometry(.12)),glow([0xf6cae7,0xafeaf4,0xf5daab,0xd6c2ff][i]));m.scale.y=1.45;m.visible=false;return m;});
  let lastState=null;
  function update(time,dt,state){
    lastState=state;const t=state.elapsed??time,missions=state.missions||{},p=state.player,traversal=state.traversal||{};
    canalMaterial.uniforms.time.value=t;canalMaterial.uniforms.awake.value=missions.prisms?1:0;
    for(const ride of rides.values()){
      const unlocked=!!missions[ride.data.requires],active=state.transport?.id===ride.data.id;
      ride.vehicle.visible=unlocked;
      if(active){ride.vehicle.position.set(state.transport.position.x,state.transport.position.y,state.transport.position.z);ride.rest={...state.transport.to};ride.lastRide=state.transport;}
      else{const endpoints=[ride.data.from,ride.data.to],nearest=endpoints.reduce((a,b)=>Math.hypot(p.x-a.x,p.z-a.z)<Math.hypot(p.x-b.x,p.z-b.z)?a:b);if(Math.hypot(p.x-nearest.x,p.z-nearest.z)<4&&!ride.active)ride.rest={...nearest};ride.vehicle.position.set(ride.rest.x,ride.rest.y,ride.rest.z);}
      ride.active=active;
      if(ride.bell){ride.bell.scale.y=.56+Math.sin(t*1.5)*.025;ride.tendrils.forEach((strand,i)=>strand.rotation.z=Math.sin(t*1.5+i)*.016);}
      for(const dock of ride.docks){dock.ring.material.opacity=unlocked?.5:.10;dock.arrow.visible=unlocked&&!active;dock.arrow.position.y=.38+Math.sin(t*2.3)*.055;dock.dots.forEach((dot,i)=>dot.material.opacity=unlocked?.45+.18*Math.sin(t*2-i):.08);}
      if(ride.rail)ride.rail.visible=unlocked;
    }
    for(const value of bridges){value.bridge.visible=!!missions[value.surface.requires];value.seams.forEach((strip,i)=>strip.material.opacity=.19+.16*Math.pow(Math.max(0,Math.sin(t*1.5-i*.25)),3));}
    for(const chime of chimes){
      const unlocked=!chime.item.requires||missions[chime.item.requires],found=(traversal.chimes||[]).includes(chime.item.id);chime.g.visible=chime.foot.visible=unlocked;
      if(found&&!chime.wasFound)chime.litAt=t;chime.wasFound=found;
      chime.gem.rotation.y=t*.6;chime.gem.position.y=Math.sin(t*1.8+chime.item.x)*.07;
      chime.glass.emissiveIntensity=found?1.1:.35;chime.ring.material.opacity=found?.28:.56;chime.ring.rotation.y=t*.2;
      const age=t-chime.litAt;chime.wave.visible=age<1.8;chime.wave.scale.setScalar(1+age*1.8);chime.wave.material.opacity=Math.max(0,.6*(1-age/1.8));
    }
    const visited=traversal.visited||[];
    gardenBloom.update(t,dt,state);
    moonCrystals.forEach((crystal,i)=>{crystal.visible=!!state.abilities?.moontrail;const a=t*1.05+i*Math.PI/2;crystal.position.set(p.x-Math.sin(p.yaw)*1.65+Math.cos(a)*.68,p.y+.95+Math.sin(a*1.2)*.30,p.z-Math.cos(p.yaw)*1.65+Math.sin(a)*.68);crystal.rotation.y=t*1.5+i;});
    root.userData.routes={unlocked:{...missions},visited:[...visited],gardenAwake:!!traversal.gardenAwake};
  }
  function handleEvents(events){for(const e of events||[]){if(e.type==='chime'){const value=chimes.find(c=>c.item.id===e.id);if(value)value.litAt=lastState?.elapsed||0;}}}
  return {update,handleEvents,group:root,dispose(){gardenBloom.dispose();parent.remove(root);owned.forEach(value=>value.dispose());}};
}
