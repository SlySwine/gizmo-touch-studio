import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GARDEN, LEVELS, createGardenModel } from '../dist/garden-model.js';

const STEP = 1 / 120;
const near = (a, b, message = '') => assert(Math.abs(a - b) < 1e-7, message + ': ' + a + ' != ' + b);
const activated = events => events.filter(e => e.type === 'target' && e.status === 'activated');

// Reproducible public-input solutions; useful for calibrating real pointer browser QA.
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
function finite(state) {
  for (const n of [state.position.x,state.position.y,state.velocity.x,state.velocity.y,state.elapsed]) assert(Number.isFinite(n));
  assert(Math.hypot(state.velocity.x,state.velocity.y) <= GARDEN.maxSpeed + 1e-7);
}

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
test('holding pauses flight and mission phase, and cancel resumes without launch', () => {
  const m = createGardenModel(3); launch(m,-.7,-.6,.2); const moving=m.state;
  m.dispatch({type:'aim',x:-1,y:-1}); const paused=m.state; advance(m,5); assert.deepEqual(m.state,paused);
  m.dispatch({type:'cancel'}); assert.deepEqual(m.state.velocity,moving.velocity);
  assert.equal(m.state.launches,moving.launches); assert.equal(m.state.aim,null); advance(m,.1);
  assert(m.state.position.x>moving.position.x);
});
test('120/60/30 Hz and irregular equal-time frames produce identical mission and physics state', () => {
  const chunks=[Array(360).fill(1/120),Array(180).fill(1/60),Array(90).fill(1/30),Array.from({length:100},()=>[.013,.017]).flat()];
  const results=chunks.map(times=>{const m=createGardenModel(3);m.dispatch({type:'slap',power:.7});return{events:times.flatMap(dt=>m.step(dt)),state:m.state};});
  for(const r of results.slice(1))assert.deepEqual(r,results[0]);
});
for (const [index, layout] of LEVELS.entries()) {
  test(layout.name + ': real public gestures finish the distinct mission with no rescue', () => {
    const m=createGardenModel(layout.id), events=[];
    for(const route of SOLUTION_ROUTES[index])events.push(...launch(m,...route));
    assert(m.state.completed); assert.equal(m.state.mission.progress,m.state.mission.total);
    assert.equal(activated(events).length,layout.mission.targets.length);
    assert.equal(events.filter(e=>e.type==='complete').length,1);
    assert.equal(m.state.rescues,0); assert(m.state.exit.open); assert.deepEqual(m.state.completedLevels,[index]);
    assert(!advance(m,.5).some(e=>e.type==='complete'));
  });
  test(layout.name + ': repeated preview exactly matches live flight and changes no mission state', () => {
    const m=createGardenModel(index);
    const [x,y]=SOLUTION_ROUTES[index][0];m.dispatch({type:'aim',x,y});
    const before=m.state, predicted=m.trajectory();assert.deepEqual(m.trajectory(),predicted);assert.deepEqual(m.state,before);
    m.dispatch({type:'release'});const actual=[{...m.state.position}];
    for(let tick=1;tick<=720;tick++){
      const events=m.step(STEP);if(events.some(e=>e.type==='rescue'))break;
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
test('resonance rejects a slow crossing, accepts a fast reverse crossing, and never double charges', () => {
  const m=createGardenModel();flyTo(m,4.8,4.7,.8);
  const slow=flyTo(m,6.8,3.6,1);assert(slow.some(e=>e.status==='need-speed'));assert.equal(m.state.mission.progress,0);
  const fast=flyTo(m,4.8,4.7,.3);assert.equal(activated(fast).length,1);assert.equal(m.state.mission.progress,1);
  const again=flyTo(m,6.8,4.7,.3);assert.equal(activated(again).length,0);assert.equal(m.state.mission.progress,1);
});
test('guardian locks reject weak contact; strong Slap eligibility requires actual nearby contact', () => {
  for(const [power,expected] of [[.59,0],[.6,1]]){
    const m=createGardenModel(1);flyTo(m,3.5,3.3,.9);m.dispatch({type:'slap',power});
    assert.equal(m.state.mission.progress,0,'A remote Slap never opens a lock');
    const events=flyTo(m,5,3.3,.65);assert.equal(m.state.mission.progress,expected);
    assert(events.some(e=>e.status===(expected?'activated':'need-impact')));
  }
  const m=createGardenModel(1);flyTo(m,3.5,3.3,.9);m.dispatch({type:'slap',power:1});
  m.dispatch({type:'level',level:1});
  assert(flyTo(m,5,3.3,.65).some(e=>e.status==='need-impact'),'A suspended old slap cannot break a lock');
});
test('wrong mirror order resets the sequence, and a closed beam gate physically rejects a fast crossing', () => {
  const m=createGardenModel(2);
  assert(flyTo(m,4.6,3.4,1.2).some(e=>e.status==='wrong-order'));assert.equal(m.state.mission.progress,0);
  flyTo(m,9.3,4.7,1.2);assert.equal(m.state.mission.progress,1);
  assert(flyTo(m,19.2,5.5,1.8).some(e=>e.status==='wrong-order'));assert.equal(m.state.mission.progress,0);
  m.dispatch({type:'restart'});flyTo(m,15,9,1.8);flyTo(m,24,7,1);
  m.dispatch({type:'slap',power:1});const events=advance(m,.4);
  assert(events.some(e=>e.type==='gate'&&e.blocked));assert(m.state.position.x<27-.65/2-.42);
  assert.equal(m.state.mission.gateOpen,false);assert.equal(m.state.completed,false);
});
test('storm timer starts on first stabilizer, pauses with hold, times out once, and permits retry', () => {
  const m=createGardenModel(3);assert.equal(m.state.mission.remainingTime,null);
  launch(m,...SOLUTION_ROUTES[3][0]);assert.equal(m.state.mission.progress,1);
  const remaining=m.state.mission.remainingTime;m.dispatch({type:'hold',held:true});advance(m,40);
  near(m.state.mission.remainingTime,remaining);m.dispatch({type:'cancel'});
  const events=advance(m,31);assert.equal(events.filter(e=>e.type==='timeout').length,1);
  assert.equal(m.state.mission.progress,0);assert.equal(m.state.mission.remainingTime,null);assert(!m.state.exit.open);
  m.dispatch({type:'poke'});assert(advance(m,.1).some(e=>e.status==='activated'));assert.equal(m.state.mission.progress,1);
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
  for(let tick=0;tick<720;tick++){m.step(STEP);near(m.state.position.x,m.state.islands[3].x);near(m.state.position.y,m.state.islands[3].y+m.layout.halfHeight);}
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
