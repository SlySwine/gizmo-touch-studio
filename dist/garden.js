import * as THREE from 'three';
import { GARDEN, createGardenModel } from './garden-model.js';
import { createGardenWorld } from './garden-world.js';

// One garden owns its journey, scenery, camera and HUD. The studio owns Gizmo.
export function createGarden({ scene, camera, pivot, ground, lights, coarse, onTransition, onEvent }) {
  const model = createGardenModel();
  const world = createGardenWorld({ scene, coarse });
  const page = document.querySelector('#studio');
  const canvas = document.querySelector('#canvas');
  const studioLabel = canvas.getAttribute('aria-label');
  const play = document.querySelector('#play');
  const count = document.querySelector('#garden-count');
  const progress = document.querySelector('#garden-progress');
  const help = document.querySelector('#garden-help');
  const sanctuary = document.querySelector('#garden-sanctuary');
  const victory = document.querySelector('#garden-victory');
  const rescue = document.querySelector('#garden-rescue');
  const heading = document.querySelector('#garden-heading');
  const charge = document.querySelector('#garden-charge');
  const lightOrigins = lights.map(light => ({ light, position: light.position.clone(), target: light.isSpotLight ? light.target.position.clone() : null }));
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const screen = new THREE.Vector3();
  let active = false, initializedCamera = false, lastStars = -1, previousTool = 'pull';
  let keyboardAim = { x: -.8, y: -.65 };
  let elapsed = 0, aimPath = [], victoryDismissed = false;
  const lightOffset = new THREE.Vector3();

  for (const star of GARDEN.stars) {
    const pip = document.createElement('span');
    pip.className = 'star-pip'; pip.dataset.star = star.id;
    pip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7z"/></svg>';
    progress.append(pip);
  }

  function deliver(events = []) {
    for (const event of events) {
      const position = model.state.position;
      world.burst({ x: position.x, y: position.y, type: event.type });
      onEvent(event);
      if (event.type === 'complete') victoryDismissed = false;
      if (event.type === 'star') count.classList.remove('collected');
      if (event.type === 'star') requestAnimationFrame(() => count.classList.add('collected'));
    }
    sync();
  }
  function dispatch(action) { deliver(model.dispatch(action)); aimPath = model.state.aim ? model.trajectory() : []; }
  function text(element, value) { if (element.textContent !== value) element.textContent = value; }
  function sync() {
    const state = model.state;
    text(count, `${state.stars.length} / ${state.totalStars}`);
    if (lastStars !== state.stars.length) {
      for (const pip of progress.children) pip.classList.toggle('found', state.stars.includes(Number(pip.dataset.star)));
      lastStars = state.stars.length;
    }
    const island = GARDEN.islands.find(item => item.id === state.checkpoint);
    text(sanctuary, island?.name || 'The First Dream');
    text(heading, state.completed ? 'You woke the sky.' : state.stars.length === state.totalStars ? 'Bring the lights home.' : 'Wake the sleeping sky.');
    victory.hidden = !active || !state.completed || victoryDismissed;
    const power = state.aim ? Math.min(1, Math.hypot(state.aim.x, state.aim.y) / 2.6) : 0;
    charge.hidden = !state.aim;
    charge.style.setProperty('--charge', `${power * 100}%`);
    text(charge.querySelector('span'), `${Math.round(power * 100)}%`);
  }
  function setMode(next, updateHash = true) {
    if (active === next) return;
    dispatch({ type: 'cancel' });
    onTransition(next ? 'garden' : 'studio');
    active = next;
    world.group.visible = active;
    page.classList.toggle('in-garden', active);
    document.title = active ? 'Gizmo · Starlight Garden' : 'Gizmo · Touch Studio';
    canvas.setAttribute('aria-label', active ? 'Gizmo in the Starlight Garden. Collect eight lights across floating islands. Pull back and release to launch. Poke, Slap, Brush, and Turn also work here. In Pull mode, arrows aim and Space launches; Escape cancels. R returns to your sanctuary. Studio pauses the journey and keeps your hairstyle.' : studioLabel);
    document.querySelector('#reset span').textContent = active ? 'Rescue' : 'Reset';
    document.querySelector('#garden-hud').hidden = !active;
    document.querySelector('#garden-guide').hidden = !active;
    play.querySelector('span').textContent = active ? 'Studio' : 'Play';
    play.setAttribute('aria-label', active ? 'Return to the grooming studio' : 'Play in the Starlight Garden');
    play.setAttribute('aria-pressed', String(active));
    document.querySelector('#reset').title = active ? 'Return to your sanctuary (R)' : 'Reset Gizmo (R)';
    document.querySelector('#reset').setAttribute('aria-label', active ? 'Return to your sanctuary' : 'Reset shape and fur');
    for (const mesh of ground) mesh.visible = !active;
    pivot.scale.setScalar(active ? .31 : 1);
    if (!active) {
      pivot.position.set(0, 1.8, 0);
      for (const item of lightOrigins) { item.light.position.copy(item.position); if (item.target) item.light.target.position.copy(item.target); }
      camera.fov = 34;
      camera.position.set(0, 2.3, Math.max(9.8, 9.2 / camera.aspect));
      camera.lookAt(0, 2.06, 0);
      camera.updateProjectionMatrix();
    } else {
      initializedCamera = false;
      camera.fov = 43;
      camera.updateProjectionMatrix();
      update(elapsed, 0);
    }
    if (updateHash) history.pushState(null, '', active ? '#garden' : '#studio');
    sync();
  }
  function update(time, dt) {
    elapsed = time;
    if (!active) return;
    if (!document.hidden) deliver(model.step(dt));
    const state = model.state;
    pivot.position.set(state.position.x, state.position.y, 0);
    const ahead = camera.aspect < .8 ? 1.95 : 2.4;
    desired.set(state.position.x + ahead, state.position.y + 1.45, 0);
    if (!initializedCamera) { look.copy(desired); initializedCamera = true; }
    else look.lerp(desired, 1 - Math.exp(-dt * 4.2));
    camera.position.set(look.x, look.y + 3.1, 16.8);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    lightOffset.set(state.position.x, state.position.y - 1.8, 0);
    for (const item of lightOrigins) {
      item.light.position.copy(item.position).add(lightOffset);
      if (item.target) item.light.target.position.copy(item.target).add(lightOffset);
    }
    world.update({ time, dt, state, trajectory: state.aim ? aimPath : [], cameraTarget: look });
  }
  function toolChanged(tool) {
    previousTool = tool;
    document.querySelector('#garden-guide').dataset.tool = tool;
    help.textContent = ({
      pull: 'Pull Gizmo back. Follow the arc. Release to fly.',
      poke: 'Poke either side to give him a little hop.',
      slap: 'Tap his left or right side. More power, more flight.',
      brush: 'A moment of calm. Your brushwork stays with him.',
      turn: 'Drag to admire every side. The garden can wait.',
    })[tool];
  }
  function key(event, tool, slapPower) {
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
  const focusCanvas = () => document.querySelector('#canvas').focus({ preventScroll: true });
  play.disabled = false;
  play.addEventListener('click', () => { setMode(!active); document.querySelector('#canvas').focus({ preventScroll: true }); });
  rescue.addEventListener('click', () => { dispatch({ type: 'rescue' }); focusCanvas(); });
  document.querySelector('#garden-continue').addEventListener('click', () => { victoryDismissed = true; sync(); focusCanvas(); });
  document.querySelector('#garden-again').addEventListener('click', () => { victoryDismissed = false; dispatch({ type: 'restart' }); initializedCamera = false; focusCanvas(); });
  document.querySelector('#garden-studio').addEventListener('click', () => { setMode(false); focusCanvas(); });
  window.addEventListener('popstate', () => setMode(location.hash === '#garden', false));
  sync(); toolChanged(previousTool);
  if (location.hash === '#garden') setMode(true, false);
  return {
    get active() { return active; },
    get state() { return model.state; },
    get screenPosition() { screen.copy(pivot.position).project(camera); return { x: screen.x, y: screen.y }; },
    dispatch, update, setMode, toolChanged, key,
  };
}
