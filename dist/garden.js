import * as THREE from 'three';
import { LEVELS, createGardenModel } from './garden-model.js';
import { createGardenWorld } from './garden-world.js';
import { selectGardenGoal } from './garden-guidance.js';

// Worlds own their journey, scenery and camera. The studio owns the one Gizmo.
export function createGarden({ scene, camera, pivot, ground, lights, coarse, assets, onTransition, onEvent, onWorldChange }) {
  const initialSlug = location.hash.split('/')[1];
  const initialLevel = Math.max(0, LEVELS.findIndex(level => level.id === initialSlug));
  const model = createGardenModel(initialLevel);
  let world = createGardenWorld({ scene, coarse, layout: model.layout, assets });
  const page = document.querySelector('#studio');
  const canvas = document.querySelector('#canvas');
  const studioLabel = canvas.getAttribute('aria-label');
  const play = document.querySelector('#play');
  const count = document.querySelector('#garden-count');
  const progress = document.querySelector('#garden-progress');
  const picker = document.querySelector('#garden-level');
  const victory = document.querySelector('#garden-victory');
  const heading = document.querySelector('#garden-heading');
  const nextWorld = document.querySelector('#garden-next');
  const charge = document.querySelector('#garden-charge');
  const beacon = document.querySelector('#garden-beacon');
  const lightOrigins = lights.map(light => ({ light, position: light.position.clone(), target: light.isSpotLight ? light.target.position.clone() : null }));
  const look = new THREE.Vector3(), desired = new THREE.Vector3(), screen = new THREE.Vector3(), lightOffset = new THREE.Vector3(), goalScreen = new THREE.Vector3();
  let active = false, initializedCamera = false;
  let keyboardAim = { x: -.8, y: -.65 };
  let elapsed = 0, prediction = null, predictionAt = -Infinity, victoryDismissed = false;
  let aimDistance = null;

  LEVELS.forEach((level, index) => {
    const option = document.createElement('option');
    option.value = String(index); option.textContent = `${index + 1} · ${level.name}`; picker.append(option);
  });
  function makeProgress() {
    progress.replaceChildren();
    const targets = model.layout.mission?.targets || model.layout.stars;
    for (const target of targets) {
      const pip = document.createElement('span');
      pip.className = 'mission-pip'; pip.dataset.target = String(target.id);
      pip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 9-8 9-8-9z"/><circle cx="12" cy="12" r="3"/></svg>';
      progress.append(pip);
    }
  }
  makeProgress();
  function deliver(events = []) {
    for (const event of events) {
      if (event.type === 'level') continue;
      const position = model.state.position;
      world.burst({ ...event, x: event.x ?? position.x, y: event.y ?? position.y });
      onEvent(event);
      if (event.type === 'complete') victoryDismissed = false;
      if (event.type === 'target' && event.status === 'activated') {
        count.classList.remove('collected');
        requestAnimationFrame(() => count.classList.add('collected'));
      }
    }
    sync();
  }
  function selectLevel(level, updateHash = true) {
    // End the physical pointer gesture before replacing its simulation/world.
    onTransition('level');
    model.dispatch({ type: 'level', level });
    world.dispose();
    world = createGardenWorld({ scene, coarse, layout: model.layout, assets });
    world.group.visible = active;
    initializedCamera = false; makeProgress(); prediction = null; predictionAt = -Infinity; aimDistance = null; victoryDismissed = false;
    keyboardAim = { x: -.8, y: -.65 };
    onWorldChange?.(model.layout);
    onEvent({type:'level',missionType:model.layout.mission?.type});
    if (active && updateHash) history.pushState(null, '', `#garden/${model.layout.id}`);
    sync(); update(elapsed, 0);
  }
  function dispatch(action) {
    if (action.type === 'level') { selectLevel(action.level); return; }
    deliver(model.dispatch(action));
    refreshPrediction();
  }
  function refreshPrediction() {
    const state = model.state;
    prediction = state.aim ? model.predict() : null;
    predictionAt = state.elapsed;
  }
  function objectiveFor(state) {
    return selectGardenGoal(state);
  }
  function syncBeacon(state) {
    const shot = state.aim ? prediction?.outcome : null;
    const goal = shot ? { ...shot, kind: 'preview' } : objectiveFor(state), width = canvas.clientWidth, height = canvas.clientHeight;
    beacon.hidden = !goal || state.completed;
    if (beacon.hidden) return;
    goalScreen.set(goal.x, goal.y, 0).project(camera);
    const x = (goalScreen.x + 1) * width / 2, y = (1 - goalScreen.y) * height / 2;
    const left = 32, right = width - 32, top = Math.min(190, height * .3), bottom = height - 38;
    beacon.hidden = x >= left && x <= right && y >= top && y <= bottom;
    if (beacon.hidden) return;
    const bx = THREE.MathUtils.clamp(x, left, right), by = THREE.MathUtils.clamp(y, top, bottom);
    beacon.style.left = `${bx}px`; beacon.style.top = `${by}px`;
    beacon.querySelector('i').style.transform = `rotate(${Math.atan2(y-by, x-bx)}rad)`;
    text(beacon.querySelector('span'), shot ? shot.type === 'landing' ? '◎' : shot.type === 'flight' ? '○' : '×' : goal.kind === 'core' ? '◈' : goal.kind === 'exit' ? '✧' : goal.kind === 'lock' ? '♢' : goal.order ? String(goal.order) : '○');
    beacon.dataset.kind = goal.kind;
    beacon.dataset.outcome = shot?.type || '';
    beacon.setAttribute('aria-label', shot ? shot.type === 'landing' ? 'Predicted landing in this direction' : shot.type === 'flight' ? 'Flight continues beyond view' : 'This launch meets danger in this direction' : goal.kind === 'core' ? 'Dropped dreamcore in this direction. Rescue returns you to it.' : goal.kind === 'exit' ? 'Open exit in this direction' : 'Next glowing goal in this direction');
  }
  function text(element, value) { if (element.textContent !== value) element.textContent = value; }
  function sync() {
    const state = model.state;
    const mission = state.mission;
    const completed = mission ? mission.targets.filter(target => target.completed).map(target => String(target.id)) : state.stars.map(String);
    text(count, `${mission?.progress ?? state.stars.length} / ${mission?.total ?? state.totalStars}`);
    text(document.querySelector('#garden-mission'), mission?.title || model.layout.mission?.title || 'Wake the dream engine');
    const timer = document.querySelector('#garden-timer');
    timer.hidden = mission?.remainingTime == null || mission.progress === mission.total;
    if (!timer.hidden) { text(timer, `${Math.max(0,Math.ceil(mission.remainingTime))}s`); timer.classList.toggle('urgent', mission.remainingTime < 10); }
    const core = document.querySelector('#garden-core');
    core.hidden = !mission?.core; core.classList.toggle('carried', !!mission?.core?.carried);
    core.setAttribute('aria-label', mission?.core?.carried ? 'Dream core carried' : 'Dream core dropped nearby');
    if (active) {
      const lostCore = !!mission?.core && !mission.core.carried, rescue = document.querySelector('#reset');
      text(rescue.querySelector('span'), lostCore ? 'Find core' : 'Rescue');
      rescue.classList.toggle('lost-core', lostCore);
      rescue.setAttribute('aria-label', lostCore ? 'Return to the dropped dreamcore' : 'Return to your last safe island');
      rescue.title = lostCore ? 'Return to the dropped dreamcore (R)' : 'Return to your last safe island (R)';
    }
    picker.value = String(state.levelIndex);
    for (const option of picker.options) {
      const index = Number(option.value);
      text(option, `${index + 1} · ${LEVELS[index].name}${state.completedLevels.includes(index) ? ' ✓' : ''}`);
    }
    for (const pip of progress.children) {
      const target = mission?.targets.find(target => String(target.id) === pip.dataset.target);
      pip.classList.toggle('found', completed.includes(pip.dataset.target));
      pip.classList.toggle('next', !!target?.next);
    }
    text(heading, state.completedLevels.length === LEVELS.length ? 'The dream is whole again.' : ({resonance:'Engine awake.',rescue:'Guardian freed.',sequence:'Light restored.',timed:'Storm calmed.',escort:'Dream delivered.'})[mission?.type] || 'World complete.');
    nextWorld.hidden = state.levelIndex === LEVELS.length - 1;
    victory.hidden = !active || !state.completed || victoryDismissed;
    const power = state.aim ? Math.min(1, Math.hypot(state.aim.x, state.aim.y) / model.layout.maxDrag) : 0;
    charge.hidden = !state.aim;
    charge.style.setProperty('--charge', `${power * 100}%`);
    text(charge.querySelector('span'), `${Math.round(power * 100)}%`);
    if (active) document.title = `Gizmo · ${state.levelName}`;
  }
  function setMode(next, updateHash = true) {
    if (active === next) return;
    dispatch({ type: 'cancel' });
    onTransition(next ? 'garden' : 'studio');
    active = next;
    world.group.visible = active;
    page.classList.toggle('in-garden', active);
    document.title = active ? `Gizmo · ${model.layout.name}` : 'Gizmo · Touch Studio';
    canvas.setAttribute('aria-label', active ? 'Gizmo adventure. Complete the world mission and reach its portal. Pull back and release to launch. Poke, Slap, Brush and Turn work here. In Pull mode, arrows aim and Space launches; Escape cancels. R returns to your last safe landing. Studio pauses the journey and keeps your hairstyle.' : studioLabel);
    document.querySelector('#reset span').textContent = active ? 'Rescue' : 'Reset';
    document.querySelector('#garden-hud').hidden = !active;
    document.querySelector('#garden-guide').hidden = !active;
    if (!active) beacon.hidden = true;
    play.querySelector('span').textContent = active ? 'Studio' : 'Play';
    play.setAttribute('aria-label', active ? 'Return to the grooming studio' : 'Play Gizmo’s worlds');
    play.setAttribute('aria-pressed', String(active));
    document.querySelector('#reset').title = active ? 'Return to your last safe island (R)' : 'Reset Gizmo (R)';
    document.querySelector('#reset').setAttribute('aria-label', active ? 'Return to your last safe island' : 'Reset shape and fur');
    for (const mesh of ground) mesh.visible = !active;
    pivot.scale.setScalar(active ? .31 : 1);
    if (!active) {
      document.querySelector('#reset').classList.remove('lost-core');
      pivot.position.set(0, 1.8, 0);
      for (const item of lightOrigins) { item.light.position.copy(item.position); if (item.target) item.light.target.position.copy(item.target); }
      camera.fov = 34; camera.far = 60;
      camera.position.set(0, 2.3, Math.max(9.8, 9.2 / camera.aspect));
      camera.lookAt(0, 2.06, 0); camera.updateProjectionMatrix();
    } else {
      initializedCamera = false; camera.fov = 43; camera.far = 220;
      camera.updateProjectionMatrix(); onWorldChange?.(model.layout); update(elapsed, 0); onEvent({type:'level',missionType:model.layout.mission?.type});
    }
    if (updateHash) history.pushState(null, '', active ? `#garden/${model.layout.id}` : '#studio');
    sync();
    if (!active && document.activeElement?.closest('#garden-hud,#garden-victory')) canvas.focus({ preventScroll: true });
  }
  function update(time, dt) {
    elapsed = time;
    if (!active) return;
    if (!document.hidden) deliver(model.step(dt));
    const state = model.state;
    pivot.position.set(state.position.x, state.position.y, 0);
    const route = state.islands || model.layout.islands;
    const currentIndex = Math.max(0, route.findIndex(island => island.id === state.checkpoint));
    const next = route[Math.min(currentIndex + 1, route.length - 1)];
    const objective = objectiveFor(state);
    const targetX = objective?.x ?? next.x;
    const span = Math.min(10.4, Math.max(7.5, Math.abs(next.x - state.position.x) + 3.6));
    // Portrait view keeps room on both sides for a full finger pull.
    const maxAhead = camera.aspect < .85 ? span * .12 : 3.8;
    const ahead = THREE.MathUtils.clamp((targetX - state.position.x) * .45, -maxAhead, maxAhead);
    desired.set(state.position.x + ahead, state.position.y + 1.45, 0);
    if (!initializedCamera) { look.copy(desired); initializedCamera = true; }
    else look.lerp(desired, 1 - Math.exp(-dt * 4.2));
    const desiredDistance = Math.max(16.8, Math.min(28, span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * .5)) * camera.aspect)));
    if (!state.held) aimDistance = null;
    else aimDistance ??= camera.position.z || desiredDistance;
    const distance = aimDistance ?? desiredDistance;
    camera.position.set(look.x, look.y + 3.1, distance); camera.lookAt(look); camera.updateMatrixWorld();
    lightOffset.set(state.position.x, state.position.y - 1.8, 0);
    for (const item of lightOrigins) {
      item.light.position.copy(item.position).add(lightOffset);
      if (item.target) item.light.target.position.copy(item.target).add(lightOffset);
    }
    if (state.aim && (state.elapsed - predictionAt >= 1 / 30 || !prediction)) refreshPrediction();
    if (!state.aim) prediction = null;
    world.update({ time, dt, state, prediction, trajectory: prediction?.points || [], cameraTarget: look });
    syncBeacon(state);
  }
  function toolChanged(tool) { document.querySelector('#garden-guide').dataset.selectedTool = tool; }
  function key(event, tool) {
    if (!active || (event.key !== ' ' && !event.key.startsWith('Arrow'))) return false;
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === ' ' ? Math.sign((objectiveFor(model.state)?.x ?? Infinity) - model.state.position.x) || 1 : 1;
    if (tool === 'pull') {
      if (event.key === ' ') {
        if (!event.repeat) { if (!model.state.aim) dispatch({ type: 'aim', ...keyboardAim }); dispatch({ type: 'release' }); }
      } else {
        if (event.key === 'ArrowLeft') keyboardAim.x = Math.min(2.2, keyboardAim.x + .16);
        if (event.key === 'ArrowRight') keyboardAim.x = Math.max(-2.2, keyboardAim.x - .16);
        if (event.key === 'ArrowUp') keyboardAim.y = Math.max(-2.2, keyboardAim.y - .16);
        if (event.key === 'ArrowDown') keyboardAim.y = Math.min(2.2, keyboardAim.y + .16);
        dispatch({ type: 'aim', ...keyboardAim });
      }
      return true;
    }
    if (tool === 'poke') { if (!event.repeat) dispatch({ type: 'poke', direction }); return false; }
    return false;
  }
  const focusCanvas = () => canvas.focus({ preventScroll: true });
  play.disabled = false;
  play.addEventListener('click', () => { setMode(!active); focusCanvas(); });
  picker.addEventListener('change', () => selectLevel(Number(picker.value)));
  nextWorld.addEventListener('click', () => { selectLevel(Math.min(LEVELS.length - 1, model.state.levelIndex + 1)); focusCanvas(); });
  document.querySelector('#garden-continue').addEventListener('click', () => { victoryDismissed = true; sync(); focusCanvas(); });
  document.querySelector('#garden-again').addEventListener('click', () => { onTransition('level'); victoryDismissed = false; dispatch({ type: 'restart' }); initializedCamera = false; focusCanvas(); });
  window.addEventListener('popstate', () => {
    const slug = location.hash.split('/')[1];
    const level = Math.max(0, LEVELS.findIndex(item => item.id === slug));
    if (location.hash.startsWith('#garden') && level !== model.state.levelIndex) selectLevel(level, false);
    setMode(location.hash.startsWith('#garden'), false);
  });
  sync(); toolChanged('pull');
  if (location.hash.startsWith('#garden')) setMode(true, false);
  return {
    get active() { return active; }, get state() { return { ...model.state, preview: world.group.userData.preview || null, prediction: prediction?.outcome || null }; },
    get launchDirection() { const state = model.state; return Math.sign((objectiveFor(state)?.x ?? Infinity) - state.position.x) || 1; },
    get screenPosition() { screen.copy(pivot.position).project(camera); return { x: screen.x, y: screen.y }; },
    dispatch, update, setMode, toolChanged, key,
  };
}
