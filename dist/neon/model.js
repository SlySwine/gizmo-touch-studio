// Deterministic world rules. The view supplies world-space movement and reads snapshots.
const RADIUS=.55, HEIGHT=1.4, STEP_HEIGHT=.46, GRAVITY=19, JUMP_SPEED=7.3;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const copy=v=>JSON.parse(JSON.stringify(v));
const CHARGE_TIME=1.1, QUICK_CHARGE=.16;
const COLORS={'battery-a':'blue','battery-b':'gold'};

export function createNeonModel(layout,saved) {
  const objects=new Map(layout.objects.map(o=>[o.id,{...o}]));
  const spireDeck=(layout.surfaces||[]).find(s=>s.id==='spire-deck');
  const jellies={},mirrors={},batteries={};
  for(const o of objects.values()) {
    if(o.kind==='jelly')jellies[o.id]={x:o.x,y:1.1,z:o.z,status:'waiting'};
    if(o.kind==='mirror')mirrors[o.id]={rotation:o.id==='mirror-a'?1:2,lit:o.id==='mirror-a',solved:false};
    if(o.kind==='battery')batteries[o.id]={x:o.x,y:.6,z:o.z,status:'waiting',socketId:null};
  }
  let elapsed=0,checkpoint={...layout.spawn},secrets=[],completed=false,jumpHeld=false,lastEvents=[];
  let player={x:layout.spawn.x,y:0,z:layout.spawn.z,yaw:0,grounded:true,speed:0,vx:0,vy:0,vz:0};
  const engine={started:false,beats:0,clock:0};
  let prismSolved=false, transport=null, visitedRoutes=[],chimes=[],gardenAwake=false,charge={active:false,time:0,power:0,points:[],landing:null,safe:true,aimX:0,aimZ:-1};
  const jellyIds=Object.keys(jellies), batteryIds=Object.keys(batteries);
  const missionState=()=>({jellies:jellyIds.every(id=>jellies[id].status==='delivered'),prisms:prismSolved,
    engine:engine.beats===3,completed});
  const gateOpen=()=>{const m=missionState();return m.jellies&&m.prisms&&m.engine;};
  const carried=()=>batteryIds.find(id=>batteries[id].status==='carried')||null;
  const installed=()=>batteryIds.filter(id=>batteries[id].status==='installed').length;
  const abilities=()=>({echoLevel:Math.floor(secrets.length/2),jumpPower:JUMP_SPEED+Math.floor(secrets.length/2)*.3,moontrail:chimes.length>=4});
  const enabled=o=>!o.requires||!!missionState()[o.requires];
  let surfaceMask=-1,surfaceCache=[];
  const activeSurfaces=()=>{
    const mask=Number(prismSolved)+Number(engine.beats===3)*2+Number(jellyIds.every(id=>jellies[id].status==='delivered'))*4;
    if(mask!==surfaceMask){surfaceMask=mask;surfaceCache=(layout.surfaces||[]).filter(enabled);}
    return surfaceCache;
  };
  function surfaceHeight(s,x,z){
    if(s.type!=='ramp')return s.height||0;
    const axis=s.axis||'-z',span=axis.includes('x')?s.width:s.depth,delta=axis.includes('x')?x-s.x:z-s.z;
    const t=clamp(.5+delta/span*(axis.startsWith('-')?-1:1),0,1);
    return s.low+(s.high-s.low)*t;
  }
  const emit=(events,type,extra={})=>events.push({type,...extra});
  function floorAt(x,z) {
    let height=0;
    for(const s of activeSurfaces()) {
      if(Math.abs(x-s.x)>s.width/2+.001||Math.abs(z-s.z)>s.depth/2+.001)continue;
      height=Math.max(height,surfaceHeight(s,x,z));
    }
    return height;
  }
  function boxesFor(p=player) {
    const boxes=(layout.colliders||[]).filter(b=>enabled(b)&&p.y<b.height-.02&&p.y+HEIGHT>(b.y||0));
    const clearance=p.grounded?STEP_HEIGHT:.02;
    // A high deck is solid from the sides; walking up the ramp remains continuous.
    for(const s of activeSurfaces()) {
      if(s.type==='box'&&p.y<(s.height||0)-clearance)boxes.push(s);
      if(s.type==='ramp') {
        const x=clamp(p.x,s.x-s.width/2,s.x+s.width/2),z=clamp(p.z,s.z-s.depth/2,s.z+s.depth/2);
        if(surfaceHeight(s,x,z)>p.y+clearance)boxes.push(s);
      }
    }
    if(!gateOpen()) {
      boxes.push(...(layout.barriers||[]).filter(b=>p.y<b.height-.02&&p.y+HEIGHT>(b.y||0)));
      const g=objects.get('aurora-gate');if(g)boxes.push({...g,width:9,depth:.7,height:8});
    }
    return boxes;
  }
  function circleBox(p,b,resolve=false) {
    const left=b.x-b.width/2,right=b.x+b.width/2,top=b.z-b.depth/2,bottom=b.z+b.depth/2;
    const qx=clamp(p.x,left,right),qz=clamp(p.z,top,bottom),dx=p.x-qx,dz=p.z-qz,d=Math.hypot(dx,dz);
    if(d>=RADIUS-.00001)return false;
    if(!resolve)return true;
    let nx,nz,amount;
    if(d>1e-8){nx=dx/d;nz=dz/d;amount=RADIUS-d;}
    else {
      const sides=[{d:p.x-left,nx:-1,nz:0},{d:right-p.x,nx:1,nz:0},{d:p.z-top,nx:0,nz:-1},{d:bottom-p.z,nx:0,nz:1}];
      sides.sort((a,b)=>a.d-b.d);({nx,nz}=sides[0]);amount=RADIUS+sides[0].d;
    }
    p.x+=nx*amount;p.z+=nz*amount;
    const inward=p.vx*nx+p.vz*nz;if(inward<0){p.vx-=inward*nx;p.vz-=inward*nz;}
    return true;
  }
  function inBounds(p){const b=layout.bounds;return p.x>=b.minX+RADIUS&&p.x<=b.maxX-RADIUS&&p.z>=b.minZ+RADIUS&&p.z<=b.maxZ-RADIUS;}
  function safePoint(p) {
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||!inBounds(p))return false;
    if(!gateOpen()&&spireDeck&&Math.abs(p.x-spireDeck.x)<=spireDeck.width/2&&Math.abs(p.z-spireDeck.z)<=spireDeck.depth/2)return false;
    const test={x:p.x,z:p.z,y:floorAt(p.x,p.z)};
    return !boxesFor(test).some(b=>circleBox(test,b));
  }
  function safeCheckpoint(candidate) {
    // Checkpoints come only from the authored set, never arbitrary save coordinates.
    const points=[layout.spawn,...(layout.checkpoints||[])];
    return points.find(p=>candidate&&distance(p,candidate)<.01&&safePoint(p))||layout.spawn;
  }
  function updateMirrors(){mirrors['mirror-a'].lit=true;mirrors['mirror-b'].lit=mirrors['mirror-a'].rotation===0;
    for(const m of Object.values(mirrors))m.solved=prismSolved;}
  function engineState(){const pulse=(engine.clock%2.8)/2.8,ready=engine.started&&engine.beats<3&&pulse>=.45/2.8&&pulse<=2.15/2.8;
    return {started:engine.started,beats:engine.beats,required:3,pulse,ready,phase:engine.beats===3?'complete':!engine.started?'idle':ready?'ready':'charging'};}
  function restore(save) {
    if(!save||save.version!==1||save.worldId!==layout.id)return;
    elapsed=clamp(finite(save.elapsed),0,1e8);
    const validSecrets=new Set([...objects.values()].filter(o=>o.kind==='secret').map(o=>o.id));
    secrets=[...new Set(Array.isArray(save.secrets)?save.secrets:[])].filter(id=>validSecrets.has(id));
    for(const id of jellyIds) {
      const s=save.jellies?.[id];if(!s)continue;
      jellies[id].status=['waiting','following','delivered'].includes(s.status)?s.status:'waiting';
      // Jellyfish float over scenery; their saved positions need bounds checks,
      // not the ground character's walkability test.
      if(Number.isFinite(s.x)&&Number.isFinite(s.z)&&inBounds(s)){jellies[id].x=s.x;jellies[id].z=s.z;}
    }
    let alreadyCarrying=false;
    for(const id of batteryIds) {
      const s=save.batteries?.[id];if(!s)continue;
      if(s.status==='installed'){batteries[id].status='installed';batteries[id].socketId=id.replace('battery','socket');}
      else if(s.status==='carried'&&!alreadyCarrying){batteries[id].status='carried';alreadyCarrying=true;}
    }
    for(const id of Object.keys(mirrors))mirrors[id].rotation=clamp(Math.round(finite(save.mirrors?.[id]?.rotation,mirrors[id].rotation)),0,3);
    prismSolved=mirrors['mirror-a'].rotation===0&&mirrors['mirror-b'].rotation===1;
    engine.beats=installed()===batteryIds.length?clamp(Math.floor(finite(save.engine?.beats)),0,3):0;
    engine.started=installed()===batteryIds.length&&!!save.engine?.started;
    engine.clock=clamp(finite(save.engine?.clock),0,2.8);
    completed=!!save.completed&&gateOpen();
    visitedRoutes=[...new Set(Array.isArray(save.traversal?.visited)?save.traversal.visited:[])].filter(id=>(layout.routes||[]).some(r=>r.id===id&&enabled(r)));
    chimes=[...new Set(Array.isArray(save.chimes)?save.chimes:[])].filter(id=>objects.get(id)?.kind==='chime'&&enabled(objects.get(id)));
    gardenAwake=visitedRoutes.length===3&&save.traversal?.gardenAwake===true;
    checkpoint={...safeCheckpoint(save.checkpoint)};
    const p=save.player;
    if(safePoint(p)) {
      player.x=p.x;player.z=p.z;player.y=floorAt(p.x,p.z);
      player.yaw=clamp(finite(p.yaw),-1e6,1e6);
    }else{player.x=checkpoint.x;player.z=checkpoint.z;player.y=floorAt(player.x,player.z);}
    // Resuming reunites companions. A reload cannot strand a follower across the map.
    for(const [i,id] of jellyIds.entries())if(jellies[id].status==='following'){
      jellies[id].x=player.x+(i-1)*.7;jellies[id].z=player.z+1.4;
    }
    updateMirrors();updateCompanions(0,[]);
  }
  function nearby() {
    if(transport)return {id:transport.id,kind:'transport',label:'Step off',hint:''};
    const candidates=[];
    for(const o of objects.values()) {
      if(['secret','source','receiver','guide','chime'].includes(o.kind))continue;
      let pos=o,label='',hint='',priority=0;
      if(o.kind==='jelly') {
        const j=jellies[o.id];if(j.status==='delivered')continue;pos=j;
        label=j.status==='following'?'Wait here':'Follow me';hint='Bring the little lights home';priority=2;
      }else if(o.kind==='mirror') {label=prismSolved?'Prisms are glowing':'Turn mirror';hint='Point the light to the next mirror';priority=3;}
      else if(o.kind==='battery') {
        if(batteries[o.id].status!=='waiting')continue;
        label=carried()?'Hands full':`Pick up ${COLORS[o.id]} cell`;priority=2;
      }else if(o.kind==='socket') {
        const bid=o.id.replace('socket','battery');if(batteries[bid]?.status==='installed')continue;
        label=carried()===bid?`Place ${COLORS[bid]} cell`:`Needs ${COLORS[bid]} cell`;priority=carried()===bid?4:0;
      }else if(o.kind==='console') {
        const e=engineState();label=installed()<batteryIds.length?'Find both power cells':e.phase==='complete'?'Engine is awake':!e.started?'Wake the engine':e.ready?'Pulse!':'Wait for the glow';
        hint='Tap when the big ring glows';priority=2;
      }else if(o.kind==='gate'){label=gateOpen()?'The way is open':'Wake the three wonders';}
      else if(o.kind==='heart'){label=gateOpen()?(completed?'Aurora restored':'Release the aurora'):'Wake the three wonders';priority=4;}
      else if(o.kind==='garden'){if(visitedRoutes.length<3||gardenAwake)continue;label='Bloom the garden';priority=4;}
      else if(o.kind==='nursery'){label=missionState().jellies?'Everyone is home':'Find the three little lights';}
      const d=distance(player,pos),dy=Math.abs(player.y-(o.kind==='jelly'?floorAt(pos.x,pos.z):(o.y||0)));
      if(d<=3.1&&dy<2.2)candidates.push({id:o.id,kind:o.kind,label,hint,d,priority});
    }
    for(const t of layout.transports||[])for(const side of ['from','to']) {
      const endpoint=t[side],d=distance(player,endpoint);
      if(d<=2.65&&Math.abs(player.y-endpoint.y)<1.15)candidates.push({id:`${t.id}:${side}`,kind:'transport',label:enabled(t)?(side==='from'?t.name:'Ride back'):(t.requires==='jellies'?'Bring the lights home':'Wake the engine'),hint:'',d,priority:3});
    }
    // Nearby followers cannot steal the action from a puzzle or a cell socket.
    candidates.sort((a,b)=>(a.kind==='jelly'&&jellies[a.id].status==='following'?1:0)-(b.kind==='jelly'&&jellies[b.id].status==='following'?1:0)||a.d-b.d||b.priority-a.priority);
    if(!candidates.length)return null;
    const {d,priority,...choice}=candidates[0];return choice;
  }
  function objectives() {
    const m=missionState();
    if(completed)return {current:'explore',title:secrets.length===6?'The wilds are awake':'Find the hidden echoes',remaining:6-secrets.length};
    if(gateOpen())return {current:'aurora',title:'Climb to the aurora',remaining:1};
    const active=[!m.jellies&&{id:'jellies',x:-26,z:-1,title:'Bring the little lights home',remaining:jellyIds.filter(id=>jellies[id].status!=='delivered').length},
      !m.prisms&&{id:'prisms',x:15,z:-18,title:'Guide the beam through both mirrors',remaining:2-Number(mirrors['mirror-a'].rotation===0)-Number(mirrors['mirror-b'].rotation===1)},
      !m.engine&&{id:'engine',x:25,z:20,title:installed()<2?'Find the two power cells':'Wake the engine',remaining:installed()<2?2-installed():3-engine.beats}].filter(Boolean);
    active.sort((a,b)=>distance(player,a)-distance(player,b));const a=active[0];return {current:a.id,title:a.title,remaining:a.remaining};
  }
  function updateCompanions(dt,events) {
    const nursery=objects.get('nursery');
    for(const [i,id] of jellyIds.entries()) {
      const j=jellies[id];
      if(j.status==='delivered') {
        const angle=elapsed*.3+i*Math.PI*2/3;j.x=nursery.x+Math.cos(angle)*1.5;j.z=nursery.z+Math.sin(angle)*1.5;
      }else if(j.status==='following') {
        if(distance(j,player)>14){j.status='waiting';emit(events,'jelly-waiting',{id,message:'I will wait right here!'});}
        else {
          const offset=(i-1)*.85,target=distance(player,nursery)<5.3
            ?{x:nursery.x+offset,z:nursery.z}
            :{x:player.x-Math.sin(player.yaw)*1.35+Math.cos(player.yaw)*offset,z:player.z-Math.cos(player.yaw)*1.35-Math.sin(player.yaw)*offset};
          const dx=target.x-j.x,dz=target.z-j.z,d=Math.hypot(dx,dz),step=Math.min(d,dt*(3+Math.min(d*2,6)));
          if(d>.01){j.x+=dx/d*step;j.z+=dz/d*step;}
          if(distance(j,nursery)<3.2&&distance(player,nursery)<5.3){j.status='delivered';emit(events,'jelly-delivered',{id,count:jellyIds.filter(id=>jellies[id].status==='delivered').length,message:'Home!'});}
        }
      }
      // Lift smoothly over planters rather than clipping a companion through them.
      let hoverFloor=floorAt(j.x,j.z);
      for(const b of layout.colliders||[]) {
        const dx=Math.max(0,Math.abs(j.x-b.x)-b.width/2),dz=Math.max(0,Math.abs(j.z-b.z)-b.depth/2),edge=Math.hypot(dx,dz);
        if(edge<2)hoverFloor=Math.max(hoverFloor,b.height*(1-edge/2));
      }
      j.y=hoverFloor+1.1+Math.sin(elapsed*2.1+i)*.16;
    }
    for(const id of batteryIds) {
      const b=batteries[id];if(b.status==='carried'){b.x=player.x;b.z=player.z;b.y=player.y+1.9;}
      if(b.status==='installed'){const s=objects.get(b.socketId);b.x=s.x;b.z=s.z;b.y=(s.y||0)+.75;}
    }
  }
  function publish(events){lastEvents=events;return copy(events);}
  function completeChanges(before,events) {
    const after=missionState();
    for(const id of ['jellies','prisms','engine'])if(after[id]&&!before[id])emit(events,'mission-complete',{id,message:id==='jellies'?'Everyone is home!':id==='prisms'?'The crystal is awake!':'The engine is singing!'});
    if(after.jellies&&after.prisms&&after.engine&&!(before.jellies&&before.prisms&&before.engine))emit(events,'gate-open',{id:'aurora-gate',message:'The aurora is ready!'});
  }
  function cancelCharge(events) {
    if(charge.active&&events)emit(events,'charge-cancel');
    charge.active=false;charge.time=0;charge.power=0;charge.points=[];charge.landing=null;charge.safe=true;
  }
  function launch(p,power,quick=false) {
    p.vy=abilities().jumpPower+(quick?0:power*1.6);p.grounded=false;p.boosted=!quick;
    if(!quick){const speed=4.5+6*power;p.vx=charge.aimX*speed;p.vz=charge.aimZ*speed;}
  }
  // Both the actual flight and its preview use these exact swept, substepped rules.
  // Air steering is an optional player correction; the preview shows the unsteered arc.
  function integrate(p,h,input,events) {
    const {ix=0,iz=0,length=0,sprint=false}=input;
    if(p.grounded||!p.boosted){
      const rate=length>.001?15:19,targetSpeed=sprint?7.5:4.5,blend=1-Math.exp(-rate*h);
      p.vx+=(ix*targetSpeed-p.vx)*blend;p.vz+=(iz*targetSpeed-p.vz)*blend;
    }else {
      const drag=Math.exp(-.12*h);p.vx=p.vx*drag+ix*3.2*h;p.vz=p.vz*drag+iz*3.2*h;
      const speed=Math.hypot(p.vx,p.vz);if(speed>12){p.vx*=12/speed;p.vz*=12/speed;}
    }
    if(length>.001){const desired=Math.atan2(ix,iz),d=Math.atan2(Math.sin(desired-p.yaw),Math.cos(desired-p.yaw));p.yaw+=d*(1-Math.exp(-14*h));}
    const previousFloor=floorAt(p.x,p.z);
    p.x+=p.vx*h;p.z+=p.vz*h;
    for(let i=0;i<3;i++)for(const b of boxesFor(p))circleBox(p,b,true);
    const b=layout.bounds;
    const x=clamp(p.x,b.minX+RADIUS,b.maxX-RADIUS),z=clamp(p.z,b.minZ+RADIUS,b.maxZ-RADIUS);
    if(x!==p.x)p.vx=0;if(z!==p.z)p.vz=0;p.x=x;p.z=z;
    const floor=floorAt(p.x,p.z);
    if(p.grounded&&floor<=p.y+STEP_HEIGHT&&floor>=previousFloor-STEP_HEIGHT){p.y=floor;p.vy=0;}
    else{p.grounded=false;p.vy-=GRAVITY*h;p.y+=p.vy*h;
      if(p.y<=floor&&p.vy<=0){const impact=-p.vy;p.y=floor;p.vy=0;p.grounded=true;if(impact>2&&events)emit(events,'land',{power:clamp(impact/12,0,1)});}}
    // Descending beside a ledge must not spend one frame inside its side wall.
    for(let i=0;i<2;i++)for(const b of boxesFor(p))circleBox(p,b,true);
    if(p.grounded)p.boosted=false;
    p.speed=Math.hypot(p.vx,p.vz);
  }
  function predictCharge() {
    const p={...player},points=[[p.x,p.y,p.z]],quick=charge.time<QUICK_CHARGE;
    launch(p,quick?0:charge.power,quick);
    for(let i=0;i<360;i++) {
      integrate(p,1/120,{});
      if(i%5===0||p.grounded)points.push([p.x,p.y,p.z]);
      if(p.grounded)break;
    }
    charge.points=points;charge.landing={x:p.x,y:p.y,z:p.z};charge.safe=p.grounded&&safePoint(p);
  }
  function discoverRoute(id,events) {
    if(visitedRoutes.includes(id))return;
    const route=(layout.routes||[]).find(r=>r.id===id);if(!route||!enabled(route))return;
    visitedRoutes.push(id);emit(events,'route-discovered',{id,petals:visitedRoutes.length,message:'A moonpetal opened in the Atrium.'});
    if(visitedRoutes.length===3)emit(events,'garden-ready',{message:'Three moonpetals! Return to the Atrium.'});
  }
  function checkDiscoveries(events) {
    if(!transport)for(const r of layout.routes||[])if(enabled(r)&&distance(player,r)<2.2&&Math.abs(player.y-r.y)<.55)discoverRoute(r.id,events);
    if(!player.grounded&&!transport)for(const o of objects.values())if(o.kind==='chime'&&enabled(o)&&!chimes.includes(o.id)&&distance(player,o)<1.1&&Math.abs(player.y+.8-o.y)<.7){
      chimes.push(o.id);emit(events,'chime',{id:o.id,count:chimes.length,moontrail:chimes.length>=4,message:chimes.length===4?'The Moontrail is yours!':'A crystal chime!'});
    }
  }
  function startTransport(t,side,events) {
    cancelCharge(events);const from={...t[side]},to={...t[side==='from'?'to':'from']};
    const waypoints=t.waypoints?copy(side==='from'?t.waypoints:[...t.waypoints].reverse()):[from,to];
    transport={id:t.id,kind:t.kind,route:t.route,from,to,waypoints,duration:t.duration,arc:t.arc||0,progress:0,position:{...from}};
    Object.assign(player,from,{vx:0,vy:0,vz:0,speed:0,grounded:false});jumpHeld=false;
    emit(events,'ride-start',{id:t.id,kind:t.kind});
  }
  function advanceTransport(dt,events) {
    transport.progress=Math.min(1,transport.progress+dt/transport.duration);
    const t=transport.progress,segments=transport.waypoints.length-1,index=Math.min(segments-1,Math.floor(t*segments));
    const local=clamp(t*segments-index,0,1),u=local*local*(3-2*local),a=transport.waypoints[index],b=transport.waypoints[index+1];
    transport.position={x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,y:a.y+(b.y-a.y)*u+Math.sin(Math.PI*t)*transport.arc};
    Object.assign(player,transport.position,{vx:0,vy:0,vz:0,speed:0,grounded:false});
    player.yaw=Math.atan2(b.x-a.x,b.z-a.z);
    if(t>=1)finishTransport(events,false);
  }
  function finishTransport(events,cancelled) {
    const t=transport,p=cancelled?(t.progress>=.5?t.to:t.from):t.to;
    Object.assign(player,p,{vx:0,vy:0,vz:0,speed:0,grounded:true});transport=null;cancelCharge();
    if(!cancelled)discoverRoute(t.route,events);
    updateCompanions(0,events);emit(events,'ride-end',{id:t.id,cancelled,x:player.x,y:player.y,z:player.z});
  }
  function recoverInternal(events) {
    const c=safeCheckpoint(checkpoint);player={...player,x:c.x,z:c.z,y:floorAt(c.x,c.z),vx:0,vy:0,vz:0,speed:0,grounded:true};
    for(const [i,id] of jellyIds.entries())if(jellies[id].status==='following'){
      jellies[id].x=player.x+(i-1)*.7;jellies[id].z=player.z+1.5;
    }
    updateCompanions(0,events);jumpHeld=false;transport=null;cancelCharge(events);emit(events,'recover',{x:player.x,y:player.y,z:player.z,message:'Back on the path.'});
  }
  restore(saved);
  return {
    get state(){const m=missionState(),o=objectives();return {elapsed,player:{...player},missions:m,jellies:copy(jellies),mirrors:copy(mirrors),batteries:copy(batteries),
      nearby:nearby(),objectives:o,objectivescurrent:o.title,secrets:[...secrets],checkpoint:{...checkpoint},events:copy(lastEvents),engine:engineState(),gateOpen:gateOpen(),completed,
      carriedBattery:carried(),abilities:abilities(),charge:{active:charge.active,power:charge.power,points:copy(charge.points),landing:charge.landing?{...charge.landing}:null,safe:charge.safe},transport:transport?copy(transport):null,traversal:{unlocked:{jellies:m.jellies,prisms:m.prisms,engine:m.engine},visited:[...visitedRoutes],petals:visitedRoutes.length,gardenAwake,chimes:[...chimes]},progress:{jellies:jellyIds.filter(id=>jellies[id].status==='delivered').length,batteries:installed(),beats:engine.beats,secrets:secrets.length}};},
    step(dt,input={}) {
      const events=[],before=missionState();dt=clamp(finite(dt),0,.25);
      let ix=finite(input.x),iz=finite(input.z),length=Math.hypot(ix,iz);
      if(length>1){ix/=length;iz/=length;length=1;}
      // Cancellation wins even if a press/release arrived during the same frame.
      if(input.cancelCharge)cancelCharge(events);
      else if(!transport) {
        if(input.charge&&!charge.active&&player.grounded){charge.active=true;charge.time=0;charge.power=0;player.vx=0;player.vz=0;emit(events,'charge-start');}
        if(charge.active){
          const ax=finite(input.aimX,Math.sin(player.yaw)),az=finite(input.aimZ,Math.cos(player.yaw)),a=Math.hypot(ax,az);
          if(a>.01){charge.aimX=ax/a;charge.aimZ=az/a;}
          if(input.releaseCharge){const quick=charge.time<QUICK_CHARGE,power=quick?0:charge.power;
            launch(player,power,quick);cancelCharge();emit(events,'charge-release',{power,quick});
          }else if(!input.charge)cancelCharge(events);
        }
      }
      if(input.jump&&!jumpHeld&&player.grounded&&!charge.active&&!transport){player.vy=abilities().jumpPower;player.grounded=false;player.boosted=false;emit(events,'jump',{echoLevel:abilities().echoLevel});}
      jumpHeld=!!input.jump;
      const count=Math.max(1,Math.ceil(dt*120)),h=dt/count;
      for(let n=0;n<count;n++) {
        elapsed+=h;if(engine.started&&engine.beats<3)engine.clock=(engine.clock+h)%2.8;
        if(transport)advanceTransport(h,events);
        else if(charge.active){
          charge.time=Math.min(CHARGE_TIME,charge.time+h);charge.power=clamp((charge.time-QUICK_CHARGE)/(CHARGE_TIME-QUICK_CHARGE),0,1);
          player.vx=0;player.vz=0;player.speed=0;
          const desired=Math.atan2(charge.aimX,charge.aimZ),d=Math.atan2(Math.sin(desired-player.yaw),Math.cos(desired-player.yaw));player.yaw+=d*(1-Math.exp(-14*h));
        }else integrate(player,h,{ix,iz,length,sprint:input.sprint},events);
        updateCompanions(h,events);
        checkDiscoveries(events);
      }
      if(charge.active)predictCharge();
      if(player.grounded&&!transport)for(const c of layout.checkpoints||[])if(distance(player,c)<3.5&&safePoint(c))checkpoint={...c};
      for(const o of objects.values())if(o.kind==='secret'&&!secrets.includes(o.id)&&distance(player,o)<1.6&&Math.abs(player.y-(o.y||floorAt(o.x,o.z)))<2){
        secrets.push(o.id);emit(events,'secret',{id:o.id,count:secrets.length,echoLevel:abilities().echoLevel,message:secrets.length%2===0?'A pair of echoes! Your hop grew higher!':'A hidden echo! Find its partner for a higher hop.'});
      }
      if(!Number.isFinite(player.x)||!Number.isFinite(player.y)||!Number.isFinite(player.z)||player.y<-8)recoverInternal(events);
      completeChanges(before,events);return publish(events);
    },
    interact() {
      const events=[],before=missionState();cancelCharge(events);
      if(transport){finishTransport(events,true);return publish(events);}
      const n=nearby();if(!n)return publish(events);const id=n.id;
      if(n.kind==='transport'){
        const [tid,side]=id.split(':'),t=(layout.transports||[]).find(t=>t.id===tid);
        if(enabled(t))startTransport(t,side,events);else emit(events,'hint',{id,message:n.label});
        return publish(events);
      }
      if(n.kind==='garden'&&visitedRoutes.length===3&&!gardenAwake){gardenAwake=true;emit(events,'garden-awake',{message:'The moon garden is blooming!'});}
      else if(n.kind==='jelly'){const j=jellies[id];j.status=j.status==='following'?'waiting':'following';emit(events,'jelly-follow',{id,following:j.status==='following',message:j.status==='following'?'Follow me!':'I will wait here.'});}
      else if(n.kind==='mirror') {
        if(!prismSolved){mirrors[id].rotation=(mirrors[id].rotation+1)%4;prismSolved=mirrors['mirror-a'].rotation===0&&mirrors['mirror-b'].rotation===1;updateMirrors();emit(events,'mirror-turn',{id,rotation:mirrors[id].rotation});}
      }else if(n.kind==='battery'){
        if(!carried()){batteries[id].status='carried';emit(events,'pickup',{id,message:`Find the ${COLORS[id]} socket.`});}
        else emit(events,'hint',{id,message:'Place this cell in its matching socket first.'});
      }else if(n.kind==='socket'){
        const bid=id.replace('socket','battery');
        if(carried()===bid){batteries[bid].status='installed';batteries[bid].socketId=id;emit(events,'install',{id,batteryId:bid,message:installed()===2?'Both cells are home. Wake the engine!':'One more power cell!'});}
        else emit(events,'hint',{id,message:`This socket needs the ${COLORS[bid]} cell.`});
      }else if(n.kind==='console'){
        if(installed()<2)emit(events,'hint',{id,message:'Two colors, two sockets. Find both power cells.'});
        else if(engine.beats<3){
          if(!engine.started){engine.started=true;engine.clock=0;emit(events,'engine-start',{id,message:'Tap when the ring glows.'});}
          else if(engineState().ready){engine.beats++;engine.clock=0;emit(events,'engine-beat',{id,beat:engine.beats,message:engine.beats===3?'It is awake!':`${engine.beats} of 3!`});}
          else emit(events,'engine-wait',{id,message:'Wait for the big glow. You kept your beats!'});
        }
      }else if(n.kind==='heart'&&gateOpen()&&!completed){completed=true;emit(events,'complete',{id,message:'You brought the aurora back!'});}
      else if(n.kind==='guide')emit(events,'hint',{id,message:completed?'There are six hidden echoes. Keep exploring!':gateOpen()?'All three wonders are awake. Follow the path up the spire!':'Bring the little lights home, guide the crystal beam, or wake the engine. Pick any path!'});
      else emit(events,'hint',{id,message:n.label});
      updateCompanions(0,events);completeChanges(before,events);return publish(events);
    },
    recover(){const events=[];recoverInternal(events);return publish(events);},
    serialize(){const p=transport?{...player,...transport.from}:player;return {version:1,worldId:layout.id,elapsed,player:{x:p.x,y:p.y,z:p.z,yaw:p.yaw},checkpoint:{...checkpoint},
      jellies:copy(jellies),mirrors:copy(mirrors),batteries:copy(batteries),engine:{...engine},secrets:[...secrets],completed,traversal:{visited:[...visitedRoutes],gardenAwake},chimes:[...chimes]};}
  };
}
