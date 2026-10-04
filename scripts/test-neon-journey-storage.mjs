import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNeonModel} from '../dist/neon/model.js';
import {createJourneyStorage} from '../dist/neon/journey-storage.js';

const layout=JSON.parse(fs.readFileSync(new URL('../dist/neon/world.json',import.meta.url)));
const KEY='gizmo-neon-wilds-v1',PREVIOUS=KEY+'-previous',RECOVERY=KEY+'-recovery';
const snapshot=()=>createNeonModel(layout).serialize();
const canonical=s=>createNeonModel(layout,s).serialize();
const copy=s=>structuredClone(s);
const withEcho=()=>{const s=snapshot();s.secrets=['secret-1'];return s;};
const withCell=()=>{const s=snapshot();s.batteries['battery-a'].status='carried';return s;};
function memory(initial={}) {
  const data=new Map(Object.entries(initial)),calls=[];let writes=0,fail=()=>false;
  return {data,calls,get writes(){return writes;},set failure(fn){fail=fn;},
    getItem(key){return data.get(key)??null;},
    setItem(key,value){writes++;calls.push(['set',key,String(value)]);if(fail({kind:'set',key,value:String(value),write:writes}))throw new Error('Storage blocked');data.set(key,String(value));},
    removeItem(key){writes++;calls.push(['remove',key]);if(fail({kind:'remove',key,write:writes}))throw new Error('Storage blocked');data.delete(key);}
  };
}
const helper=storage=>createJourneyStorage({storage,key:KEY,layout});
const read=(storage,key=KEY)=>JSON.parse(storage.getItem(key));
const encoded=s=>JSON.stringify(s);
function startedEngine() {
  const s=snapshot();for(const b of Object.values(s.batteries))b.status='installed';s.engine={started:true,beats:1,clock:.6};return s;
}
function completed() {
  const s=startedEngine();s.engine.beats=3;for(const j of Object.values(s.jellies))j.status='delivered';
  s.mirrors['mirror-a'].rotation=0;s.mirrors['mirror-b'].rotation=1;s.completed=true;
  s.traversal={visited:['conservatory','arcade','foundry'],gardenAwake:true};return s;
}

test('reset persists a clean journey and a sanitized backup before returning, without mutating its input',()=>{
  const current=withCell();current.player.x=999;current.secrets=['secret-1','secret-1','unknown'];const before=copy(current);
  const storage=memory({[KEY]:encoded(current)}),result=helper(storage).reset(current);
  assert.deepEqual(result,snapshot());assert.deepEqual(read(storage),result);assert.deepEqual(read(storage,PREVIOUS),canonical(current));
  assert.deepEqual(current,before);assert.equal(storage.getItem(RECOVERY),null);
  assert.deepEqual(storage.calls.map(c=>[c[0],c[1]]),[['set',RECOVERY],['set',PREVIOUS],['set',KEY],['remove',RECOVERY]]);
});

test('repeated blank resets preserve the valuable backup across idle time, movement and reload',()=>{
  const valuable=completed(),storage=memory({[KEY]:encoded(valuable)});let api=helper(storage),blank=api.reset(valuable);
  for(let i=0;i<4;i++) {
    const m=createNeonModel(layout,blank);for(let j=0;j<120;j++)m.step(1/60,{x:1});blank=m.serialize();
    storage.setItem(KEY,encoded(blank));api=helper(storage);blank=api.reset(blank);
    assert.deepEqual(api.getBackup(),canonical(valuable));assert.deepEqual(read(storage),snapshot());
  }
});

test('each partial puzzle or discovery state is retained as the current journey backup',()=>{
  const cases={
    following:s=>{s.jellies['jelly-a'].status='following';},
    delivered:s=>{s.jellies['jelly-a'].status='delivered';},
    movedWaiting:s=>{s.jellies['jelly-a'].x+=2;},
    carried:s=>{s.batteries['battery-a'].status='carried';},
    installed:s=>{s.batteries['battery-b'].status='installed';},
    firstMirror:s=>{s.mirrors['mirror-a'].rotation=2;},
    secondMirror:s=>{s.mirrors['mirror-b'].rotation=3;},
    engineStarted:s=>Object.assign(s,startedEngine()),
    engineBeat:s=>{Object.assign(s,startedEngine());s.engine.started=false;},
    echo:s=>{s.secrets=['secret-1'];},
    chime:s=>{s.chimes=['chime-1'];},
    route:s=>{for(const j of Object.values(s.jellies))j.status='delivered';s.traversal.visited=['conservatory'];},
    garden:s=>Object.assign(s,completed()),
    completion:s=>{Object.assign(s,completed());s.traversal={visited:[],gardenAwake:false};}
  };
  for(const [name,change]of Object.entries(cases)) {
    const current=snapshot();change(current);const storage=memory({[KEY]:encoded(current),[PREVIOUS]:encoded(withEcho())});
    helper(storage).reset(current);assert.deepEqual(read(storage,PREVIOUS),canonical(current),name);
  }
});

test('elapsed time, pose, checkpoints, idle hover and invalid injected progress do not erase a real backup',()=>{
  const blank=snapshot();blank.elapsed=12345;blank.player={x:4,y:20,z:20,yaw:2};blank.checkpoint=layout.checkpoints[1];
  blank.jellies['jelly-a'].y=800;blank.secrets=['fake'];blank.chimes=['fake'];blank.traversal={visited:['foundry'],gardenAwake:true};blank.completed=true;
  const old=withCell(),storage=memory({[KEY]:encoded(blank),[PREVIOUS]:encoded(old)});
  helper(storage).reset(blank);assert.deepEqual(read(storage,PREVIOUS),canonical(old));
});

test('blank restore retains the meaningful backup, while meaningful restore permits switching journeys',()=>{
  const blank=snapshot(),old=withEcho(),storage=memory({[KEY]:encoded(blank),[PREVIOUS]:encoded(old)}),api=helper(storage);
  const restored=api.restore(blank);assert.deepEqual(restored,canonical(old));assert.deepEqual(read(storage),canonical(old));assert.deepEqual(api.getBackup(),canonical(old));
  const current=withCell();storage.setItem(KEY,encoded(current));const next=api.restore(current);
  assert.deepEqual(next,canonical(old));assert.deepEqual(api.getBackup(),canonical(current));
  assert.deepEqual(api.restore(next),canonical(current));assert.deepEqual(api.getBackup(),canonical(old));
});

test('missing, malformed and wrong-world backups cannot be restored or replace the current save',()=>{
  for(const raw of [null,'{broken','null','[]',encoded({version:2,worldId:layout.id}),encoded({version:1,worldId:'elsewhere'})]) {
    const current=withCell(),storage=memory({[KEY]:encoded(current),...(raw===null?{}:{[PREVIOUS]:raw})}),api=helper(storage);
    assert.equal(api.getBackup(),null);assert.throws(()=>api.restore(current));assert.equal(storage.getItem(KEY),encoded(current));assert.equal(storage.getItem(PREVIOUS),raw);assert.equal(storage.writes,0);
    api.reset(current);assert.deepEqual(api.getBackup(),canonical(current));
  }
});

test('a valid old v1 backup is sanitized rather than trusting impossible progression or coordinates',()=>{
  const old=withEcho();delete old.chimes;delete old.traversal;old.player={x:Infinity,z:999};old.batteries['battery-a'].status='carried';old.batteries['battery-b'].status='carried';
  old.completed=true;old.secrets=['secret-1','secret-1','fake'];const storage=memory({[KEY]:encoded(snapshot()),[PREVIOUS]:encoded(old)}),api=helper(storage);
  const restored=api.restore(snapshot());assert.deepEqual(restored.secrets,['secret-1']);assert.equal(restored.completed,false);
  assert.equal(Object.values(restored.batteries).filter(b=>b.status==='carried').length,1);assert.equal(restored.player.x,layout.spawn.x);
  assert.deepEqual(read(storage),restored);assert.equal(storage.getItem(RECOVERY),null);
});

test('journal, backup and target write failures abort reset and restore without losing either original',()=>{
  for(const operation of ['reset','restore'])for(const failedWrite of [1,2,3,4]) {
    const current=withCell(),previous=withEcho(),storage=memory({[KEY]:encoded(current),[PREVIOUS]:encoded(previous)}),api=helper(storage);
    storage.failure=({write})=>write===failedWrite;
    assert.throws(()=>api[operation](current),`${operation} failure at ${failedWrite}`);
    assert.deepEqual(canonical(read(storage)),canonical(current));assert.equal(storage.getItem(PREVIOUS),encoded(previous));assert.equal(storage.getItem(RECOVERY),null);
    if(failedWrite===1)assert.equal(storage.getItem(KEY),encoded(current));
  }
});

test('a failed reset with no prior backup rolls back absence instead of leaving a misleading previous journey',()=>{
  const current=withEcho(),storage=memory({[KEY]:encoded(current)});storage.failure=({write})=>write===3;
  assert.throws(()=>helper(storage).reset(current));assert.deepEqual(read(storage),canonical(current));assert.equal(storage.getItem(PREVIOUS),null);assert.equal(storage.getItem(RECOVERY),null);
});

test('blocked rollback retains both original saves in a recovery journal, including across a new helper instance',()=>{
  for(const operation of ['reset','restore'])for(const failedWrite of [2,3,4]) {
    const current=withCell(),previous=withEcho(),storage=memory({[KEY]:encoded(current),[PREVIOUS]:encoded(previous)});
    storage.failure=({write})=>write>=failedWrite;
    assert.throws(()=>helper(storage)[operation](current),e=>e.recoveryPending===true);
    const journal=read(storage,RECOVERY);assert.deepEqual(JSON.parse(journal.current),canonical(current));assert.equal(journal.previous,encoded(previous));
    storage.failure=()=>false;const reloaded=helper(storage);assert.deepEqual(reloaded.getBackup(),canonical(previous));
    assert.deepEqual(read(storage),canonical(current));assert.equal(storage.getItem(RECOVERY),null);
    assert.deepEqual(reloaded.restore(current),canonical(previous));
  }
});

test('an interrupted transaction is recovered before another reset can read or replace its backup',()=>{
  const current=withCell(),previous=withEcho(),storage=memory({[KEY]:encoded(current),[PREVIOUS]:encoded(previous)});
  storage.failure=({write})=>write>=3;assert.throws(()=>helper(storage).restore(current));
  storage.failure=()=>false;const target=helper(storage).reset(current);
  assert.deepEqual(target,snapshot());assert.deepEqual(read(storage,PREVIOUS),canonical(current));assert.equal(storage.getItem(RECOVERY),null);
});

test('invalid current snapshots or damaged recovery records fail before mutating stored journeys',()=>{
  const current=withEcho(),storage=memory({[KEY]:encoded(current),[PREVIOUS]:encoded(withCell())}),api=helper(storage);
  for(const bad of [null,{},[],{version:1,worldId:'other'}])assert.throws(()=>api.reset(bad));assert.equal(storage.writes,0);
  storage.data.set(RECOVERY,encoded({version:1,worldId:layout.id,current:'{}',previous:null}));
  assert.throws(()=>api.getBackup());assert.equal(storage.writes,0);assert.equal(storage.getItem(KEY),encoded(current));
});

test('reset, restore and failure recovery touch no Studio groom, sound or learned-control preferences',()=>{
  const preferences={'gizmo-groom':'[0.2,0.4]','gizmo-sound-enabled':'false','gizmo-neon-controls-seen':'true','gizmo-neon-bounce-seen':'true','unrelated':'keep'};
  const current=withCell(),storage=memory({...preferences,[KEY]:encoded(current),[PREVIOUS]:encoded(withEcho())}),api=helper(storage);
  const blank=api.reset(current),back=api.restore(blank);
  // Use a fixed fail point: one failed journal write must leave every preference alone.
  const failAt=storage.writes+1;storage.failure=({write})=>write===failAt;assert.throws(()=>api.reset(back));
  for(const [key,value]of Object.entries(preferences))assert.equal(storage.getItem(key),value);
  assert.ok(storage.calls.every(([,key])=>[KEY,PREVIOUS,RECOVERY].includes(key)));
});

test('storage read denial throws before mutating any game or preference key',()=>{
  const storage=memory({[KEY]:encoded(withCell())});storage.getItem=()=>{throw new Error('Storage access denied');};
  const api=helper(storage);for(const operation of [()=>api.getBackup(),()=>api.reset(withCell()),()=>api.restore(withCell())])assert.throws(operation);
  assert.equal(storage.writes,0);
});

test('autosave preflight recovers a blocked transaction before persisting newer play',()=>{
  const current=withCell(),previous=withEcho(),storage=memory({[KEY]:encoded(current),[PREVIOUS]:encoded(previous)}),api=helper(storage);
  storage.failure=({write})=>write>=3;assert.throws(()=>api.restore(current));
  const newer=copy(current);newer.secrets=['secret-2'];newer.elapsed=42;
  storage.failure=()=>false;api.getBackup();storage.setItem(KEY,encoded(newer));
  const reloaded=helper(storage);assert.deepEqual(reloaded.getBackup(),canonical(previous));
  assert.deepEqual(read(storage),newer);assert.equal(storage.getItem(RECOVERY),null);
});
