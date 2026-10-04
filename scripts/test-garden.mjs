import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GARDEN, LEVELS, createGardenModel } from '../dist/garden-model.js';

const STEP = 1 / 120;
const near = (a, b, message = '') => assert(Math.abs(a - b) < 1e-7, message + ': ' + a + ' != ' + b);
const activated = events => events.filter(e => e.type === 'target' && e.status === 'activated');

// Flight fixtures for prediction and advanced mission completion. The first two
// realms use the resting beginner journeys below for full-play acceptance.
// Each tuple is raw drag x, raw drag y, then seconds of unheld simulation.
export const SOLUTION_ROUTES = [
  [[-1.8845367727011784,-.9006410256410258,.6],[-2.0063802481516917,-.525641025641025,1],[-2.0610460479186523,-.3630536130536125,1.1],[-.9344588202822665,-.5761217948717949,1.6]],
  [[-.35373634291916173,-1.5113588638373119,2.9],[-.8481083744453918,-1.4364583333333325,2.8],[-.8599456745702968,-1.3807394211691086,2.8],[-1.5698908180742124,-.6052083333333339,1.6]],
  [[-1.1587289371500131,-1.0543269230769228,1.6],[.9245085457169555,.04158653846153881,1],[-1.468241977187031,-1.1891826923076922,2],[-1.641397368467917,-1.156719322344323,2.1]],
  [[-.8703381964961252,-.64375,1.25],[-1.4756297439296244,-.8183420745920762,1.65],[-1.491226992005734,-.8966034544159567,1.8],[-.5336599186616678,.36673344017092496,.6],[-1.7318636802564695,-.7074519230769227,1.6]],
  [[-1.5679781960642758,-1.1554487179487178,2.2],[-1.835494218136723,-.8822045707915269,2.3],[-1.6572610353379287,-.9099358974358963,1.8]],
];
function advance(model, seconds) {
  const events = [];
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) events.push(...model.step(STEP));
  return events;
}
function launch(model, x, y, seconds) {
  model.dispatch({ type: 'aim', x, y });
  model.dispatch({ type: 'release' });
  return advance(model, seconds);
}
function flyTo(model, x, y, seconds) {
  // Approximate player aim; deliberately ignores currents and physical obstructions.
  const n = Math.round(seconds / STEP), l = model.layout, s = model.state, r = Math.exp(-l.airDrag * STEP);
  const vx = (x - s.position.x) * (1 - r) / (STEP * r * (1 - r ** n));
  const vy = (y - s.position.y + l.gravity * STEP ** 2 * n * (n + 1) / 2) / (n * STEP);
  return launch(model, -vx / l.launchGain, (3 - vy) / l.launchGain, seconds);
}
// Beginner acceptance: every shot starts resting on a visible platform. These arcs
// use its current center (not a future-phase oracle), then allow natural settling.
export const BEGINNER_ROUTES = [
  Array.from({length:7},(_,i)=>({duration:1.4,wait:i===4?1.5:0})),
  [1.4,1.4,1.3,1.4,1.4,1.5,1.4].map((duration,i)=>({duration,wait:i===2?2.25:i===5?.5:0})),
];
function beginnerJourney(model, scale = () => 1) {
  const events=[];
  function settle(checkpoint) {
    for(let tick=0;tick<720;tick++) {
      const s=model.state;assert.equal(s.rescues,0,'A forgiving beginner journey should not require a rescue');
      if(s.grounded&&s.checkpoint===checkpoint&&Math.abs(s.velocity.x)<.05)return;
      events.push(...model.step(STEP));
    }
    assert.fail('Gizmo did not settle on platform '+checkpoint);
  }
  for(const [index,shot] of BEGINNER_ROUTES[model.state.levelIndex].entries()) {
    const destination=index+1;settle(index);events.push(...advance(model,shot.wait));
    const s=model.state,l=model.layout,p=s.islands[destination],n=Math.round(shot.duration/STEP),r=Math.exp(-l.airDrag*STEP);
    const vx=(p.x-s.position.x)*(1-r)/(STEP*r*(1-r**n));
    const vy=(p.y+l.halfHeight-s.position.y+l.gravity*STEP**2*n*(n+1)/2)/(n*STEP);
    const variation=scale(index), sx=typeof variation==='number'?variation:variation.x, sy=typeof variation==='number'?variation:variation.y;
    model.dispatch({type:'aim',x:-vx/l.launchGain*sx,y:(3-vy)/l.launchGain*sy});
    // Like a player watching the live guide, wait for the moving hazard to clear.
    // Hardcoded launch timestamps are brittle when softer landings settle sooner.
    let clear=false;
    for(let tick=0;tick<150;tick++) {
      const outcome=model.predict().outcome;
      if(outcome.type==='landing'&&outcome.platformId===destination){clear=true;break;}
      events.push(...advance(model,.1));
    }
    assert(clear,'A beginner platform arc needs a reachable clear timing window');
    events.push(...model.dispatch({type:'release'}));settle(destination);
    const target=l.mission.targets.find(t=>Math.abs(t.x-p.x)<.1);
    if(target&&!model.state.mission.targets.find(t=>t.id===target.id).completed) {
      events.push(...model.dispatch({type:'poke',direction:target.x<model.state.position.x?-1:1}));settle(destination);
    }
  }
  return events;
}
function finite(state) {
  for (const n of [state.position.x,state.position.y,state.velocity.x,state.velocity.y,state.elapsed]) assert(Number.isFinite(n));
  assert(Math.hypot(state.velocity.x,state.velocity.y) <= GARDEN.maxSpeed + 1e-7);
}

test('aiming keeps the active realm clock, hazards, and platforms moving', () => {
  const model = createGardenModel();
  model.dispatch({ type: 'aim', x: -.8, y: -.6 });
  const before = model.state;
  model.step(.5);
  assert(model.state.elapsed > before.elapsed, 'The realm clock froze while Pull was held');
  assert.notDeepEqual(model.state.hazards, before.hazards, 'Moving hazards froze while Pull was held');
  assert.notDeepEqual(model.state.islands, before.islands, 'Moving platforms froze while Pull was held');
  assert.deepEqual(model.state.position, before.position, 'A grounded stationary hold should keep its anchor');
});

test('mission catalog is deeply immutable, distinct, and contains no collectible completion', () => {
  assert.equal(GARDEN, LEVELS[0]); assert.equal(LEVELS.length, 5);
  assert.equal(new Set(LEVELS.map(l => l.mission.type)).size, 5);
  function frozen(object) { if (object && typeof object === 'object') { assert(Object.isFrozen(object)); Object.values(object).forEach(frozen); } }
  frozen(LEVELS);
  for (const layout of LEVELS) {
    assert.equal(layout.stars.length, 0); assert(layout.hazards.length >= 2);
    assert(layout.islands.some(i => i.motion)); assert(layout.mission.targets.length >= 2);
  }
  assert(LEVELS[2].mission.targets[1].x < LEVELS[2].mission.targets[0].x, 'Mirror order requires backtracking');
});
test('state snapshots cannot mutate nested mission progress, hazards, platforms, core, or other worlds', () => {
  const m = createGardenModel(4), original = m.state, exposed = m.state;
  exposed.position.x = 800; exposed.mission.targets[0].completed = true; exposed.mission.core.carried = false;
  exposed.islands[0].x = 800; exposed.hazards[0].active = false; exposed.exit.open = true; exposed.completedLevels.push(4);
  assert.deepEqual(m.state, original);
});
test('stronger pull and slap increase motion; drag and velocity remain capped', () => {
  let previous = 0;
  for (const power of [.2,.5,1]) {
    const m = createGardenModel(); m.dispatch({type:'slap',power}); advance(m,.15);
    assert(m.state.position.x > previous); previous = m.state.position.x; finite(m.state);
  }
  previous = 0;
  for (const amount of [.2,.5,1]) {
    const m = createGardenModel(); launch(m,-amount,-amount,.15);
    assert(m.state.position.x > previous); previous = m.state.position.x;
  }
  const m = createGardenModel(); m.dispatch({type:'aim',x:Number.MAX_VALUE,y:-Number.MAX_VALUE});
  near(Math.hypot(m.state.aim.x,m.state.aim.y),2.6); m.dispatch({type:'release'}); finite(m.state);
  assert.deepEqual(m.dispatch({type:'release'}),[]); assert.equal(m.state.launches,1);
});
test('holding anchors flight while the world advances, and cancel resumes without launch', () => {
  const m = createGardenModel(3); launch(m,-.7,-.6,.2); const moving=m.state;
  m.dispatch({type:'aim',x:-1,y:-1}); const paused=m.state; advance(m,5); assert.deepEqual(m.state.position,paused.position);
  near(m.state.elapsed,paused.elapsed+5); assert.notDeepEqual(m.state.islands,paused.islands);
  m.dispatch({type:'cancel'}); assert.deepEqual(m.state.velocity,moving.velocity);
  assert.equal(m.state.launches,moving.launches); assert.equal(m.state.aim,null); advance(m,.1);
  assert(m.state.position.x>moving.position.x);
});
test('frequent aim updates cannot discard time, and inactive realm remainders resume exactly', () => {
  const m=createGardenModel();
  for(let tick=0;tick<240;tick++){m.dispatch({type:'aim',x:-.8,y:-.6});m.step(STEP/2);}
  near(m.state.elapsed,1);m.dispatch({type:'cancel'});
  m.step(STEP/2);m.dispatch({type:'level',level:1});advance(m,.5);m.dispatch({type:'level',level:0});
  near(m.state.elapsed,1);m.step(STEP/2);near(m.state.elapsed,1+STEP);
});
test('a moving hazard can hit an anchored pull, which clears input and safely recovers', () => {
  const m=createGardenModel();flyTo(m,11.5,2.3,1);
  m.dispatch({type:'aim',x:-.3,y:-.3});const anchor=m.state.position;
  advance(m,.5);assert.deepEqual(m.state.position,anchor);assert(m.state.held);
  const events=advance(m,1.3);assert(events.some(e=>e.type==='hazard'));assert(events.some(e=>e.type==='rescue'));
  assert.equal(m.state.held,false);assert.equal(m.state.aim,null);assert(m.state.invulnerable>0);
  const launches=m.state.launches;m.dispatch({type:'release'});assert.equal(m.state.launches,launches);
  assert(!advance(m,1).some(e=>e.type==='hazard'));
});
test('live prediction resolves future moving-platform contact after time spent aiming', () => {
  const m=createGardenModel(1);m.dispatch({type:'aim',x:-1.08,y:-2.23});const early=m.predict();
  advance(m,.5);const before=m.state,predicted=m.predict();assert.deepEqual(m.state,before);
  assert.equal(predicted.outcome.type,'landing');assert.equal(predicted.outcome.platformId,4);
  assert.notEqual(predicted.outcome.y,early.outcome.y,'Held-time platform phase must change the future landing');
  assert(Math.abs(predicted.outcome.y-(before.islands[4].y+m.layout.halfHeight))>.1,'Future contact must not use current platform height');
  predicted.points[0].x=999;predicted.targets.push({id:'fake'});assert.deepEqual(m.state,before);
  const prediction=m.predict();m.dispatch({type:'release'});
  let landed=false;for(let tick=0;tick<720;tick++){
    const events=m.step(STEP);if(events.some(e=>e.type==='land')){landed=true;break;}
    assert(!events.some(e=>e.type==='rescue'));
  }
  assert(landed);near(m.state.elapsed,prediction.outcome.time);near(m.state.position.x,prediction.outcome.x);
  near(m.state.position.y,prediction.outcome.y);assert.equal(m.state.checkpoint,prediction.outcome.platformId);
});
test('a green grazing Tides landing catches the edge and stays safely settled',()=>{
  const m=createGardenModel(1);flyTo(m,5.55,2.95,1.4);advance(m,3);
  assert(m.state.grounded);assert.equal(m.state.checkpoint,1);
  // A real phone's ordinary 30px drag. Before the fix its green landing at
  // x12.905 had 0.015 of body overlap, then residual drift caused a fall rescue.
  m.dispatch({type:'aim',x:-.6769336661200374,y:-.6693179027282619});advance(m,.5);
  const prediction=m.predict();assert.equal(prediction.outcome.type,'landing');assert.equal(prediction.outcome.platformId,2);
  m.dispatch({type:'release'});let landed=false;
  for(let tick=0;tick<720;tick++)if(m.step(STEP).some(e=>e.type==='land')){landed=true;break;}
  assert(landed);near(m.state.position.x,prediction.outcome.x);near(m.state.position.y,prediction.outcome.y);
  advance(m,5);assert.equal(m.state.rescues,0,'A green landing must not slide into a fall rescue');
  assert(m.state.grounded);assert.equal(m.state.checkpoint,2);
  assert(Math.abs(m.state.position.x-m.state.islands[2].x)<m.state.islands[2].radius);
});
test('120/60/30 Hz and irregular equal-time frames produce identical mission and physics state', () => {
  const chunks=[Array(360).fill(1/120),Array(180).fill(1/60),Array(90).fill(1/30),Array.from({length:100},()=>[.013,.017]).flat()];
  const results=chunks.map(times=>{const m=createGardenModel(3);m.dispatch({type:'slap',power:.7});return{events:times.flatMap(dt=>m.step(dt)),state:m.state};});
  for(const r of results.slice(1))assert.deepEqual(r,results[0]);
});
for (const [index, layout] of LEVELS.entries()) {
  test(layout.name + ': real public gestures finish the distinct mission with no rescue', () => {
    const m=createGardenModel(layout.id), events=[];
    if(index<2)events.push(...beginnerJourney(m));
    else for(const route of SOLUTION_ROUTES[index])events.push(...launch(m,...route));
    assert(m.state.completed); assert.equal(m.state.mission.progress,m.state.mission.total);
    assert.equal(activated(events).length,layout.mission.targets.length);
    assert.equal(events.filter(e=>e.type==='complete').length,1);
    assert.equal(m.state.rescues,0); assert(m.state.exit.open); assert.deepEqual(m.state.completedLevels,[index]);
    assert(!advance(m,.5).some(e=>e.type==='complete'));
  });
  test(layout.name + ': repeated preview exactly matches live flight and changes no mission state', () => {
    const m=createGardenModel(index);
    const [x,y]=SOLUTION_ROUTES[index][0];m.dispatch({type:'aim',x,y});
    const before=m.state, prediction=m.predict(), predicted=prediction.points;assert.deepEqual(m.predict(),prediction);assert.deepEqual(m.state,before);
    assert.deepEqual(m.trajectory(),predicted);
    m.dispatch({type:'release'});const actual=[{...m.state.position}];
    for(let tick=1;tick<=720;tick++){
      const events=m.step(STEP);if(events.some(e=>e.type==='rescue')){const hit=events.find(e=>e.type==='hazard');assert(hit);actual.push({x:hit.x,y:hit.y});break;}
      const ended=events.some(e=>e.type==='land'||e.type==='gate'&&e.blocked);
      if(tick%4===0||ended)actual.push({...m.state.position});if(ended)break;
    }
    assert.deepEqual(actual,predicted);
  });
  test(layout.name + ': bypassing the mission and reaching the exit cannot win', () => {
    const m=createGardenModel(index), exit=m.layout.mission.exit;
    flyTo(m,10,13,1.9);
    for(let x=20;x<exit.x;x+=10)flyTo(m,x,13,1.4);
    flyTo(m,exit.x,13,1.4);flyTo(m,exit.x,exit.y,1.8);
    assert.equal(m.state.completed,false);assert.equal(m.state.exit.open,false);
    assert.equal(m.state.mission.progress,0);
  });
}
for(const level of [0,1])test(LEVELS[level].name+': resting platform journeys tolerate varied drag strength',()=>{
  for(const scale of [()=>.95,()=>1.05,i=>i%2?.95:1.05,i=>i%2?1.05:.95]) {
    const m=createGardenModel(level);beginnerJourney(m,scale);assert(m.state.completed);assert.equal(m.state.rescues,0);
    assert.equal(m.state.checkpoint,m.layout.islands.length-1);assert(m.state.grounded);
  }
});
test('beginner journeys tolerate independent horizontal and vertical aiming errors',()=>{
  let seed=713;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(const level of [0,1])for(let trial=0;trial<20;trial++) {
    const m=createGardenModel(level);beginnerJourney(m,()=>({x:.95+random()*.1,y:.95+random()*.1}));
    assert(m.state.completed);assert.equal(m.state.rescues,0);
  }
});
test('resonance accepts an ordinary landing and slow visible contact without double charging', () => {
  const m=createGardenModel(); const events=flyTo(m,4.5,2.75,1.25);
  assert.equal(activated(events).length,1); assert.equal(m.state.mission.progress,1);
  assert(m.state.grounded); assert.equal(m.state.checkpoint,1);
  assert(!advance(m,3).some(e=>e.type==='target'));
  m.dispatch({type:'poke',direction:-1}); assert(!advance(m,1).some(e=>e.type==='target'));
});
test('guardian locks allow landing after one gentle hit and a second poke breaks the crack', () => {
  const m=createGardenModel(1), events=flyTo(m,5,2.95,1.25);
  assert(events.some(e=>e.status==='cracked')); assert(m.state.grounded); assert.equal(m.state.checkpoint,1);
  assert.equal(m.state.mission.targets[0].hits,1); assert(m.state.mission.targets[0].cracked);
  assert(!advance(m,3).some(e=>e.type==='target'),'Idle overlap cannot damage a lock again');
  assert.equal(m.state.mission.progress,0);
  m.dispatch({type:'poke'}); assert.equal(activated(advance(m,.2)).length,1);
  assert.equal(m.state.mission.targets[0].hits,2); assert.equal(m.state.mission.progress,1);
});
test('the default 55 percent Slap breaks a nearby guardian in one contact, never remotely', () => {
  const m=createGardenModel(1);flyTo(m,3.5,3.3,.9);
  m.dispatch({type:'slap',power:.55});assert.equal(m.state.mission.progress,0);
  const events=advance(m,.15);assert.equal(activated(events).length,1);assert.equal(m.state.mission.targets[0].hits,2);
});
test('wrong mirror order preserves solved relays, and a closed beam gate physically rejects a fast crossing', () => {
  const m=createGardenModel(2);
  assert(flyTo(m,4.6,3.4,1.2).some(e=>e.status==='wrong-order'));assert.equal(m.state.mission.progress,0);
  flyTo(m,9.3,4.7,1.2);assert.equal(m.state.mission.progress,1);
  assert(flyTo(m,19.2,5.5,1.8).some(e=>e.status==='wrong-order'));assert.equal(m.state.mission.progress,1);
  m.dispatch({type:'restart'});flyTo(m,15,9,1.8);flyTo(m,24,7,1);
  m.dispatch({type:'slap',power:1});const events=advance(m,.4);
  assert(events.some(e=>e.type==='gate'&&e.blocked));assert(m.state.position.x<27-.65/2-.42);
  assert.equal(m.state.mission.gateOpen,false);assert.equal(m.state.completed,false);
});
test('storm timer continues while aiming, retains relays at timeout, and restarts on launch', () => {
  const m=createGardenModel(3);assert.equal(m.state.mission.remainingTime,null);
  launch(m,...SOLUTION_ROUTES[3][0]);assert.equal(m.state.mission.progress,1);
  const remaining=m.state.mission.remainingTime;m.dispatch({type:'aim',x:-1,y:-1});advance(m,2);
  near(m.state.mission.remainingTime,remaining-2);assert(m.state.held);
  const events=advance(m,46);assert.equal(events.filter(e=>e.type==='timeout').length,1);
  assert.equal(m.state.mission.progress,1);assert.equal(m.state.mission.remainingTime,null);assert(!m.state.exit.open);
  assert.equal(m.state.checkpoint,1);assert(m.state.grounded);assert(!m.state.held);assert.equal(m.state.aim,null);
  assert(!advance(m,20).some(e=>e.type==='timeout'));
  m.dispatch({type:'poke'});near(m.state.mission.remainingTime,45);advance(m,.1);assert(m.state.mission.remainingTime<45);
});
test('each storm relay refreshes the full generous time budget', () => {
  const m=createGardenModel(3);launch(m,...SOLUTION_ROUTES[3][0]);m.dispatch({type:'hold',held:true});advance(m,30);m.dispatch({type:'cancel'});
  const events=launch(m,...SOLUTION_ROUTES[3][1]);assert.equal(activated(events).length,1);
  assert.equal(m.state.mission.progress,2);assert(m.state.mission.remainingTime>44);
});
test('escort hazard drops the core at a reachable sanctuary; progress survives and pickup is necessary', () => {
  const m=createGardenModel(4);launch(m,...SOLUTION_ROUTES[4][0]);advance(m,.3);
  assert.equal(m.state.checkpoint,3);assert.equal(m.state.mission.progress,1);
  const arrival=m.state.elapsed+1.5,y=5+1.7*Math.sin(arrival*2*Math.PI/7);
  const events=flyTo(m,26.8,y,1.5);
  assert(events.some(e=>e.type==='hazard'));assert(events.some(e=>e.type==='core'&&!e.carried));
  assert.equal(m.state.mission.progress,1);assert.equal(m.state.mission.core.carried,false);
  assert.equal(m.state.checkpoint,3);near(m.state.position.x,m.state.islands[3].x);
  near(m.state.mission.core.x,m.state.islands[3].x-.95);assert(m.state.invulnerable>0);
  assert(!advance(m,2).some(e=>e.type==='hazard'),'The safe spawn never chains unavoidable hits');
  assert.equal(m.state.mission.core.carried,false,'Returning to the checkpoint does not auto-pick up a dropped core');
  m.dispatch({type:'poke',direction:-1});const pickup=advance(m,.8);
  assert(pickup.some(e=>e.type==='core'&&e.carried));assert(m.state.mission.core.carried);assert.equal(m.state.mission.progress,1);
});
test('moving platforms really catch and carry Gizmo, including direction reversals', () => {
  const m=createGardenModel(),config=m.layout.islands[3],duration=1.8;
  const x=config.x+config.motion.amplitude*Math.sin(duration*2*Math.PI/config.motion.period);
  const events=flyTo(m,x,config.y+m.layout.halfHeight,duration);
  assert(events.some(e=>e.type==='land'&&e.island===3));assert.equal(m.state.checkpoint,3);
  m.dispatch({type:'rescue'});
  m.dispatch({type:'aim',x:-.8,y:-.5});
  for(let tick=0;tick<720;tick++){m.step(STEP);near(m.state.position.x,m.state.islands[3].x);near(m.state.position.y,m.state.islands[3].y+m.layout.halfHeight);assert(m.state.held);}
  m.dispatch({type:'cancel'});m.step(STEP);near(m.state.position.x,m.state.islands[3].x);assert(m.state.grounded);
});
test('manual Rescue preserves a carried core and returns to a dropped core after traveling ahead',()=>{
  const m=createGardenModel(4);launch(m,...SOLUTION_ROUTES[4][0]);advance(m,.3);
  const manual=m.dispatch({type:'rescue'});assert(!manual.some(e=>e.type==='core'));assert(m.state.mission.core.carried);
  // Allow the manual rescue's brief protection to expire before entering a sentinel.
  advance(m,1.5);
  const arrival=m.state.elapsed+1.5,y=5+1.7*Math.sin(arrival*2*Math.PI/7);
  assert(flyTo(m,26.8,y,1.5).some(e=>e.type==='hazard'));assert(!m.state.mission.core.carried);
  const safe=m.state.mission.core.island;
  flyTo(m,28,13,2);flyTo(m,40,13,1.5);flyTo(m,52,6.95,1.8);advance(m,1);
  assert.equal(m.state.checkpoint,8);assert(!m.state.completed);assert.equal(m.state.mission.core.island,safe);
  m.dispatch({type:'rescue'});assert.equal(m.state.checkpoint,safe);near(m.state.position.x,m.state.islands[safe].x);
  assert(!m.state.mission.core.carried);m.dispatch({type:'poke',direction:-1});
  assert(advance(m,.8).some(e=>e.type==='core'&&e.carried));
});
test('world switching freezes mission timers and hazards; restart affects only the active mission', () => {
  const m=createGardenModel(3);launch(m,...SOLUTION_ROUTES[3][0]);const storm=m.state;
  m.dispatch({type:'aim',x:-1,y:-1});m.dispatch({type:'level',level:4});advance(m,4);
  m.dispatch({type:'level',level:3});assert.deepEqual(m.state,storm);
  m.dispatch({type:'level',level:0});launch(m,...SOLUTION_ROUTES[0][0]);launch(m,...SOLUTION_ROUTES[0][1]);const garden=m.state;
  m.dispatch({type:'level',level:3});m.dispatch({type:'restart'});assert.deepEqual(m.state,createGardenModel(3).state);
  m.dispatch({type:'level',level:0});assert.deepEqual(m.state,garden);
});
test('fast falling cannot tunnel through a sanctuary; rescue clears input without losing earned mission progress', () => {
  const m=createGardenModel();launch(m,0,-2.6,.5);m.dispatch({type:'aim',x:0,y:2.6});m.dispatch({type:'release'});
  assert(m.step(1).some(e=>e.type==='land'&&e.island===0));assert(m.state.position.y>=1.55-EPSILON);
  m.dispatch({type:'aim',x:-.5,y:-.5});m.dispatch({type:'rescue'});assert.equal(m.state.aim,null);assert.equal(m.state.held,false);
});
const EPSILON=1e-8;
test('malformed commands, extreme finite vectors, and invalid level choices never corrupt simulation', () => {
  const m=createGardenModel();
  for(const action of [null,undefined,{},7,{type:'aim',x:NaN,y:0},{type:'aim',x:Infinity,y:1},{type:'hold',held:'yes'},{type:'level',level:-1},{type:'level',level:5}]){
    assert.deepEqual(m.dispatch(action),[]);
  }
  for(const dt of [NaN,Infinity,-1,0,'1'])assert.deepEqual(m.step(dt),[]);
  for(const power of [NaN,Infinity,-Infinity,'1',-100,100]){
    m.dispatch({type:'slap',power});m.step(Number.MAX_VALUE);finite(m.state);
  }
});
