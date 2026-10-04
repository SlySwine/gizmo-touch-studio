import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNeonModel} from '../dist/neon/model.js';

const world = JSON.parse(fs.readFileSync(new URL('../dist/neon/world.json', import.meta.url)));
const near = (id, dx=0, dz=2) => {
  const layout = structuredClone(world), o = layout.objects.find(o=>o.id===id);
  layout.spawn={x:o.x+dx,z:o.z+dz}; return layout;
};
const run = (m,seconds,input={}) => {for(let i=0;i<Math.ceil(seconds*120);i++) m.step(1/120,input);};
function walk(m,x,z,{sprint=true}={}) {
  for(let i=0;i<5000;i++) {
    const p=m.state.player,dx=x-p.x,dz=z-p.z,d=Math.hypot(dx,dz);
    if(d<.16){run(m,.3);return;}
    const scale=Math.min(1,d*1.5);
    m.step(1/60,{x:dx/d*scale,z:dz/d*scale,sprint});
  }
  assert.fail(`Could not walk to ${x},${z}; stopped at ${JSON.stringify(m.state.player)}`);
}
const path=(m,points)=>{for(const [x,z]of points)walk(m,x,z);};
function activate(m,id,times=1) {assert.equal(m.state.nearby?.id,id);for(let i=0;i<times;i++)m.interact();}
function solveEngine(m) {
  path(m,[[0,14],[10,23],[19,24]]);activate(m,'battery-a');
  path(m,[[23,24],[23,19]]);activate(m,'socket-a');
  path(m,[[32,20],[31,14]]);activate(m,'battery-b');
  path(m,[[32,20],[27,19]]);activate(m,'socket-b');
  walk(m,25,24);activate(m,'foundry-console');
  for(let i=0;i<3;i++){run(m,.7);activate(m,'foundry-console');}
  assert.equal(m.state.missions.engine,true);path(m,[[10,23],[0,14]]);
}
function solvePrisms(m) {
  path(m,[[0,14],[0,-3],[30,-3],[30,-24],[17,-24]]);activate(m,'mirror-b',3);
  walk(m,15,-15);activate(m,'mirror-a',3);
  assert.equal(m.state.missions.prisms,true);path(m,[[15,-6],[0,-3],[0,14]]);
}
function solveJellies(m) {
  path(m,[[0,14],[0,0],[-18,-2],[-18,-12]]);activate(m,'jelly-b');
  path(m,[[-18,-17],[-33,-14],[-33,-13]]);activate(m,'jelly-a');
  path(m,[[-41,-11],[-41,3],[-35,6]]);activate(m,'jelly-c');
  assert.equal(Object.values(m.state.jellies).filter(j=>j.status==='following').length,3);
  path(m,[[-30,5],[-26,2]]);run(m,1.5);assert.equal(m.state.missions.jellies,true);
  path(m,[[-18,-2],[0,0],[0,14]]);
}

test('walking accelerates, is normalized diagonally, and stops without drift',()=>{
  const a=createNeonModel(world),b=createNeonModel(world);
  run(a,1,{x:1,z:0});run(b,1,{x:1,z:1});
  assert.ok(Math.abs(a.state.player.speed-b.state.player.speed)<.001);
  assert.ok(a.state.player.x>3);run(a,2);assert.ok(a.state.player.speed<.001);
});

test('circle collision slides along boxes and cannot tunnel through them',()=>{
  const layout=structuredClone(world);layout.spawn={x:18,z:-18};
  const m=createNeonModel(layout);run(m,2,{x:1,z:.25,sprint:true});
  assert.ok(m.state.player.x<20.21);assert.ok(m.state.player.z>-17);
  const blocked=createNeonModel(layout);blocked.step(.25,{x:1,z:0,sprint:true});
  assert.ok(blocked.state.player.x<20.21);
});

test('jump requires a new press, bounds hold, and recovery preserves progress',()=>{
  const m=createNeonModel(world);run(m,.15,{jump:true});assert.ok(m.state.player.y>.3);
  run(m,3,{jump:true});assert.equal(m.state.player.grounded,true);assert.equal(m.state.player.y,0);
  run(m,1,{jump:false});run(m,.15,{jump:true});assert.ok(m.state.player.y>.3);
  run(m,30,{x:1,sprint:true});assert.ok(m.state.player.x<=world.bounds.maxX-.55);
  m.recover();assert.equal(m.state.player.grounded,true);assert.equal(m.state.player.y,0);
});

test('mirror rotations form a persistent two-bend beam puzzle',()=>{
  const m=createNeonModel(near('mirror-a'));
  assert.equal(m.state.nearby.id,'mirror-a');
  m.interact();m.interact();m.interact();assert.equal(m.state.mirrors['mirror-a'].rotation,0);
  assert.equal(m.state.mirrors['mirror-b'].lit,true);
  assert.equal(m.state.missions.prisms,false);
  const saved=m.serialize();saved.player={x:15,y:0,z:-22,yaw:0};
  const n=createNeonModel(world,saved);n.interact();n.interact();n.interact();
  assert.equal(n.state.missions.prisms,true);
  assert.equal(n.state.mirrors['mirror-a'].rotation,0);
  n.interact();assert.equal(n.state.mirrors['mirror-b'].rotation,1);
});

test('followers move while idle, reach the nursery, and survive save/recovery',()=>{
  const m=createNeonModel(near('jelly-c',0,-2));m.interact();
  assert.equal(m.state.jellies['jelly-c'].status,'following');
  const before=m.state.jellies['jelly-c'].z;run(m,.5);assert.notEqual(m.state.jellies['jelly-c'].z,before);
  m.recover();assert.equal(m.state.jellies['jelly-c'].status,'following');
  const n=createNeonModel(world,m.serialize());assert.equal(n.state.jellies['jelly-c'].status,'following');
});

test('only one cell can be carried and matching sockets accept it',()=>{
  const m=createNeonModel(near('battery-a'));m.interact();assert.equal(m.state.carriedBattery,'battery-a');
  const save=m.serialize();save.player={x:31,y:0,z:14,yaw:0};
  const b=createNeonModel(world,save);b.interact();assert.equal(b.state.carriedBattery,'battery-a');
  const next=b.serialize();next.player={x:27,y:0,z:19,yaw:0};
  const wrong=createNeonModel(world,next);wrong.interact();assert.equal(wrong.state.progress.batteries,0);
  const correct=wrong.serialize();correct.player={x:23,y:0,z:19,yaw:0};
  const a=createNeonModel(world,correct);a.interact();assert.equal(a.state.batteries['battery-a'].status,'installed');
});

test('foundry timing retries only the current beat and never loses installed cells',()=>{
  const base=createNeonModel(near('foundry-console')).serialize();
  base.batteries={'battery-a':{status:'installed'},'battery-b':{status:'installed'}};
  const m=createNeonModel(world,base);m.interact();assert.equal(m.state.engine.started,true);
  m.interact();assert.equal(m.state.engine.beats,0);run(m,.7);m.interact();assert.equal(m.state.engine.beats,1);
  run(m,3.5);assert.equal(m.state.progress.batteries,2);assert.equal(m.state.engine.beats,1);
  while(!m.state.engine.ready)m.step(.02,{});m.interact();run(m,.7);m.interact();
  assert.equal(m.state.missions.engine,true);
});

test('corrupt saves cannot inject coordinates, objects, duplicate carries or premature finale',()=>{
  const base=createNeonModel(world).serialize();
  base.player={x:Infinity,y:NaN,z:-1000,yaw:NaN};base.completed=true;
  base.batteries={'battery-a':{status:'carried'},'battery-b':{status:'carried'},evil:{status:'installed'}};
  base.secrets=['secret-1','secret-1','evil'];base.checkpoint={x:22,z:-18};
  const m=createNeonModel(world,base);
  assert.ok(Number.isFinite(m.state.player.x));assert.equal(m.state.missions.completed,false);
  assert.equal(Object.values(m.state.batteries).filter(b=>b.status==='carried').length,1);
  assert.deepEqual(m.state.secrets,['secret-1']);assert.ok(m.state.player.x<20);
});

test('save snapshots do not expose mutable simulation state',()=>{
  const m=createNeonModel(world),s=m.state;s.player.x=100;s.mirrors['mirror-a'].rotation=99;
  const save=m.serialize();save.jellies['jelly-a'].status='delivered';
  assert.equal(m.state.player.x,0);assert.equal(m.state.mirrors['mirror-a'].rotation,1);
  assert.equal(m.state.jellies['jelly-a'].status,'waiting');
});

test('all three wonders can be completed in every order by ordinary walking and interaction',()=>{
  const solves={j:solveJellies,p:solvePrisms,e:solveEngine};
  for(const order of ['jpe','jep','pje','pej','ejp','epj']) {
    const m=createNeonModel(world);
    for(const kind of order)solves[kind](m);
    assert.equal(m.state.gateOpen,true);
    path(m,[[0,-20],[0,-37]]);assert.equal(m.state.player.y,4);
    activate(m,'aurora-heart');assert.equal(m.state.completed,true);
    const restored=createNeonModel(world,m.serialize());assert.equal(restored.state.completed,true);
  }
});

test('closed gate and high deck cannot be walked through; ramp is traversable after opening',()=>{
  const gate=structuredClone(world);gate.spawn={x:0,z:-22};
  const m=createNeonModel(gate);run(m,4,{z:-1,sprint:true});assert.ok(m.state.player.z>-24.11);
  const deck=structuredClone(world);deck.spawn={x:12,z:-39};
  const n=createNeonModel(deck);run(n,4,{x:-1,sprint:true});assert.ok(n.state.player.x>=9.54);assert.equal(n.state.player.y,0);
});

test('every partial mission save can resume without losing collected progress',()=>{
  const m=createNeonModel(world);solveJellies(m);
  const n=createNeonModel(world,m.serialize());assert.equal(n.state.progress.jellies,3);
  solvePrisms(n);const p=createNeonModel(world,n.serialize());assert.equal(p.state.missions.prisms,true);
  solveEngine(p);const q=createNeonModel(world,p.serialize());assert.equal(q.state.gateOpen,true);
  q.recover();assert.equal(q.state.gateOpen,true);
});

test('a carried cell and the full follower group survive repeated recovery and reload',()=>{
  let m=createNeonModel(near('battery-a'));activate(m,'battery-a');
  const save=m.serialize();for(const j of Object.values(save.jellies))j.status='following';
  m=createNeonModel(world,save);
  for(let i=0;i<15;i++){
    run(m,.3,{x:1,z:1,jump:true});m.recover();m=createNeonModel(world,m.serialize());
    assert.equal(m.state.carriedBattery,'battery-a');
    assert.equal(Object.values(m.state.jellies).filter(j=>j.status==='following').length,3);
    assert.ok(Object.values(m.state.jellies).every(j=>Math.hypot(j.x-m.state.player.x,j.z-m.state.player.z)<3));
  }
});

test('secrets are reachable, optional, deduplicated, and persist through the finale',()=>{
  const m=createNeonModel(world);
  path(m,[[0,25],[-7,25]]);assert.ok(m.state.secrets.includes('secret-1'));
  path(m,[[-7,35],[-23,35],[-42,15],[-42,-20],[-39,-20]]);assert.ok(m.state.secrets.includes('secret-2'));
  path(m,[[-42,-44],[41,-44],[41,-30],[34,-32]]);assert.ok(m.state.secrets.includes('secret-3'));
  path(m,[[42,-32],[42,36],[36,36],[36,29],[38,27]]);
  assert.ok(m.state.secrets.includes('secret-4'));assert.equal(m.state.player.y,1.1);
  path(m,[[36,29],[36,36],[42,36],[42,-44],[-19,-44],[-17,-44],[-17,-25],[-13,-25],[-13,-28],[-13,-37],[-12,-39]]);
  assert.ok(m.state.secrets.includes('secret-5'));assert.equal(m.state.player.y,2.2);
  path(m,[[-12,-44],[10,-44],[10,-40]]);assert.equal(m.state.progress.secrets,6);
  run(m,2);assert.equal(m.state.progress.secrets,6);assert.equal(m.state.gateOpen,false);
  const n=createNeonModel(world,m.serialize());assert.equal(n.state.progress.secrets,6);
});

test('frame rate and stationary waits do not alter the movement contract or pause the world',()=>{
  const trajectories=[];
  for(const rate of [30,60,120,144]) {
    const m=createNeonModel(world);for(let i=0;i<rate*2;i++)m.step(1/rate,{x:.8,z:.6});
    trajectories.push(m.state.player);const elapsed=m.state.elapsed;run(m,3);assert.ok(m.state.elapsed>elapsed+2.99);
  }
  for(const p of trajectories)assert.ok(Math.hypot(p.x-trajectories[0].x,p.z-trajectories[0].z)<.04);
});

test('collision, finite state, and recovery hold under deterministic mixed-input stress',()=>{
  const m=createNeonModel(world);let seed=76123;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<12000;i++) {
    const dt=i%137===0?.25:1/60;
    m.step(dt,{x:Math.cos(i*.0013),z:Math.sin(i*.0031),sprint:i%7!==0,jump:i%80<20});
    if(i%103===0)m.interact();if(i%997===0)m.recover();
    const p=m.state.player;assert.ok([p.x,p.y,p.z,p.vx,p.vy,p.vz].every(Number.isFinite));
    assert.ok(p.x>=world.bounds.minX+.55&&p.x<=world.bounds.maxX-.55);
    assert.ok(p.z>=world.bounds.minZ+.55&&p.z<=world.bounds.maxZ-.55);
    for(const b of world.colliders)if(p.y<b.height-.02) {
      const dx=p.x-Math.max(b.x-b.width/2,Math.min(b.x+b.width/2,p.x));
      const dz=p.z-Math.max(b.z-b.depth/2,Math.min(b.z+b.depth/2,p.z));
      assert.ok(Math.hypot(dx,dz)>=.549,`Overlap with ${b.id} at ${i}`);
    }
    if(rand()<.001)assert.equal(createNeonModel(world,m.serialize()).state.carriedBattery,m.state.carriedBattery);
  }
});

test('a waiting jelly saved above a planter remains there and visibly clears its top',()=>{
  const s=createNeonModel(world).serialize();s.jellies['jelly-a']={x:-25,z:-9,status:'waiting'};
  const m=createNeonModel(world,s);m.step(.02,{});
  assert.equal(m.state.jellies['jelly-a'].x,-25);assert.ok(m.state.jellies['jelly-a'].y>2.9);
});

test('echo pairs reward higher hops, persist on reload, and cannot clear the shortest blocker',()=>{
  let baseline=0;
  for(const count of [0,1,2,4,6]) {
    const saved=createNeonModel(world).serialize();saved.secrets=world.objects.filter(o=>o.kind==='secret').slice(0,count).map(o=>o.id);
    const m=createNeonModel(world,saved);let peak=0;
    for(let i=0;i<180;i++){m.step(1/120,{jump:true});peak=Math.max(peak,m.state.player.y);}
    if(count===0)baseline=peak;if(count>=2)assert.ok(peak>baseline+.09);
    assert.ok(peak<1.8);assert.equal(m.state.abilities.echoLevel,Math.floor(count/2));
    assert.equal(createNeonModel(world,m.serialize()).state.abilities.jumpPower,m.state.abilities.jumpPower);
  }
  const layout=structuredClone(world);layout.spawn={x:-25,z:-5};
  const saved=createNeonModel(layout).serialize();saved.secrets=world.objects.filter(o=>o.kind==='secret').map(o=>o.id);
  const m=createNeonModel(layout,saved);run(m,1,{z:-1,sprint:true,jump:true});
  assert.ok(m.state.player.z>=-6.951,'Echo jump cannot phase through the 2m planter');
});

test('new secret decks are solid at the sides and their ramps support safe save and recovery',()=>{
  for(const [spawn,axis,edge]of [[{x:31,z:26},'x',31.95],[{x:-18,z:-39},'x',-16.55]]) {
    const layout=structuredClone(world);layout.spawn=spawn;
    const m=createNeonModel(layout);run(m,2,{[axis]:1,sprint:true});
    assert.ok(m.state.player.x<=edge+.001);assert.equal(m.state.player.y,0);
  }
  for(const points of [[[25,28],[30,36],[36,36],[36,32]],[[0,-20],[-13,-28],[-13,-34]]]) {
    const m=createNeonModel(world);path(m,points);const position=m.state.player;
    assert.ok(position.y>.4&&position.y<2);
    const saved=m.serialize(),n=createNeonModel(world,saved);
    assert.ok(Math.abs(n.state.player.y-position.y)<.001);
    const checkpoint=n.state.checkpoint;n.recover();assert.equal(n.state.player.y,0);
    assert.ok(world.checkpoints.some(c=>c.x===checkpoint.x&&c.z===checkpoint.z));
    assert.equal(n.state.player.x,checkpoint.x);assert.equal(n.state.player.z,checkpoint.z);
  }
});

test('echo hops reach the maintenance deck cleanly but cannot skip the locked spire',()=>{
  const layout=structuredClone(world);layout.spawn={x:31.949,z:28};
  const saved=createNeonModel(layout).serialize();saved.secrets=world.objects.filter(o=>o.kind==='secret').map(o=>o.id);
  const m=createNeonModel(layout,saved);let touchedDeck=false;
  for(let i=0;i<120;i++){
    m.step(1/120,{x:1,jump:true});const p=m.state.player;
    if(p.x>31.951)assert.ok(p.y>=1.08,'Feet must clear the deck wall before entry');
    if(p.x>=32.5)touchedDeck=true;
  }
  assert.equal(touchedDeck,true);assert.equal(m.state.player.y,1.1);
  const gate=structuredClone(world);gate.spawn={x:0,z:-22};
  const allEchoes=createNeonModel(gate).serialize();allEchoes.secrets=saved.secrets;
  const n=createNeonModel(gate,allEchoes);run(n,3,{z:-1,sprint:true,jump:true});
  assert.ok(n.state.player.z>-24.11);assert.equal(n.state.gateOpen,false);
});

const fixtureAt=(x,z,{all=false,yaw=0}={})=>{
  const save=createNeonModel(world).serialize();save.player={x,z,yaw};
  if(all){for(const j of Object.values(save.jellies))j.status='delivered';save.mirrors['mirror-a'].rotation=0;save.mirrors['mirror-b'].rotation=1;
    for(const b of Object.values(save.batteries))b.status='installed';save.engine={started:true,beats:3,clock:0};}
  return createNeonModel(world,save);
};
function releaseAndLand(m,input={}) {
  const events=m.step(1/120,{releaseCharge:true,...input});
  assert.ok(events.some(e=>e.type==='charge-release'));assert.equal(m.state.player.grounded,false);
  for(let i=0;i<600;i++){m.step(1/120,{});if(m.state.player.grounded)return m.state.player;}
  assert.fail('Charged flight did not settle');
}

test('holding a charge anchors Gizmo while companions and the engine clock keep moving',()=>{
  const m=createNeonModel(near('jelly-c',0,-2));m.interact();
  const p=m.state.player,j={...m.state.jellies['jelly-c']};run(m,1.5,{charge:true,aimX:1,aimZ:0,x:1,sprint:true});
  assert.equal(m.state.player.x,p.x);assert.equal(m.state.player.z,p.z);assert.ok(m.state.elapsed>1.49);
  assert.ok(Math.hypot(m.state.jellies['jelly-c'].x-j.x,m.state.jellies['jelly-c'].z-j.z)>.2);
  assert.equal(m.state.charge.active,true);assert.equal(m.state.charge.power,1);
  assert.ok(m.state.charge.points.length>10);assert.equal(m.state.charge.safe,true);
  const save=createNeonModel(near('foundry-console')).serialize();
  for(const b of Object.values(save.batteries))b.status='installed';save.engine={started:true,beats:0,clock:0};
  const engine=createNeonModel(world,save);run(engine,1,{charge:true,aimX:0,aimZ:1});
  assert.ok(engine.state.engine.pulse>.3);assert.equal(engine.state.engine.ready,true);
});

test('charge power increases range; quick taps remain ordinary hops including a same-frame tap',()=>{
  const distances=[];
  for(const hold of [.05,.5,1.2]) {
    const m=createNeonModel(world);run(m,hold,{charge:true,aimX:0,aimZ:-1});
    const landing=releaseAndLand(m);distances.push(Math.hypot(landing.x-world.spawn.x,landing.z-world.spawn.z));
  }
  assert.ok(distances[0]<.01);assert.ok(distances[1]>4);assert.ok(distances[2]>distances[1]+2);assert.ok(distances[2]<12);
  const tap=createNeonModel(world);const events=tap.step(1/60,{charge:true,releaseCharge:true,aimX:1,aimZ:0});
  assert.ok(events.some(e=>e.type==='charge-release'&&e.quick));assert.equal(tap.state.charge.active,false);assert.ok(tap.state.player.y>0);
});

test('cancellation dominates release, drops all preview data, and never launches on recovery or interaction',()=>{
  for(const action of ['cancel','recover','interact']) {
    const m=createNeonModel(world);run(m,.8,{charge:true,aimX:0,aimZ:-1});
    if(action==='cancel')m.step(1/60,{charge:true,releaseCharge:true,cancelCharge:true});else m[action]();
    assert.equal(m.state.charge.active,false);assert.equal(m.state.charge.landing,null);assert.deepEqual(m.state.charge.points,[]);
    assert.equal(m.state.player.grounded,true);assert.equal(m.state.player.vy,0);
  }
  const m=createNeonModel(world);run(m,.4,{charge:true});m.step(1/60,{});assert.equal(m.state.charge.active,false);
});

test('the landing prediction matches actual unsteered release near bounds, scenery, the locked gate and elevated decks',()=>{
  const fixtures=[
    [0,14,0,-1,false],[-6,10,-1,0,false],[42,2,1,0,false],[0,-22,0,-1,false],
    [31,28,1,0,false],[-31,-29,1,0,true],[25,-35,1,0,true],[36,14,0,-1,true]
  ];
  for(const [x,z,ax,az,all]of fixtures) {
    const m=fixtureAt(x,z,{all});run(m,1.15,{charge:true,aimX:ax,aimZ:az});
    const predicted=m.state.charge.landing;assert.ok(predicted&&m.state.charge.safe,`${x},${z}: stable safe target`);
    assert.ok(m.state.charge.points.every(p=>p.length===3&&p.every(Number.isFinite)));
    const actual=releaseAndLand(m);
    assert.ok(Math.hypot(actual.x-predicted.x,actual.z-predicted.z)<.03,`${x},${z}: predicted ${JSON.stringify(predicted)}, actual ${JSON.stringify(actual)}`);
    assert.ok(Math.abs(actual.y-predicted.y)<.03);
    if(x===0&&z===-22)assert.ok(actual.z>-24.11,'Charged bounce cannot skip locked Spire');
  }
});

test('landing previews remain present and charge arcs stay close at 30, 60, 120 and 144 Hz',()=>{
  const arrivals=[];
  for(const rate of [30,60,120,144]) {
    const m=createNeonModel(world);
    for(let i=0;i<Math.ceil(rate*1.2);i++){
      m.step(1/rate,{charge:true,aimX:0,aimZ:-1});assert.ok(m.state.charge.landing);assert.ok(m.state.charge.points.length>1);
    }
    arrivals.push(releaseAndLand(m));
  }
  for(const p of arrivals)assert.ok(Math.hypot(p.x-arrivals[0].x,p.z-arrivals[0].z)<.03);
});

test('prism bridge is absent before its mission, solid after, and a real walking crossing earns its petal',()=>{
  const locked=fixtureAt(25,-35);assert.equal(locked.state.player.y,0);run(locked,.5);assert.equal(locked.state.traversal.petals,0);
  const open=fixtureAt(40,-35,{all:true});path(open,[[36,-35],[25,-35],[12,-35]]);
  assert.ok(open.state.traversal.visited.includes('arcade'));assert.ok(Math.abs(open.state.player.y-.3)<.06);
  const restored=createNeonModel(world,open.serialize());assert.ok(restored.state.traversal.visited.includes('arcade'));
});

test('both transports unlock with their mission, travel both ways and save a safe origin dock mid-ride',()=>{
  for(const t of world.transports) {
    const locked=fixtureAt(t.from.x,t.from.z);assert.equal(locked.state.nearby?.kind,'transport');locked.interact();assert.equal(locked.state.transport,null);
    let m=fixtureAt(t.from.x,t.from.z,{all:true});activate(m,`${t.id}:from`);
    assert.equal(m.state.transport.id,t.id);run(m,t.duration*.35,{charge:true,jump:true,x:1,sprint:true});
    assert.equal(m.state.charge.active,false);assert.equal(m.state.transport.id,t.id);
    const restored=createNeonModel(world,m.serialize());assert.equal(restored.state.transport,null);
    assert.ok(Math.hypot(restored.state.player.x-t.from.x,restored.state.player.z-t.from.z)<.01);assert.equal(restored.state.player.y,t.from.y);
    run(m,t.duration);assert.equal(m.state.transport,null);assert.equal(m.state.player.y,t.to.y);
    assert.ok(m.state.traversal.visited.includes(t.route));activate(m,`${t.id}:to`);run(m,t.duration+.1);
    assert.ok(Math.hypot(m.state.player.x-t.from.x,m.state.player.z-t.from.z)<.01);assert.equal(m.state.player.y,t.from.y);
    assert.equal(m.state.traversal.visited.filter(id=>id===t.route).length,1);
  }
});

test('the lift clears the terrace wall vertically before crossing, including on the reverse trip',()=>{
  const t=world.transports.find(t=>t.kind==='lift'),m=fixtureAt(t.from.x,t.from.z,{all:true});activate(m,`${t.id}:from`);
  for(let i=0;i<Math.ceil(t.duration*120)+2;i++) {
    m.step(1/120,{});const p=m.state.player;
    if(p.z<20.999)assert.ok(Math.abs(p.y-3.5)<.0001,`Lift entering terrace at ${p.y}`);
  }
  activate(m,`${t.id}:to`);
  for(let i=0;i<Math.ceil(t.duration*120)+2;i++) {
    m.step(1/120,{});const p=m.state.player;
    if(p.y<3.499)assert.ok(Math.abs(p.z-21)<.0001,'Lift must clear deck horizontally before lowering');
  }
});

test('stepping off a ride returns to its nearest safe dock; recovery never retains transport or charge',()=>{
  const t=world.transports[0];
  for(const fraction of [.2,.8]) {
    const m=fixtureAt(t.from.x,t.from.z,{all:true});m.interact();run(m,t.duration*fraction);m.interact();
    const expected=fraction<.5?t.from:t.to;assert.equal(m.state.transport,null);assert.equal(m.state.charge.active,false);
    assert.ok(Math.hypot(m.state.player.x-expected.x,m.state.player.z-expected.z)<.01);assert.equal(m.state.player.y,expected.y);
    assert.equal(m.state.player.grounded,true);
  }
  const m=fixtureAt(t.from.x,t.from.z,{all:true});m.interact();run(m,1);m.recover();
  assert.equal(m.state.transport,null);assert.equal(m.state.player.grounded,true);assert.equal(m.state.traversal.petals,0);
});

test('authored quest journeys connect ferry, prism crossing, terrace and the return-to-Atrium garden payoff',()=>{
  const m=createNeonModel(world);solveJellies(m);
  path(m,[[0,0],[-18,-2],[-31,-2]]);activate(m,'jelly-ferry:from');run(m,7);
  assert.equal(m.state.player.y,3);assert.ok(m.state.traversal.visited.includes('conservatory'));
  path(m,[[-31,-29],[-18,-29],[-17,-25],[-16,-22],[-16,-3],[0,0],[0,14]]);
  solvePrisms(m);path(m,[[0,-3],[30,-3],[30,-30],[41,-30],[41,-35],[36,-35],[25,-35],[12,-35],[12,-30],[15,-25],[15,-6],[0,-3],[0,14]]);
  assert.ok(m.state.traversal.visited.includes('arcade'));
  solveEngine(m);path(m,[[10,23],[30,22],[37,22]]);activate(m,'foundry-lift:from');run(m,4);
  assert.equal(m.state.traversal.petals,3);assert.equal(m.state.traversal.gardenAwake,false);
  path(m,[[37,13],[36,4],[36,-7],[30,-7],[30,-3],[0,-3],[0,3]]);activate(m,'moon-garden');
  assert.equal(m.state.traversal.gardenAwake,true);assert.ok(m.state.events.some(e=>e.type==='garden-awake'));
  path(m,[[0,-20],[0,-37]]);activate(m,'aurora-heart');assert.equal(m.state.completed,true);
  const restored=createNeonModel(world,m.serialize());assert.equal(restored.state.traversal.gardenAwake,true);assert.equal(restored.state.completed,true);
});

test('chimes require an airborne touch, persist, and unlock a cosmetic Moontrail without blocking the finale',()=>{
  let m=fixtureAt(-1,9,{all:true});run(m,.1);assert.equal(m.state.traversal.chimes.length,0);
  for(const o of world.objects.filter(o=>o.kind==='chime')) {
    const save=m.serialize();save.player={x:o.x,z:o.z,yaw:0};m=createNeonModel(world,save);
    run(m,.01,{charge:true,aimX:0,aimZ:1});releaseAndLand(m);
    assert.ok(m.state.traversal.chimes.includes(o.id));
  }
  assert.equal(m.state.abilities.moontrail,true);assert.equal(m.state.traversal.chimes.length,4);
  assert.equal(createNeonModel(world,m.serialize()).state.abilities.moontrail,true);
});

test('older v1 saves resume without optional fields and malformed progression cannot unlock a route or garden',()=>{
  const save=createNeonModel(world).serialize();delete save.traversal;delete save.chimes;
  const old=createNeonModel(world,save);assert.equal(old.state.traversal.petals,0);assert.equal(old.state.traversal.gardenAwake,false);
  save.traversal={visited:['conservatory','arcade','foundry','evil','arcade'],gardenAwake:true};save.chimes=['chime-1','chime-1','chime-2','evil'];
  const malformed=createNeonModel(world,save);assert.equal(malformed.state.traversal.petals,0);assert.equal(malformed.state.traversal.gardenAwake,false);
  assert.deepEqual(malformed.state.traversal.chimes,['chime-1']);
});

test('repeated charged flights, cancellations, coarse frames and reloads remain finite and clear solid scenery',()=>{
  let m=fixtureAt(0,14,{all:true}),launches=0,cancels=0;
  for(let i=0;i<6000;i++) {
    const cycle=i%140,angle=i*.0037,events=m.step(i%83===0?.25:1/60,{x:Math.sin(angle),z:Math.cos(angle),sprint:true,
      charge:cycle<90,releaseCharge:cycle===90,cancelCharge:i%311===0,aimX:Math.sin(angle),aimZ:Math.cos(angle)});
    launches+=events.filter(e=>e.type==='charge-release').length;cancels+=events.filter(e=>e.type==='charge-cancel').length;
    if(i%797===0)m.recover();if(i%1201===0)m=createNeonModel(world,m.serialize());
    const p=m.state.player;assert.ok([p.x,p.y,p.z,p.vx,p.vy,p.vz].every(Number.isFinite));
    assert.ok(p.x>=world.bounds.minX+.55&&p.x<=world.bounds.maxX-.55);assert.ok(p.z>=world.bounds.minZ+.55&&p.z<=world.bounds.maxZ-.55);
    for(const b of world.colliders)if(p.y<b.height-.02){
      const dx=p.x-Math.max(b.x-b.width/2,Math.min(b.x+b.width/2,p.x)),dz=p.z-Math.max(b.z-b.depth/2,Math.min(b.z+b.depth/2,p.z));
      assert.ok(Math.hypot(dx,dz)>=.549,`Charged overlap ${b.id} at frame ${i}`);
    }
  }
  assert.ok(launches>30);assert.ok(cancels>5);
});

test('visible Spire seals prevent charged entry from the elevated echo garden until all three wonders awaken',()=>{
  for(const dz of [-.7,-.3,0,.3,.7]) {
    const save=fixtureAt(-13,-39).serialize();save.secrets=world.objects.filter(o=>o.kind==='secret').map(o=>o.id);
    const m=createNeonModel(world,save);run(m,1.2,{charge:true,aimX:1,aimZ:dz});m.step(1/120,{releaseCharge:true});
    for(let i=0;i<240;i++){
      m.step(1/120,{});const p=m.state.player;
      assert.ok(!(p.x>-9&&p.x<9&&p.z>-43&&p.z<-35),'Closed Spire deck cannot be entered from a side');
      for(const b of world.barriers)if(p.y<b.height-.02&&p.y+1.4>b.y){
        const dx=p.x-Math.max(b.x-b.width/2,Math.min(b.x+b.width/2,p.x)),az=p.z-Math.max(b.z-b.depth/2,Math.min(b.z+b.depth/2,p.z));
        assert.ok(Math.hypot(dx,az)>=.549);
      }
    }
  }
  const open=fixtureAt(-13,-39,{all:true});run(open,1.2,{charge:true,aimX:1,aimZ:0});const landed=releaseAndLand(open);
  assert.ok(landed.x>-9&&landed.x<9);assert.equal(landed.y,4);
  const early=createNeonModel(world).serialize();early.player={x:0,z:-39,y:4,yaw:0};
  const guarded=createNeonModel(world,early);assert.equal(guarded.state.player.y,0);assert.deepEqual({x:guarded.state.player.x,z:guarded.state.player.z},world.spawn);
  assert.equal(guarded.state.gateOpen,false);
});
