import * as THREE from 'three';
import { LEVELS, createGardenModel } from './garden-model.js';
import { createGardenWorld } from './garden-world.js';

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
  const lightOrigins = lights.map(light => ({ light, position: light.position.clone(), target: light.isSpotLight ? light.target.position.clone() : null }));
  const look = new THREE.Vector3(), desired = new THREE.Vector3(), screen = new THREE.Vector3(), lightOffset = new THREE.Vector3();
  let active = false, initializedCamera = false;
  let keyboardAim = { x: -.8, y: -.65 };
  let elapsed = 0, aimPath = [], victoryDismissed = false;

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
      world.burst({ ...event, x: position.x, y: position.y });
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
    initializedCamera = false; makeProgress(); aimPath = []; victoryDismissed = false;
    keyboardAim = { x: -.8, y: -.65 };
    onWorldChange?.(model.layout);
    onEvent({type:'level',missionType:model.layout.mission?.type});
    if (active && updateHash) history.pushState(null, '', `#garden/${model.layout.id}`);
    sync(); update(elapsed, 0);
  }
  function dispatch(action) {
    if (action.type === 'level') { selectLevel(action.level); return; }
    deliver(model.dispatch(action));
    aimPath = model.state.aim ? model.trajectory() : [];
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
    play.querySelector('span').textContent = active ? 'Studio' : 'Play';
    play.setAttribute('aria-label', active ? 'Return to the grooming studio' : 'Play Gizmo’s worlds');
    play.setAttribute('aria-pressed', String(active));
    document.querySelector('#reset').title = active ? 'Return to your last safe island (R)' : 'Reset Gizmo (R)';
    document.querySelector('#reset').setAttribute('aria-label', active ? 'Return to your last safe island' : 'Reset shape and fur');
    for (const mesh of ground) mesh.visible = !active;
    pivot.scale.setScalar(active ? .31 : 1);
    if (!active) {
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
    const objective = state.mission?.targets.find(target => target.next);
    const targetX = objective && Math.abs(objective.x - state.position.x) < 8 ? objective.x : next.x;
    const ahead = THREE.MathUtils.clamp((targetX - state.position.x) * .45, -3.8, 3.8);
    desired.set(state.position.x + ahead, state.position.y + 1.45, 0);
    if (!initializedCamera) { look.copy(desired); initializedCamera = true; }
    else look.lerp(desired, 1 - Math.exp(-dt * 4.2));
    const span = Math.min(10.4, Math.max(7.5, Math.abs(next.x - state.position.x) + 3.6));
    const distance = Math.max(16.8, Math.min(28, span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * .5)) * camera.aspect)));
    camera.position.set(look.x, look.y + 3.1, distance); camera.lookAt(look); camera.updateMatrixWorld();
    lightOffset.set(state.position.x, state.position.y - 1.8, 0);
    for (const item of lightOrigins) {
      item.light.position.copy(item.position).add(lightOffset);
      if (item.target) item.light.target.position.copy(item.target).add(lightOffset);
    }
    world.update({ time, dt, state, trajectory: state.aim ? aimPath : [], cameraTarget: look });
  }
  function toolChanged(tool) { document.querySelector('#garden-guide').dataset.selectedTool = tool; }
  function key(event, tool) {
    if (!active || (event.key !== ' ' && !event.key.startsWith('Arrow'))) return false;
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    if (tool === 'pull') {
      if (event.key === ' ') {
        if (!event.repeat) { if (!model.state.aim) dispatch({ type: 'aim', ...keyboardAim }); dispatch({ type: 'release' }); }
      } else {
        if (event.key === 'ArrowLeft') keyboardAim.x = Math.min(2.2, keyboardAim.x + .16);
        if (event.key === 'ArrowRight') keyboardAim.x = Math.max(-2.2, keyboardAim.x - .16);
        if (event.key === 'ArrowUp') keyboardAim.y = Math.max(-2.2, keyboardAim.y - .16);
        if (event.key === 'ArrowDown') keyboardAim.y = Math.min(.3, keyboardAim.y + .16);
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
    get active() { return active; }, get state() { return model.state; },
    get screenPosition() { screen.copy(pivot.position).project(camera); return { x: screen.x, y: screen.y }; },
    dispatch, update, setMode, toolChanged, key,
  };
}
