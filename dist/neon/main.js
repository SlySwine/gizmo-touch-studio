import * as THREE from 'three';
import {EffectComposer} from '../vendor/postprocessing/EffectComposer.js';
import {RenderPass} from '../vendor/postprocessing/RenderPass.js';
import {UnrealBloomPass} from '../vendor/postprocessing/UnrealBloomPass.js';
import {OutputPass} from '../vendor/postprocessing/OutputPass.js';
import {createNeonModel} from './model.js';
import {createNeonScene} from './scene.js';
import {createNeonCharacter} from './character.js';
import {createCameraRig} from './camera.js';
import {createWorldAudio} from './audio.js';
import {createJourneyStorage} from './journey-storage.js';
const $=id=>document.getElementById(id),canvas=$('world'),coarse=matchMedia('(pointer:coarse)').matches;
const SAVE_KEY='gizmo-neon-wilds-v1', embedded=parent!==window;
let model,world,character,journeys,ready=false,paused=false,muted=false,runToggle=false,jump=false,tracked='jellies',celebrated=false,saveBlocked=false;
try{muted=localStorage.getItem('gizmo-sound-enabled')==='false';}catch{}
let time=0,last=0,saveAt=0,hudAt=0,commentUntil=0,moved=0,resizePending=true;
let introBounce=false,rideCamera=null,arrivalCamera=null;
const keys=new Set(),stick={x:0,y:0,id:null,cx:0,cy:0},lookDrag={id:null,x:0,y:0};
const chargeInput={held:false,release:false,cancel:false,pointerId:null};
const orbit={yaw:0,pitch:.28,distance:9};
const camera=new THREE.PerspectiveCamera(58,1,.12,180),scene=new THREE.Scene();
let cameraRig;const target=new THREE.Vector3();
const renderer=new THREE.WebGLRenderer({canvas,antialias:!coarse,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,coarse?1.25:1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.info.autoReset=false;
renderer.shadowMap.enabled=!coarse;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.36,.45,1.05);composer.addPass(bloom);composer.addPass(new OutputPass());
let layout,initialCamera=true,pendingGroom=null,lastStepSound=0;
const audio=createWorldAudio();audio.setMuted(muted);
function comment(text,seconds=5){$('comment').textContent=text;commentUntil=time+seconds;}
function refreshIntroduction(){
 const state=model.state;
 let learned=false;try{learned=localStorage.getItem('gizmo-neon-bounce-seen')==='true';}catch{}
 introBounce=!learned&&!Object.values(state.missions).some(Boolean)&&!state.traversal?.chimes?.includes('chime-1');
 rideCamera=arrivalCamera=null;
}
function showCelebration(){
 $('celebration').querySelector('p').textContent=model.state.traversal?.gardenAwake?'The garden is blooming. The hidden echoes are still out there.':'New paths are awake. The moon garden is waiting.';
 celebrated=true;$('celebration').showModal();clearInput();
}
function save(){if(!model)return;try{journeys?.getBackup();localStorage.setItem(SAVE_KEY,JSON.stringify(model.serialize()));saveBlocked=false;}catch{saveBlocked=true;}$('save-note').textContent=saveBlocked?'Saving unavailable in this browser.':'Your journey saves here.';}
function tone(kind,power){audio.play(kind,power);}
function unlock(){audio.unlock();}
function events(list=[]){world?.handleEvents?.(list);for(const event of list){
 const type=event.type;
 if(event.message)comment(event.message,6);
 else if(type==='jelly-follow'||type==='recruit')comment('Come along, little glowbug.');
 else if(type==='jelly-delivered'||type==='deliver')comment('Home sweet jelly-home.');
 else if(type==='secret')comment('A hidden echo. This place remembers us.',6);
 else if(type==='recover')comment('Safe and fluffy. Nothing lost.');
 else if(type==='battery-pickup')comment('One very important delivery.');
 else if(type==='mirror')comment('Follow the light.');
 if(type==='mission-complete'){introBounce=false;setTrack(event.id);}
 if(type==='route-discovered'||type==='garden-awake')setTrack(nextJourneyGoal(model.state));
 if(type==='ride-start'){rideCamera={id:event.id,manual:false};arrivalCamera=null;}
 if(type==='ride-end'){
  if(rideCamera?.id==='jelly-ferry'&&!rideCamera.manual&&!event.cancelled&&event.y>2)arrivalCamera={yaw:Math.PI,pitch:.23,until:time+2};
  rideCamera=null;
 }
 if(type==='charge-start')$('hop').dataset.charging='true';
 if(type==='charge-release'&&!event.quick){introBounce=false;try{localStorage.setItem('gizmo-neon-bounce-seen','true');}catch{}}
 if(type==='charge-release'||type==='charge-cancel')$('hop').dataset.charging='false';
 if(type==='complete'||type==='victory'||type==='aurora'){tone('complete');if(!celebrated)showCelebration();}
 else if(/solved|mission|delivered|install|engine-beat|garden-awake/.test(type))tone('complete');
 else if(type==='charge-release'||type==='land')tone(type,event.power);
 else if(/secret|chime|route-discovered/.test(type))tone('secret');else if(/miss|blocked/.test(type))tone('bad');else if(!/jump|land|checkpoint|move|charge/.test(type))tone('action');
 }if(list.some(e=>!/jump|land|move|charge/.test(e.type)))save();}
function clearInput(){keys.clear();stick.x=stick.y=0;stick.id=null;lookDrag.id=null;jump=false;chargeInput.held=false;chargeInput.release=false;chargeInput.cancel=true;chargeInput.pointerId=null;audio.updateCharge(null);$('stick').style.transform='';}
function beginCharge(){if(!ready||paused||model.state.transport)return;unlock();chargeInput.cancel=false;chargeInput.held=true;}
function releaseCharge(){if(chargeInput.held){chargeInput.held=false;chargeInput.release=true;}}
function action(){if(!ready||paused)return;chargeInput.held=false;chargeInput.release=false;chargeInput.cancel=true;unlock();events(model.interact());syncHUD();}
function recover(){if(!ready)return;clearInput();rideCamera=arrivalCamera=null;events(model.recover());initialCamera=true;save();syncHUD();}
function closeMap(){$('map-dialog').close();canvas.focus({preventScroll:true});clearInput();}
function syncBackup(){try{$('restore-journey').hidden=!journeys?.getBackup();}catch{$('restore-journey').hidden=true;}}
function toggleMap(){syncBackup();if($('map-dialog').open)closeMap();else{clearInput();$('map-dialog').showModal();drawMap();}}
function setTrack(id){
 tracked=id;world?.demonstrate?.(id);
 document.querySelectorAll('[data-quest]').forEach(b=>b.dataset.tracked=String(b.dataset.quest===id));
 if($('map-dialog').open)closeMap();
 const messages={jellies:'Three little jellies wandered off. Let’s bring them home.',prisms:'Turn the crystals. Help the light find its way.',engine:'Two batteries. One sleepy machine.',aurora:'The three paths lead to the Aurora Spire.',garden:'The sleeping garden remembers every path.',explore:'A whole night to explore.'};
 const rewards={jellies:'They have a ride for us. Next stop: the overlook.',prisms:'A bridge made of light. Let’s cross it.',engine:'The lift is awake. Up to the sky terrace!'};
 comment(model&&isDone(model.state,id)?rewards[id]||messages[id]:messages[id]||'Let’s have a look.');
}
$('interact').addEventListener('click',action);$('recover').addEventListener('click',recover);$('map-toggle').addEventListener('click',toggleMap);$('map-close').addEventListener('click',closeMap);
$('map-dialog').addEventListener('close',clearInput);
let restartOrigin='game',restartInvoker=null;
function openRestart(event){
 if(!ready||paused)return;
 restartOrigin=$('celebration').open?'finale':$('map-dialog').open?'map':'game';restartInvoker=event.currentTarget;
 $('map-dialog').close();$('celebration').close();$('restart-error').hidden=true;$('restart-error').textContent='';
 $('restart-dialog').returnValue='';$('restart-dialog').showModal();clearInput();
}
for(const id of ['restart-game','play-again','new-journey'])$(id).addEventListener('click',openRestart);
function acceptJourney(snapshot){
 model=createNeonModel(layout,snapshot);refreshIntroduction();celebrated=!!model.state.completed;initialCamera=true;clearInput();
 saveBlocked=false;saveAt=time;$('save-note').textContent='Your journey saves here.';
}
$('restore-journey').addEventListener('click',()=>{
 let backup;try{backup=journeys.restore(model.serialize());}catch{$('save-note').textContent='Could not switch journeys. Try again; your current adventure is still here.';return;}
 acceptJourney(backup);closeMap();setTrack(nextJourneyGoal(model.state));syncHUD();comment('Back to your previous adventure.');
});
$('restart-cancel').addEventListener('click',()=>$('restart-dialog').close('cancel'));
$('restart-dialog').addEventListener('close',()=>{
 clearInput();
 if($('restart-dialog').returnValue==='replay'){canvas.focus();return;}
 if(restartOrigin==='finale')$('celebration').showModal();
 else if(restartOrigin==='map')toggleMap();
 restartInvoker?.focus({preventScroll:true});
});
$('restart-confirm').addEventListener('click',()=>{
 let fresh;try{fresh=journeys.reset(model.serialize());}catch{$('restart-error').textContent='Could not start again right now. Your current adventure is still here. Please try again.';$('restart-error').hidden=false;return;}
 acceptJourney(fresh);tracked='jellies';orbit.yaw=0;orbit.pitch=.28;$('restart-dialog').close('replay');setTrack('jellies');syncHUD();comment('Here we go again.');
});$('celebration').addEventListener('close',clearInput);
$('keep-exploring').addEventListener('click',()=>{$('celebration').close();canvas.focus();});
$('hop').addEventListener('pointerdown',e=>{e.preventDefault();if(chargeInput.pointerId!==null)return;chargeInput.pointerId=e.pointerId;$('hop').setPointerCapture(e.pointerId);beginCharge();});
$('hop').addEventListener('pointerup',e=>{if(e.pointerId!==chargeInput.pointerId)return;chargeInput.pointerId=null;releaseCharge();});
for(const event of ['pointercancel','lostpointercapture'])$('hop').addEventListener(event,e=>{if(e.pointerId!==chargeInput.pointerId)return;chargeInput.pointerId=null;chargeInput.held=false;chargeInput.release=false;chargeInput.cancel=true;});
// Native keyboard button activation remains a quick hop; holding Space on the canvas charges.
$('hop').addEventListener('click',e=>{if(e.detail===0){beginCharge();releaseCharge();}});
$('run').addEventListener('click',()=>{runToggle=!runToggle;$('run').setAttribute('aria-pressed',String(runToggle));});
$('recenter').addEventListener('click',()=>{if(rideCamera)rideCamera.manual=true;arrivalCamera=null;orbit.yaw=(model?.state.player.yaw||0)+Math.PI;orbit.pitch=.28;});
$('sound').addEventListener('click',()=>{muted=!muted;try{localStorage.setItem('gizmo-sound-enabled',String(!muted));}catch{}if(embedded)parent.postMessage({type:'neon-sound',muted},location.origin);syncSound();if(!muted)unlock();});
function syncSound(){audio.setMuted(muted);$('sound').setAttribute('aria-pressed',String(!muted));$('sound').setAttribute('aria-label',muted?'Enable sound':'Mute sound');$('sound').textContent=muted?'♪':'♫';}
$('studio-return').addEventListener('click',()=>{save();clearInput();paused=true;audio?.suspend();if(embedded)parent.postMessage({type:'neon-studio'},location.origin);else location.href='./index.html';});
document.addEventListener('click',event=>{if(event.detail>0&&event.target.closest('button')&&!paused&&!$('map-dialog').open&&!$('celebration').open&&!$('restart-dialog').open)canvas.focus({preventScroll:true});});
$('tutorial').querySelector('button').addEventListener('click',()=>{$('tutorial').hidden=true;try{localStorage.setItem('gizmo-neon-controls-seen','true');}catch{}});
if(coarse){const close=$('tutorial').querySelector('button');$('tutorial').replaceChildren(document.createTextNode('Move: left thumb · Look: drag'),close);}document.querySelectorAll('[data-quest]').forEach(b=>b.addEventListener('click',()=>{introBounce=false;setTrack(b.dataset.quest);}));
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='m'&&$('map-dialog').open&&!e.repeat){e.preventDefault();closeMap();return;}if(e.target.closest('input,select')||(e.target.closest('button')&&[' ','Enter'].includes(e.key))||$('map-dialog').open||$('celebration').open||$('restart-dialog').open)return;if(paused)return;
 const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift',' ','e','r','m'].includes(k)){e.preventDefault();unlock();}
 if(k==='e'&&!e.repeat)action();else if(k==='r'&&!e.repeat)recover();else if(k==='m'&&!e.repeat)toggleMap();else if(k===' '&&!e.repeat)beginCharge();else if(k==='escape')clearInput();else keys.add(k);
});window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());if(e.key===' ')releaseCharge();});window.addEventListener('blur',()=>{clearInput();save();});
document.addEventListener('visibilitychange',()=>{clearInput();save();if(document.hidden)audio?.suspend();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(!ready||paused)return;if(rideCamera)rideCamera.manual=true;arrivalCamera=null;canvas.focus({preventScroll:true});unlock();if(lookDrag.id!==null)return;lookDrag.id=e.pointerId;lookDrag.x=e.clientX;lookDrag.y=e.clientY;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==lookDrag.id)return;orbit.yaw-=(e.clientX-lookDrag.x)*.006;orbit.pitch=THREE.MathUtils.clamp(orbit.pitch+(e.clientY-lookDrag.y)*.004,.18,1.05);lookDrag.x=e.clientX;lookDrag.y=e.clientY;});
function endLook(e){if(e.pointerId===lookDrag.id)lookDrag.id=null;}for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,endLook);
canvas.addEventListener('wheel',e=>{e.preventDefault();if(rideCamera)rideCamera.manual=true;arrivalCamera=null;orbit.distance=THREE.MathUtils.clamp(orbit.distance+e.deltaY*.01,5,13);},{passive:false});
$('joystick').addEventListener('pointerdown',e=>{e.preventDefault();if(stick.id!==null)return;unlock();stick.id=e.pointerId;const r=$('joystick').getBoundingClientRect();stick.cx=r.left+r.width/2;stick.cy=r.top+r.height/2;$('joystick').setPointerCapture(e.pointerId);updateStick(e);});
function updateStick(e){if(stick.id!==e.pointerId)return;const dx=e.clientX-stick.cx,dy=e.clientY-stick.cy,length=Math.hypot(dx,dy),range=36,scale=length>range?range/length:1;stick.x=dx*scale/range;stick.y=dy*scale/range;$('stick').style.transform=`translate(${dx*scale}px,${dy*scale}px)`;}
$('joystick').addEventListener('pointermove',updateStick);for(const event of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(event,e=>{if(e.pointerId===stick.id){stick.id=null;stick.x=stick.y=0;$('stick').style.transform='';}});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent)return;const d=e.data||{};if(d.type==='neon-groom'){pendingGroom=d.groom;character?.setGroom(d.groom);}if(d.type==='neon-resume'){paused=false;muted=d.muted===true;syncSound();last=performance.now();canvas.focus();}if(d.type==='neon-pause'){paused=true;clearInput();save();audio?.suspend();}});
function nextJourneyGoal(s){
 const unfinished=['jellies','prisms','engine'].filter(id=>!isDone(s,id));
 if(unfinished.length)return unfinished.includes(s.objectives.current)?s.objectives.current:unfinished[0];
 const route=layout.routes?.find(r=>!s.traversal?.visited?.includes(r.id));
 if(route)return route.requires;
 if(s.traversal?.petals>=3&&!s.traversal.gardenAwake)return 'garden';
 return s.completed?'explore':'aurora';
}
function objective(s){const objects=layout.objects;const obj=id=>objects.find(o=>o.id===id);if(introBounce)return {...obj('chime-1'),name:'Bounce'};if(tracked==='garden')return {...layout.garden,name:'Moon garden'};if(tracked==='aurora')return {...obj('aurora-heart'),name:'Aurora Spire'};
 if(['jellies','prisms','engine'].includes(tracked)&&isDone(s,tracked)){
  const route=layout.routes?.find(r=>r.requires===tracked);
  if(route&&!s.traversal?.visited?.includes(route.id)){
   const transport=layout.transports?.find(t=>t.requires===tracked);
   return transport?{...(s.transport?transport.to:transport.from),name:transport.name}:{...route,name:route.name};
  }
  return null;
 }
 if(s.completed||tracked==='explore')return null;
 if(tracked==='jellies'){const js=Object.entries(s.jellies||{});if(js.some(([,j])=>j.status==='following'))return obj('nursery');const waiting=js.filter(([,j])=>j.status==='waiting');if(waiting.length)return waiting.reduce((a,b)=>Math.hypot(b[1].x-s.player.x,b[1].z-s.player.z)<Math.hypot(a[1].x-s.player.x,a[1].z-s.player.z)?b:a)[1];return obj('nursery');}
 if(tracked==='prisms'){return obj(s.mirrors?.['mirror-a']?.rotation===0?'mirror-b':'mirror-a');}
 const bs=Object.entries(s.batteries||{});const carried=bs.find(([,b])=>b.status==='carried');if(carried)return obj(carried[0].replace('battery','socket'));const waiting=bs.filter(([,b])=>b.status==='waiting');return waiting.length?waiting[0][1]:obj('foundry-console');}
function isDone(s,id){const v=s.missions[id];return v===true||v?.complete===true||v?.completed===true;}
function syncHUD(){if(!model)return;const s=model.state,near=s.nearby;$('interact').disabled=!near;$('interact').querySelector('span').textContent=near?.label||'Explore';
 const district=layout.districts.reduce((a,b)=>Math.hypot(b.x-s.player.x,b.z-s.player.z)<Math.hypot(a.x-s.player.x,a.z-s.player.z)?b:a);$('district').textContent=district.name;
 const delivered=Object.values(s.jellies||{}).filter(j=>j.status==='delivered').length;
 for(const b of document.querySelectorAll('.quest-tabs button')){const id=b.dataset.quest,done=isDone(s,id),route=layout.routes?.find(r=>r.requires===id),visited=s.traversal?.visited?.includes(route?.id);b.dataset.done=String(done);b.querySelector('span').textContent=done?(visited?'Awake':({jellies:'Ride',prisms:'Cross',engine:'Lift'})[id]):id==='jellies'?`${delivered} / 3`:id==='prisms'?'Prisms':'Engine';}
 const goal=objective(s);$('compass').querySelector('i').hidden=!goal;if(!goal){$('compass').querySelector('span').textContent='Keep exploring';$('compass').querySelector('small').textContent=`${s.secrets.length} / 6 echoes`;}if(goal){const dx=goal.x-s.player.x,dz=goal.z-s.player.z,angle=Math.atan2(dx,-dz)+orbit.yaw;$('compass').querySelector('i').style.transform=`rotate(${angle}rad)`;$('compass').querySelector('span').textContent=goal.name||({jellies:'Little jellies',prisms:'Crystal light',engine:'Pulse engine',aurora:'Aurora Spire',garden:'Moon garden'})[tracked];$('compass').querySelector('small').textContent=`${Math.round(Math.hypot(dx,dz))} m`;}
 const engine=s.engine||{};const consoleNear=near?.id==='foundry-console';$('pulse').hidden=!consoleNear||isDone(s,'engine')||!engine.started;$('pulse').dataset.ready=String(engine.ready||engine.inWindow);$('pulse').querySelector('i').style.left=`${(engine.pulse||0)*100}%`;$('pulse').querySelector('b').textContent=`${engine.beats||0} / 3`;
 const secrets=Array.isArray(s.secrets)?s.secrets.length:Number(s.secrets?.count)||0;$('secret-count').textContent=`${secrets} / 6 echoes · ${s.traversal?.petals||0} / 3 petals`;
 $('hop').style.setProperty('--charge',`${Math.round((s.charge?.power||0)*100)}%`);$('hop').dataset.charging=String(!!s.charge?.active);$('hop').disabled=!!s.transport;
 $('hop').setAttribute('aria-label',s.charge?.active?'Release to bounce. Escape cancels.':'Bounce: tap to hop, hold then release to leap');
 $('bounce-hint').hidden=!introBounce;$('hop').dataset.demonstration=world?.guidance?.teachingPhase||'';
 document.querySelector('[data-quest="garden"]').disabled=!(s.traversal?.petals>=3);
 if(s.completed&&!celebrated)showCelebration();
 if($('map-dialog').open)drawMap();
}
function drawMap(){if(!layout||!model)return;const map=$('map-canvas'),ctx=map.getContext('2d'),s=model.state;const p=(x,z)=>[300+x*5.7,275+z*5.7];ctx.clearRect(0,0,600,550);ctx.fillStyle='#071124';ctx.fillRect(0,0,600,550);
 ctx.strokeStyle='#1c3450';ctx.lineWidth=1;for(let i=-40;i<=40;i+=10){ctx.beginPath();ctx.moveTo(...p(i,-44));ctx.lineTo(...p(i,38));ctx.stroke();ctx.beginPath();ctx.moveTo(...p(-44,i));ctx.lineTo(...p(44,i));ctx.stroke();}
 for(const d of layout.districts){ctx.strokeStyle=d.color+'55';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(...p(0,4));ctx.lineTo(...p(d.x,d.z));ctx.stroke();ctx.fillStyle=d.color;ctx.beginPath();ctx.arc(...p(d.x,d.z),d.id==='hub'?6:10,0,Math.PI*2);ctx.fill();ctx.font='11px Arial';ctx.textAlign='center';ctx.fillStyle='#dbeafb';ctx.fillText(d.name,...p(d.x,d.z-4));}
 ctx.fillStyle='#31425c';for(const c of layout.colliders){const [x,z]=p(c.x-c.width/2,c.z-c.depth/2);ctx.fillRect(x,z,c.width*5.7,c.depth*5.7);}
 for(const surface of layout.surfaces){ctx.fillStyle=surface.requires&&!isDone(s,surface.requires)?'#293554':'#506783';const [x,z]=p(surface.x-surface.width/2,surface.z-surface.depth/2);ctx.fillRect(x,z,surface.width*5.7,surface.depth*5.7);}
 for(const ride of layout.transports||[]){ctx.strokeStyle=isDone(s,ride.requires)?'#b6fae2':'#3b4760';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(...p(ride.from.x,ride.from.z));ctx.lineTo(...p(ride.to.x,ride.to.z));ctx.stroke();ctx.setLineDash([]);}
 for(const route of layout.routes||[]){ctx.fillStyle=s.traversal?.visited?.includes(route.id)?'#b6fae2':isDone(s,route.requires)?route.color:'#4d5972';ctx.beginPath();ctx.arc(...p(route.x,route.z),5,0,Math.PI*2);ctx.fill();}
 const goal=objective(s);if(goal){ctx.strokeStyle='#e2fff5';ctx.lineWidth=2;ctx.beginPath();ctx.arc(...p(goal.x,goal.z),16,0,Math.PI*2);ctx.stroke();}
 const [x,z]=p(s.player.x,s.player.z);ctx.save();ctx.translate(x,z);ctx.rotate(-s.player.yaw+Math.PI);ctx.fillStyle='#ff78bf';ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(7,7);ctx.lineTo(0,4);ctx.lineTo(-7,7);ctx.closePath();ctx.fill();ctx.restore();
}
function updateCamera(dt,s){
 if(arrivalCamera){const difference=Math.atan2(Math.sin(arrivalCamera.yaw-orbit.yaw),Math.cos(arrivalCamera.yaw-orbit.yaw));orbit.yaw+=difference*(1-Math.exp(-dt*2.5));orbit.pitch+=(arrivalCamera.pitch-orbit.pitch)*(1-Math.exp(-dt*2.5));if(time>arrivalCamera.until)arrivalCamera=null;}
 cameraRig.update(s.player,orbit,dt,initialCamera);target.copy(cameraRig.target);initialCamera=false;
}
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);composer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();resizePending=false;clearInput();}
window.addEventListener('resize',()=>resizePending=true);
async function start(){try{layout=await fetch('./neon/world.json').then(r=>{if(!r.ok)throw Error('World layout unavailable');return r.json();});
 journeys=createJourneyStorage({storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)},key:SAVE_KEY,layout});
 try{journeys.getBackup();}catch{}
 let saved;try{saved=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');}catch{}model=createNeonModel(layout,saved);celebrated=!!model.state.completed;
 refreshIntroduction();
 [world,character]=await Promise.all([createNeonScene({scene,renderer,layout,coarse,camera}),createNeonCharacter({scene,coarse})]);if(pendingGroom)character.setGroom(pendingGroom);
 cameraRig=createCameraRig(camera,world.occluders);ready=true;resize();$('loading').hidden=true;canvas.focus({preventScroll:true});try{$('tutorial').hidden=localStorage.getItem('gizmo-neon-controls-seen')==='true';}catch{}syncSound();setTrack(saved?nextJourneyGoal(model.state):'jellies');comment(saved?'Welcome back. The sanctuary remembers.':'Three sleeping paths. Let’s wake this place up.',8);if(embedded)parent.postMessage({type:'neon-ready'},location.origin);syncHUD();
 }catch(error){console.error(error);$('loading').innerHTML='<span>The sanctuary could not load.</span><button id="reload-world">Try again</button>';$('reload-world').addEventListener('click',()=>location.reload());}}
function tick(now){requestAnimationFrame(tick);let dt=Math.min(.05,Math.max(0,(now-last)/1000||.016));last=now;if(!ready||paused||document.hidden)return;if(resizePending)resize();time+=dt;
 const modal=$('map-dialog').open||$('celebration').open||$('restart-dialog').open;let side=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+stick.x,forward=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0)-stick.y;
 const length=Math.hypot(side,forward);if(length>.05)arrivalCamera=null;if(length>1){side/=length;forward/=length;}if(modal){side=forward=0;jump=false;}
 const x=Math.cos(orbit.yaw)*side-Math.sin(orbit.yaw)*forward,z=-Math.sin(orbit.yaw)*side-Math.cos(orbit.yaw)*forward;
 const input={x,z,sprint:runToggle||keys.has('shift'),jump,charge:!modal&&(chargeInput.held||chargeInput.release),releaseCharge:!modal&&chargeInput.release,cancelCharge:chargeInput.cancel||modal,aimX:length>.05?x:-Math.sin(orbit.yaw),aimZ:length>.05?z:-Math.cos(orbit.yaw)};
 jump=false;chargeInput.release=false;chargeInput.cancel=false;
 events(model.step(dt,input));const s=model.state;world.update(time,dt,{...s,tracked,introBounce});audio.updateCharge(s.charge);updateCamera(dt,s);character.update(time,dt,{...s,camera});
 if(length>.1){moved+=dt;if(moved>8){$('tutorial').hidden=true;try{localStorage.setItem('gizmo-neon-controls-seen','true');}catch{}}if(s.player.grounded&&time-lastStepSound>.34){lastStepSound=time;tone('step');}}
 if(time>commentUntil)$('comment').textContent='';if(time-hudAt>.10){syncHUD();hudAt=time;}if(time-saveAt>2){save();saveAt=time;}
 renderer.info.reset();composer.render();}
window.neon={get state(){return {ready,paused,muted,tracked,introBounce,guidance:world?.guidance||null,camera:{yaw:orbit.yaw,pitch:orbit.pitch,distance:camera.position.distanceTo(target),position:camera.position.toArray()},...(model?.state||{}),character:character?.state||null,render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},saveBlocked};}};
window.addEventListener('pagehide',save);start();requestAnimationFrame(tick);
