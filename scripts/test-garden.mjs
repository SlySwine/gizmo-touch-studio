import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GARDEN, createGardenModel } from '../dist/garden-model.js';

const STEP = 1 / 120;
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);

function until(model, predicate, limit = 1200) {
  const all = [];
  for (let frame = 0; frame < limit; frame++) {
    const events = model.step(STEP);
    all.push(...events);
    if (predicate(events, model.state)) return all;
  }
  assert.fail('The expected garden event did not happen');
}

function aimAtIsland(model, id, flightTime = 1.25) {
  // A player's approximate ballistic aim. It deliberately does not duplicate the model's integrator.
  const island = GARDEN.islands[id], start = model.state.position;
  model.dispatch({
    type: 'aim', x: -(island.x - start.x) / flightTime / 5.2,
    y: -(island.y + .55 - start.y + 4 * flightTime ** 2 - 3 * flightTime) / flightTime / 5.2,
  });
}

function visit(model, id, flightTime) {
  aimAtIsland(model, id, flightTime);
  model.dispatch({ type: 'release' });
  const events = until(model, events => events.some(event => event.type === 'land' || event.type === 'rescue'));
  assert.equal(model.state.checkpoint, id, `Reach island ${id}`);
  assert(!events.some(event => event.type === 'rescue'));
  return events;
}

function assertFinite(state) {
  for (const number of [state.position.x, state.position.y, state.velocity.x, state.velocity.y, state.elapsed]) {
    assert(Number.isFinite(number));
  }
  assert(Math.hypot(state.velocity.x, state.velocity.y) <= GARDEN.maxSpeed + 1e-8);
  if (state.aim) assert(Math.hypot(state.aim.x, state.aim.y) <= GARDEN.maxDrag + 1e-8);
}

test('layout is deeply immutable and state snapshots cannot alter the model', () => {
  assert.equal(GARDEN.islands.length, 9);
  assert.equal(GARDEN.stars.length, 8);
  assert.deepEqual(GARDEN.islands.map(island => island.x), [0, 5, 10, 15, 20, 25, 30, 35, 40]);
  for (const object of [GARDEN, GARDEN.islands, GARDEN.stars, GARDEN.constellation, ...GARDEN.islands, ...GARDEN.stars]) {
    assert(Object.isFrozen(object));
  }
  const model = createGardenModel();
  model.dispatch({ type: 'aim', x: -.5, y: -.5 });
  const snapshot = model.state;
  snapshot.position.x = 900;
  snapshot.velocity.y = 900;
  snapshot.stars.push(9);
  snapshot.aim.x = 900;
  assert.equal(model.state.position.x, 0);
  assert.equal(model.state.velocity.y, 0);
  assert.deepEqual(model.state.stars, []);
  assert.equal(model.state.aim.x, -.5);
});

test('stronger pull and slap launch farther and faster than a poke', () => {
  const speeds = [], distances = [];
  for (const amount of [.25, .5, 1, 1.5]) {
    const model = createGardenModel();
    model.dispatch({ type: 'aim', x: -amount, y: -amount });
    const event = model.dispatch({ type: 'release' })[0];
    assert.equal(event.type, 'launch');
    speeds.push(Math.hypot(event.velocity.x, event.velocity.y));
    model.step(.2);
    distances.push(model.state.position.x);
  }
  for (let index = 1; index < speeds.length; index++) {
    assert(speeds[index] > speeds[index - 1]);
    assert(distances[index] > distances[index - 1]);
  }
  const slapDistances = [];
  for (const power of [0, .3, .7, 1]) {
    const model = createGardenModel();
    model.dispatch({ type: 'slap', power, direction: 1 });
    model.step(.3);
    slapDistances.push(model.state.position.x);
  }
  for (let index = 1; index < slapDistances.length; index++) assert(slapDistances[index] > slapDistances[index - 1]);
  const poke = createGardenModel();
  poke.dispatch({ type: 'poke', direction: 1 });
  poke.step(.3);
  assert(poke.state.position.x < slapDistances[0]);
  assert(poke.state.position.y > GARDEN.islands[0].y + GARDEN.halfHeight);
});

test('drag is capped by length, release is opposite the drag, and repeated release does not relaunch', () => {
  const model = createGardenModel();
  model.dispatch({ type: 'aim', x: -20, y: -20 });
  near(Math.hypot(model.state.aim.x, model.state.aim.y), 2.6, 'Capped drag');
  near(model.state.aim.x, model.state.aim.y, 'Preserved direction');
  model.dispatch({ type: 'release' });
  assert(model.state.velocity.x > 0);
  assert(model.state.velocity.y > 3);
  assert.equal(model.state.launches, 1);
  assert.deepEqual(model.dispatch({ type: 'release' }), []);
  assert.equal(model.state.launches, 1);
});

test('hold freezes an airborne character; cancel clears aim without injecting a launch', () => {
  const model = createGardenModel();
  model.dispatch({ type: 'slap', power: .6 });
  model.step(.2);
  const flying = model.state;
  model.dispatch({ type: 'hold', held: true });
  model.step(.8);
  assert.deepEqual(model.state.position, flying.position);
  assert.deepEqual(model.state.velocity, flying.velocity);
  assert.equal(model.state.elapsed, flying.elapsed);
  model.dispatch({ type: 'aim', x: -.8, y: -.5 });
  assert.deepEqual(model.dispatch({ type: 'cancel' }), []);
  assert.equal(model.state.aim, null);
  assert.equal(model.state.held, false);
  assert.equal(model.state.launches, 1);
  assert.deepEqual(model.state.velocity, flying.velocity);
  model.step(.1);
  assert(model.state.position.x > flying.position.x);
});

test('equal elapsed time produces the same flight and events at different frame rates', () => {
  const simulations = [Array(360).fill(1 / 120), Array(180).fill(1 / 60), Array(90).fill(1 / 30), Array.from({ length: 100 }, () => [.013, .017]).flat()];
  const results = simulations.map(chunks => {
    const model = createGardenModel();
    model.dispatch({ type: 'slap', power: .7 });
    const events = chunks.flatMap(dt => model.step(dt));
    return { state: model.state, events };
  });
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
});

test('preview uses actual flight, ends at first contact, and never mutates gameplay', () => {
  const model = createGardenModel();
  aimAtIsland(model, 1);
  const before = model.state;
  const preview = model.trajectory();
  assert.deepEqual(model.state, before);
  assert.deepEqual(model.trajectory(), preview);
  const actual = [{ ...model.state.position }];
  model.dispatch({ type: 'release' });
  for (let tick = 1; tick < 720; tick++) {
    const events = model.step(STEP);
    const landed = events.some(event => event.type === 'land');
    if (tick % 4 === 0 || landed) actual.push({ ...model.state.position });
    if (landed) break;
  }
  assert.deepEqual(actual, preview);
  assert.equal(model.state.checkpoint, 1);
  assert.deepEqual(model.state.stars, [1]);
  assert.deepEqual(model.trajectory(), []);
});

test('fast falls cannot tunnel through an island even with a one-second frame', () => {
  const model = createGardenModel();
  model.dispatch({ type: 'aim', x: 0, y: -2.6 });
  model.dispatch({ type: 'release' });
  model.step(.5);
  assert(model.state.position.y > 7);
  model.dispatch({ type: 'aim', x: 0, y: 2.6 });
  model.dispatch({ type: 'release' });
  const events = model.step(1);
  const hit = events.find(event => event.type === 'land');
  assert(hit && hit.island === 0 && hit.impact > 7);
  assert(model.state.position.y >= GARDEN.islands[0].y + GARDEN.halfHeight - 1e-8);
  assert(!events.some(event => event.type === 'rescue'));
});

test('coarse frames retain star collection and one-way platforms permit upward passage', () => {
  const model = createGardenModel();
  aimAtIsland(model, 1);
  model.dispatch({ type: 'release' });
  const early = model.step(.25);
  assert(!early.some(event => event.type === 'land'));
  assert(model.state.position.y > 2.35);
  const events = [...early, ...model.step(1), ...model.step(1)];
  assert.equal(events.filter(event => event.type === 'star' && event.id === 1).length, 1);
  assert(events.some(event => event.type === 'land' && event.island === 1));
  assert.deepEqual(model.state.stars, [1]);
  assert(model.state.grounded);
});

test('falling rescues to the latest sanctuary and preserves progress', () => {
  const model = createGardenModel();
  visit(model, 1);
  const collected = model.state.stars;
  model.dispatch({ type: 'slap', power: 1, direction: -1 });
  const events = until(model, events => events.some(event => event.type === 'rescue'));
  assert(events.some(event => event.type === 'rescue' && event.island === 1));
  assert.deepEqual(model.state.stars, collected);
  assert.deepEqual(model.state.position, { x: 5, y: 2.35 });
  assert.deepEqual(model.state.velocity, { x: 0, y: 0 });
  assert(model.state.grounded);
  assert.equal(model.state.held, false);
  model.dispatch({ type: 'aim', x: -.5, y: -.5 });
  model.dispatch({ type: 'rescue' });
  assert.equal(model.state.aim, null);
  assert.equal(model.state.held, false);
  assert.deepEqual(model.state.stars, collected);
});

test('sanctuary follows the latest landing, including backtracking, and stars score once', () => {
  const model = createGardenModel();
  visit(model, 1);
  visit(model, 2);
  const events = visit(model, 1);
  assert.equal(model.state.checkpoint, 1);
  assert(!events.some(event => event.type === 'star'));
  model.dispatch({ type: 'rescue' });
  assert.equal(model.state.position.x, 5);
  assert.deepEqual(model.state.stars, [1, 2]);
});

test('all eight lights then final landing completes once, with ordered events', () => {
  const model = createGardenModel();
  const events = [];
  for (let id = 1; id <= 7; id++) events.push(...visit(model, id));
  aimAtIsland(model, 8);
  model.dispatch({ type: 'release' });
  events.push(...until(model, batch => batch.some(event => event.type === 'star' && event.id === 8)));
  assert.equal(model.state.stars.length, 8);
  assert.equal(model.state.completed, false, 'Collecting the final light in flight is not a landing');
  events.push(...until(model, batch => batch.some(event => event.type === 'complete')));
  assert.equal(model.state.completed, true);
  assert.equal(model.state.checkpoint, 8);
  assert.equal(events.filter(event => event.type === 'star').length, 8);
  assert(events.findIndex(event => event.type === 'star' && event.id === 8) < events.findIndex(event => event.type === 'complete'));
  assert.equal(events.at(-2).type, 'land');
  assert.equal(events.at(-1).type, 'complete');
  assert(!model.step(1).some(event => event.type === 'complete'));
  model.dispatch({ type: 'restart' });
  assert.deepEqual(model.state, createGardenModel().state);
});

test('sliding into the last light while supported by the final island completes once', () => {
  const model = createGardenModel();
  for (let id = 1; id <= 7; id++) visit(model, id);
  aimAtIsland(model, 8);
  // Land left of the light, then let the remaining horizontal momentum reach it.
  const landingX = 39.4, flightTime = 1.25;
  model.dispatch({
    type: 'aim',
    x: -(landingX - model.state.position.x) / flightTime / 5.2,
    y: model.state.aim.y,
  });
  model.dispatch({ type: 'release' });
  until(model, events => events.some(event => event.type === 'land'));
  assert.equal(model.state.checkpoint, 8);
  assert.equal(model.state.grounded, true);
  assert.equal(model.state.stars.length, 7);
  assert.equal(model.state.completed, false);
  const events = model.step(1);
  assert.deepEqual(events, [{ type: 'star', id: 8, count: 8 }, { type: 'complete' }]);
  assert.equal(model.state.completed, true);
  assert.equal(model.state.grounded, true);
  assert(!model.step(1).some(event => event.type === 'complete'));
});

test('reaching the constellation with a missing light does not complete', () => {
  const model = createGardenModel();
  visit(model, 2, 1.6); // Fly over the first light instead of collecting it.
  for (let id = 3; id <= 8; id++) visit(model, id);
  assert.equal(model.state.checkpoint, 8);
  assert.deepEqual(model.state.stars, [2, 3, 4, 5, 6, 7, 8]);
  assert.equal(model.state.completed, false);
});

test('malformed commands and times remain finite without corrupting progress', () => {
  const model = createGardenModel();
  const malformed = [null, undefined, false, 7, 'poke', {}, { type: 'unknown' },
    { type: 'aim', x: NaN, y: 0 }, { type: 'aim', x: Infinity, y: -Infinity },
    { type: 'aim', x: '2', y: -1 }, { type: 'hold', held: 'yes' }];
  for (const action of malformed) assert.deepEqual(model.dispatch(action), []);
  assert.deepEqual(model.state, createGardenModel().state);
  for (const dt of [NaN, Infinity, -Infinity, -1, 0, undefined, '1']) assert.deepEqual(model.step(dt), []);
  model.dispatch({ type: 'aim', x: Number.MAX_VALUE, y: -Number.MAX_VALUE });
  assertFinite(model.state);
  model.dispatch({ type: 'release' });
  for (const power of [NaN, Infinity, -Infinity, '1', -100, 100]) {
    model.dispatch({ type: 'slap', power, direction: NaN });
    model.step(Number.MAX_VALUE);
    assertFinite(model.state);
  }
  assert(model.state.stars.every(id => Number.isInteger(id) && id >= 1 && id <= 8));
});
