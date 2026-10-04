import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectGardenGoal } from '../dist/garden-guidance.js';

test('after skipping a ring, every guide selects the nearest unfinished ring', () => {
  const state = { position: { x: 12, y: 5 }, mission: { targets: [
    { id: 'skipped', x: 4.5, y: 3.1, next: true },
    { id: 'nearby', x: 13.5, y: 4.9, next: true },
  ] } };
  const before = structuredClone(state);
  assert.equal(selectGardenGoal(state).id, 'nearby');
  assert.deepEqual(state, before);
  state.mission.targets[1].completed = true;
  assert.equal(selectGardenGoal(state).id, 'skipped');
});
test('ordered mirrors keep their required order even when another is closer', () => {
  assert.equal(selectGardenGoal({ position: { x: 4, y: 3 }, mission: { targets: [
    { id: 'first', x: 9.3, y: 4.7, next: true },
    { id: 'later', x: 4.6, y: 3.4, next: false },
  ] } }).id, 'first');
});
test('dropped cargo overrides a distant relay and an already opened exit', () => {
  const state = { position: { x: 50, y: 6 }, mission: { gateOpen: true,
    core: { carried: false, x: 4, y: 3 }, targets: [{ x: 51, y: 6, next: true }] }, exit: { x: 52, y: 7 } };
  assert.deepEqual(selectGardenGoal(state), { carried: false, x: 4, y: 3, kind: 'core' });
  state.mission.core.carried = true;
  assert.deepEqual(selectGardenGoal(state), { x: 52, y: 7, kind: 'exit' });
  state.completed = true;
  assert.equal(selectGardenGoal(state), null);
});
