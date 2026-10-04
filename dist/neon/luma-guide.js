import * as THREE from 'three';

// A companion demonstrates gestures, never changes puzzle state or completes a task for the player.
export function createLumaGuide(parent,layout,camera=null){
  const owned=[],keep=v=>(owned.push(v),v),group=new THREE.Group();group.name='Luma visual companion';parent.add(group);
  const cyan=0xa1ffe9,gold=0xffdf9a;
  const mat=(color,opacity=1)=>keep(new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity===1,toneMapped:false}));
  const gemMaterial=mat(cyan),soft=mat(cyan,.38),ghostMaterial=mat(0xb7e8f1,.16),ghostEdge=mat(0xc1fff5,.55),goldMaterial=mat(gold,.8);
  const sphere=keep(new THREE.SphereGeometry(1,12,8));
  function mesh(geometry,material,container=group){const m=new THREE.Mesh(geometry,material);container.add(m);return m;}
  const body=new THREE.Group();group.add(body);
  const core=mesh(keep(new THREE.OctahedronGeometry(.27)),gemMaterial,body);core.scale.y=1.45;
  const halo=mesh(keep(new THREE.TorusGeometry(.41,.017,5,30)),soft,body);halo.rotation.x=.55;
  const satellites=Array.from({length:3},()=>{const m=mesh(sphere,gemMaterial,body);m.scale.setScalar(.055);return m;});
  // Tiny asymmetrical fins make Luma's beckoning motion legible from either side.
  const fins=[-1,1].map(side=>{const m=mesh(keep(new THREE.ConeGeometry(.10,.3,3)),soft,body);m.position.x=side*.33;m.rotation.z=side*-1.1;return m;});
  const pointer=new THREE.Group();group.add(pointer);pointer.visible=false;
  const arrow=mesh(keep(new THREE.ConeGeometry(.12,.28,3)),goldMaterial,pointer);arrow.rotation.z=Math.PI;
  const targetRing=mesh(keep(new THREE.RingGeometry(.58,.63,32)),goldMaterial,pointer);targetRing.rotation.x=-Math.PI/2;targetRing.position.y=-.37;
  const trailCount=22,trailGeometry=keep(new THREE.BufferGeometry()),trailData=new Float32Array(trailCount*3);
  trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailData,3));
  const trail=new THREE.Points(trailGeometry,keep(new THREE.PointsMaterial({color:cyan,size:.06,transparent:true,opacity:.45,depthWrite:false,toneMapped:false})));parent.add(trail);
  const history=Array.from({length:trailCount},()=>new THREE.Vector3(0,2,6));
  const demo=new THREE.Group();demo.name='Luma harmless jelly demonstration';parent.add(demo);demo.visible=false;
  const ghost=new THREE.Group();demo.add(ghost);
  for(const [x,y] of [[-.27,.95],[.27,.95],[-.27,.47],[.27,.47]]){const lobe=mesh(sphere,ghostMaterial,ghost);lobe.position.set(x,y,0);lobe.scale.set(.37,.35,.20);}
  const ghostHat=mesh(keep(new THREE.TorusGeometry(.19,.045,5,20)),ghostEdge,ghost);ghostHat.position.set(-.22,1.23,0);ghostHat.rotation.x=Math.PI/2;
  const ghostJelly=new THREE.Group();demo.add(ghostJelly);
  const bell=mesh(keep(new THREE.SphereGeometry(.35,16,10,0,Math.PI*2,0,Math.PI*.58)),ghostEdge,ghostJelly);bell.scale.y=.72;
  for(let i=0;i<4;i++){const thread=mesh(keep(new THREE.CylinderGeometry(.013,.013,.45,4)),ghostEdge,ghostJelly);thread.position.set((i-1.5)*.10,-.28,0);thread.rotation.z=(i-1.5)*.11;}
  const actionPulse=mesh(keep(new THREE.RingGeometry(.48,.54,32)),goldMaterial,demo);actionPulse.rotation.x=-Math.PI/2;
  const waypointDots=[];
  for(let i=0;i<16;i++){const dot=mesh(sphere,soft,demo);dot.scale.setScalar(.045);waypointDots.push(dot);}
  const pos=new THREE.Vector3(0,1.85,6),desired=pos.clone(),previous=pos.clone();
  const objects=new Map(layout.objects.map(o=>[o.id,o]));
  let forced=null,demoTarget=null,demoStart=-100,lastDemoEnd=-100,activeUntil=0,lastState=null,bounceStart=-100,lastElapsed=-1;
  const seen=new Set();
  const point=(o,y=0)=>new THREE.Vector3(o.x,(o.y||0)+y,o.z);
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  function targetFor(state){
    const nearby=state.nearby;
    if(state.introBounce&&!Object.values(state.jellies||{}).some(j=>j.status==='following'))return objects.get('chime-1');
    if(nearby&&!['guide','gate'].includes(nearby.kind)){
      const known=objects.get(nearby.id);
      if(known)return {...known,...(state.jellies?.[nearby.id]||state.batteries?.[nearby.id]||{})};
      const transport=(layout.transports||[]).find(t=>nearby.id.startsWith(t.id+':'));
      if(transport){const end=nearby.id.endsWith(':to')?transport.to:transport.from;return {...end,id:nearby.id,kind:'transport'};}
    }
    const following=Object.values(state.jellies||{}).some(j=>j.status==='following');
    if(following)return objects.get('nursery');
    const carried=Object.entries(state.batteries||{}).find(([,b])=>b.status==='carried');
    if(carried)return objects.get(carried[0].replace('battery','socket'));
    const district=forced||state.tracked||state.objectives?.current;
    const nearest=items=>items.sort((a,b)=>distance(state.player,a)-distance(state.player,b))[0];
    if(state.missions?.[district]&&!(state.traversal?.visited||[]).includes({jellies:'conservatory',prisms:'arcade',engine:'foundry'}[district])){
      const transport=(layout.transports||[]).find(t=>t.requires===district);
      if(transport)return {...transport.from,id:transport.id+':from',kind:'transport'};
      if(district==='prisms'){const approach=layout.surfaces.find(s=>s.id==='prism-approach-west');if(approach)return {x:approach.x-approach.width/2+.5,y:0,z:approach.z,id:'prism-crossing',kind:'crossing'};}
    }
    if(district==='garden')return {...layout.garden,id:'moon-garden',kind:'garden'};
    if(district==='jellies'&&!state.missions?.jellies)return nearest(Object.entries(state.jellies||{}).filter(([,j])=>j.status==='waiting').map(([id,j])=>({...objects.get(id),...j})));
    if(district==='prisms'&&!state.missions?.prisms)return objects.get(state.mirrors?.['mirror-a']?.rotation===0?'mirror-b':'mirror-a');
    if(district==='engine'&&!state.missions?.engine)return nearest(Object.entries(state.batteries||{}).filter(([,b])=>b.status==='waiting').map(([id,b])=>({...objects.get(id),...b})))||objects.get('foundry-console');
    if(state.gateOpen&&!state.completed)return objects.get('aurora-heart');
    return null;
  }
  function demoRoute(jelly){
    const nursery=objects.get('nursery');
    // Walk around the conservatory's planter, rather than showing a route through its solid center.
    const path=[point(jelly)];
    if(jelly.z<-9)path.push(new THREE.Vector3(jelly.x<-26?-30:-20,0,-5.4));
    path.push(point(nursery));
    return new THREE.CatmullRomCurve3(path,false,'centripetal');
  }
  function update(time,dt,state){
    lastState=state;const t=state.elapsed??time,p=state.player;if(!p)return;
    if(t<lastElapsed-.05){seen.clear();demoTarget=null;forced=null;demoStart=bounceStart=lastDemoEnd=-100;demo.visible=false;}lastElapsed=t;
    const target=targetFor(state),near=target&&distance(p,target)<10;
    if(forced&&t>activeUntil)forced=null;
    if(target?.kind==='jelly'&&target.status==='waiting'&&near&&!seen.has('jelly')&&!demoTarget&&t-lastDemoEnd>25){demoTarget={...target,route:demoRoute(target)};demoStart=t;seen.add('jelly');}
    if(demoTarget&&(state.jellies?.[demoTarget.id]?.status!=='waiting'||t-demoStart>11||distance(p,demoTarget)>15)){demoTarget=null;lastDemoEnd=t;demo.visible=false;}
    const heading=new THREE.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw));
    desired.set(p.x-heading.x*1.2+heading.z*.95,p.y+1.9,p.z-heading.z*1.2-heading.x*.95);
    if(target){let directionTarget=target;
      // The first approach rounds the planted threshold through its southern/northern opening.
      if(target.kind==='jelly'&&p.x>-14&&target.x<-17){directionTarget={x:-14.5,y:0,z:p.z>0?17.5:-6.5};}
      const toward=point(directionTarget).sub(new THREE.Vector3(p.x,p.y,p.z));if(toward.length()>2.5)toward.normalize().multiplyScalar(2.2);desired.set(p.x+toward.x,p.y+2.05,p.z+toward.z);}
    if(state.transport){const from=state.transport.from,to=state.transport.to,travel=new THREE.Vector3(to.x-from.x,0,to.z-from.z).normalize();
      const side=camera?new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).setY(0).normalize():new THREE.Vector3(travel.z,0,-travel.x);
      desired.set(p.x+side.x*1.9,p.y+1.95,p.z+side.z*1.9);
    }
    // Luma catches up smoothly but cannot lag several rooms behind after recovery or transport.
    if(pos.distanceTo(desired)>15)pos.copy(desired);else pos.lerp(desired,1-Math.exp(-dt*3));
    previous.copy(body.position);body.position.copy(pos);body.position.y+=Math.sin(t*2.2)*.10;
    core.rotation.y=t*.55;halo.rotation.z=t*.34;halo.rotation.y=Math.sin(t*.4)*.3;
    fins.forEach((fin,i)=>fin.rotation.z=(i?1:-1)*(-1.1+Math.sin(t*5)*.15));
    satellites.forEach((satellite,i)=>{const a=t*.8+i*2.094;satellite.position.set(Math.cos(a)*.43,Math.sin(a*1.6)*.16,Math.sin(a)*.43);});
    history.unshift(body.position.clone());history.pop();history.forEach((value,i)=>trailData.set(value.toArray(),i*3));trailGeometry.attributes.position.needsUpdate=true;
    pointer.visible=!state.transport&&!!near&&(!state.missions?.[state.tracked]||['battery','socket','jelly','console'].includes(target.kind));
    if(pointer.visible){pointer.position.set(target.x,(target.y||0)+2.25+Math.sin(t*3)*.10,target.z);const ringHeight=(target.kind==='jelly'?Math.max(0,(target.y||1.1)-1.1):target.kind==='chime'?Math.max(0,(target.y||1.4)-1.4):target.kind==='battery'?Math.max(0,(target.y||.6)-.6):target.y||0)+.10;targetRing.position.y=ringHeight-pointer.position.y;arrow.scale.setScalar(.85+Math.sin(t*3)*.08);}
    const practice=objects.get('chime-1');
    if(state.introBounce&&t-bounceStart>8)seen.delete('bounce');
    const hasChime=(state.traversal?.chimes||[]).includes('chime-1');
    if(state.introBounce&&practice&&!hasChime&&!seen.has('bounce')&&!demoTarget&&distance(p,practice)<8&&!state.charge?.active){bounceStart=t;seen.add('bounce');}
    const bounceAge=t-bounceStart,bounceDemo=state.introBounce&&bounceAge>=0&&bounceAge<5.8&&!state.charge?.active&&!demoTarget&&!hasChime;
    demo.visible=!!demoTarget||bounceDemo;
    if(bounceDemo){
      const launch=THREE.MathUtils.clamp((bounceAge-1.5)/2.4,0,1),crouch=bounceAge<1.5?THREE.MathUtils.smoothstep(bounceAge,0,1.5):0;
      ghost.position.set(practice.x,.02+Math.sin(launch*Math.PI)*.72,practice.z+2.6-launch*5.2);ghost.rotation.y=Math.PI;
      ghost.scale.set(1+crouch*.3,1-crouch*.38,1+crouch*.3);ghostJelly.visible=false;waypointDots.forEach(dot=>dot.visible=false);
      actionPulse.visible=bounceAge<1.6;actionPulse.position.set(practice.x,.09,practice.z+2.6);actionPulse.scale.setScalar(.7+crouch*.25);
      const fade=bounceAge>4.8?5.8-bounceAge:1;ghostMaterial.opacity=.23*fade;ghostEdge.opacity=.65*fade;
    }else ghost.scale.setScalar(1);
    if(demoTarget){
      const age=t-demoStart,route=demoTarget.route,moving=THREE.MathUtils.clamp((age-3)/7,0,1),start=route.getPoint(0),destination=route.getPoint(moving);
      ghost.position.copy(destination);ghost.position.y=.02;ghost.rotation.y=Math.atan2(route.getTangent(moving).x,route.getTangent(moving).z);
      if(age<2){ghost.position.x+=2*(1-age/2);ghost.rotation.y=-Math.PI/2;}
      ghostJelly.visible=age>2.7;ghostJelly.position.copy(route.getPoint(Math.max(0,moving-.09)));ghostJelly.position.y=1.15+Math.sin(t*3)*.08;
      actionPulse.visible=age>1.3&&age<3.1;actionPulse.position.set(start.x,.11,start.z);actionPulse.scale.setScalar(.7+((age-1.3)%1)*.8);
      waypointDots.forEach((dot,i)=>{dot.position.copy(route.getPoint(i/15));dot.position.y=.10;dot.visible=age>2.7&&i/15<moving+.08;});
      // A replay is a transparent shadow, while the real jelly remains the only interactive creature.
      ghostMaterial.opacity=age>10?.16*(11-age):.16;ghostEdge.opacity=age>10?.55*(11-age):.55;
    }
    group.userData.teachingPhase=bounceDemo?(bounceAge<1.5?'hold':bounceAge<4?'release':null):null;
    group.userData.target=target?.id||null;group.userData.demonstrating=demoTarget?.id||(bounceDemo?'chime-1':null);
  }
  function handleEvents(events){
    for(const event of events||[]){if(event.type==='jelly-follow'&&event.following){seen.add('jelly');demoTarget=null;demo.visible=false;}if(event.type==='recover'){demoTarget=null;demo.visible=false;}if(event.type==='charge-release'){if(event.quick)seen.delete('bounce');else seen.add('bounce');bounceStart=-100;}if(event.type==='mission-complete'){forced=null;}}
  }
  function demonstrate(id){if(lastState?.introBounce&&objects.get('chime-1')&&distance(lastState.player,objects.get('chime-1'))<10){seen.delete('bounce');bounceStart=-100;}forced=id;activeUntil=(lastState?.elapsed||0)+12;if(id==='jellies'){seen.delete('jelly');lastDemoEnd=-100;}}
  return {update,handleEvents,demonstrate,group,dispose(){parent.remove(group,trail,demo);owned.forEach(value=>value.dispose());}};
}
