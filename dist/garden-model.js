import { LEVELS } from './garden-missions.js';
export { LEVELS };
export const GARDEN = LEVELS[0];

const STEP = 1 / 120, EPS = 1e-9;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const point = p => ({ x: p.x, y: p.y });

function boundedVector(x, y, limit) {
  const largest = Math.max(Math.abs(x), Math.abs(y));
  if (!largest) return { x: 0, y: 0 };
  const nx = x / largest, ny = y / largest, length = Math.hypot(nx, ny);
  return largest > limit / length ? { x: nx / length * limit, y: ny / length * limit } : { x, y };
}
function movingPoint(item, time) {
  const p = point(item), m = item.motion;
  if (m) p[m.axis] += m.amplitude * Math.sin((time + (m.phase || 0)) * Math.PI * 2 / m.period);
  return p;
}
function islandsAt(layout, time) {
  return layout.islands.map(i => ({ id: i.id, name: i.name, radius: i.radius, ...movingPoint(i, time), moving: !!i.motion }));
}
function hazardsAt(layout, time) {
  return layout.hazards.map(h => {
    const p = h.pulse, phase = p ? ((time + (p.phase || 0)) % p.period + p.period) % p.period : 0;
    const active = !p || phase < p.on;
    return { id: h.id, type: h.type, radius: h.radius, ...movingPoint(h, time), active,
      warning: p && !active ? clamp(1 - (p.period - phase) / .8, 0, 1) : 0 };
  });
}
function initialState(layout) {
  const first = islandsAt(layout, 0)[0];
  return {
    position: { x: first.x, y: first.y + layout.halfHeight }, velocity: { x: 0, y: 0 },
    grounded: true, checkpoint: 0, completed: false, launches: 0, rescues: 0,
    aim: null, held: false, elapsed: 0, invulnerable: 0, recentSlap: null, gateHitUntil: 0,
    mission: { done: new Set(), touching: new Set(), lockHits: new Map(), lockLaunches: new Map(), gateOpen: false, remainingTime: null, status: 'ready',
      core: layout.mission.type === 'escort' ? { carried: true, dropped: false, x: first.x - .62, y: first.y + 1.2, island: 0, pickupAfter: 0 } : null },
  };
}
function cloneState(s) {
  return { ...s, position: point(s.position), velocity: point(s.velocity), aim: s.aim && point(s.aim),
    recentSlap: s.recentSlap && { ...s.recentSlap },
    mission: { ...s.mission, done: new Set(s.mission.done), touching: new Set(s.mission.touching),
      lockHits: new Map(s.mission.lockHits), lockLaunches: new Map(s.mission.lockLaunches), core: s.mission.core && { ...s.mission.core } } };
}
function pullVelocity(aim, layout) {
  return boundedVector(-aim.x * layout.launchGain, 3 - aim.y * layout.launchGain, layout.maxSpeed);
}
function overlaps(x, island, layout) { return Math.abs(x - island.x) <= island.radius + layout.xRadius + EPS; }

// Sweep against expanded ellipses rather than checking only a frame's endpoint.
function ellipseEntry(from, to, center, rx, ry) {
  const ox = (from.x - center.x) / rx, oy = (from.y - center.y) / ry;
  const dx = (to.x - from.x) / rx, dy = (to.y - from.y) / ry;
  const c = ox * ox + oy * oy - 1, a = dx * dx + dy * dy;
  if (c <= EPS) return 0;
  if (!a) return null;
  const b = ox * dx + oy * dy, d = b * b - a * c;
  if (d < 0) return null;
  const t = (-b - Math.sqrt(d)) / a;
  return t >= -EPS && t <= 1 + EPS ? clamp(t, 0, 1) : null;
}
function rectangleEntry(from, to, gate, layout) {
  const extents = { x: gate.width / 2 + layout.xRadius, y: gate.height / 2 + layout.halfHeight };
  let enter = 0, leave = 1, normal = { x: 0, y: 0 };
  for (const axis of ['x', 'y']) {
    const d = to[axis] - from[axis], low = gate[axis] - extents[axis], high = gate[axis] + extents[axis];
    if (Math.abs(d) < EPS) { if (from[axis] < low || from[axis] > high) return null; continue; }
    let a = (low - from[axis]) / d, b = (high - from[axis]) / d;
    if (a > b) [a, b] = [b, a];
    if (a >= enter) { enter = a; normal = { x: 0, y: 0, [axis]: d > 0 ? -1 : 1 }; }
    leave = Math.min(leave, b);
    if (enter > leave) return null;
  }
  return enter >= 0 && enter <= 1 && leave >= 0 ? { fraction: enter, normal } : null;
}
function updateCore(s, layout) {
  const core = s.mission.core;
  if (!core) return;
  if (core.carried) { core.x = s.position.x - .62; core.y = s.position.y + .65; }
  else { const island = islandsAt(layout, s.elapsed)[core.island]; core.x = island.x - .95; core.y = island.y + .85; }
}
function updateGate(s, layout, events) {
  const open = s.mission.done.size === layout.mission.targets.length && (!s.mission.core || s.mission.core.carried);
  if (open !== s.mission.gateOpen) { s.mission.gateOpen = open; events.push({ type: 'gate', open }); }
}
function rescue(s, events, layout, reason = 'manual') {
  if (reason === 'manual' && s.mission.core && !s.mission.core.carried) s.checkpoint = s.mission.core.island;
  const sanctuary = islandsAt(layout, s.elapsed)[s.checkpoint];
  if (reason !== 'manual' && s.mission.core?.carried && !s.completed) {
    Object.assign(s.mission.core, { carried: false, dropped: true, island: s.checkpoint, pickupAfter: s.elapsed + .35 });
    s.mission.status = 'recover-core';
    events.push({ type: 'core', action: 'drop', carried: false, island: s.checkpoint });
  }
  s.position = { x: sanctuary.x, y: sanctuary.y + layout.halfHeight };
  s.velocity = { x: 0, y: 0 }; s.grounded = true; s.aim = null; s.held = false; s.recentSlap = null;
  s.invulnerable = 1.5; s.mission.touching.clear(); s.rescues++;
  updateCore(s, layout); updateGate(s, layout, events);
  events.push({ type: 'rescue', island: sanctuary.id, reason });
}
function hardEnough(s, target) {
  return Math.hypot(s.velocity.x, s.velocity.y) + EPS >= (target.requiredSpeed ?? 6)
    || !!(s.recentSlap && s.recentSlap.power >= (target.requiredPower ?? .5) && s.elapsed - s.recentSlap.at <= 1.25 + EPS);
}
function targetEntry(target, from, to, layout) {
  return ellipseEntry(from, to, target, target.radius + layout.xRadius, target.radius + layout.halfHeight);
}
function touchTarget(s, target, layout, events) {
  const m = s.mission, type = layout.mission.type;
  if (m.done.has(target.id)) return;
  let rejected = null;
  if ((type === 'sequence' || type === 'escort') && target.order !== m.done.size + 1) {
    rejected = 'wrong-order';
  }
  if (type === 'escort' && !m.core.carried) rejected = 'recover-core';
  if (rejected) {
    m.status = rejected;
    events.push({ type: 'target', id: target.id, status: rejected, progress: m.done.size, total: layout.mission.targets.length });
    updateGate(s, layout, events); return;
  }
  if (type === 'rescue') {
    // Two intentional gentle hits or one hard hit. Resting contact cannot auto-win,
    // and a first chip never creates an invisible wall or throws Gizmo off a ledge.
    if (!s.launches || m.lockLaunches.get(target.id) === s.launches) return;
    m.lockLaunches.set(target.id, s.launches);
    const durability = target.durability ?? 2;
    const hits = Math.min(durability, (m.lockHits.get(target.id) || 0) + (hardEnough(s, target) ? durability : 1));
    m.lockHits.set(target.id, hits);
    if (hits < durability) {
      m.status = 'cracked';
      events.push({ type: 'target', id: target.id, status: 'cracked', hits, durability, progress: m.done.size, total: layout.mission.targets.length });
      return;
    }
  }
  if (type === 'timed') m.remainingTime = layout.mission.timeLimit;
  m.done.add(target.id); m.status = m.done.size === layout.mission.targets.length ? 'reach-exit' : 'active';
  events.push({ type: 'target', id: target.id, status: 'activated', progress: m.done.size, total: layout.mission.targets.length });
  updateGate(s, layout, events);
}
function interactions(s, from, to, events, layout) {
  const contacts = [];
  for (const target of layout.mission.targets) {
    if (s.mission.done.has(target.id) || s.mission.touching.has(target.id)) continue;
    const fraction = targetEntry(target, from, to, layout);
    if (fraction !== null) contacts.push({ fraction, target });
  }
  const core = s.mission.core;
  if (core && !core.carried && s.elapsed >= core.pickupAfter) {
    const fraction = ellipseEntry(from, to, core, .32 + layout.xRadius, .32 + layout.halfHeight);
    if (fraction !== null) contacts.push({ fraction, core: true });
  }
  contacts.sort((a, b) => a.fraction - b.fraction);
  for (const c of contacts) {
    if (c.core) { core.carried = true; core.dropped = false; s.mission.status = 'carry-core'; events.push({ type: 'core', action: 'pickup', carried: true }); updateGate(s, layout, events); }
    else touchTarget(s, c.target, layout, events);
  }
  s.mission.touching = new Set(layout.mission.targets.filter(t =>
    ellipseEntry(to, to, t, t.radius + layout.xRadius, t.radius + layout.halfHeight) !== null).map(t => t.id));
}
function firstContact(s, from, to, layout, beforeTime) {
  let contact = null;
  const offer = c => { if (c && (!contact || c.fraction < contact.fraction - EPS)) contact = c; };
  const previousPlatforms = islandsAt(layout, beforeTime), platforms = islandsAt(layout, s.elapsed);
  if (!s.grounded) for (const island of platforms) {
    const previous = previousPlatforms[island.id];
    const before = from.y - previous.y - layout.halfHeight, after = to.y - island.y - layout.halfHeight;
    if (before < -EPS || after > EPS || after >= before) continue;
    const fraction = clamp(before / (before - after), 0, 1), x = from.x + (to.x - from.x) * fraction;
    const supportX = previous.x + (island.x - previous.x) * fraction;
    if (overlaps(x, { ...island, x: supportX }, layout)) offer({ type: 'land', fraction, island });
  }
  if (layout.mission.gate && !s.mission.gateOpen) {
    const entry = rectangleEntry(from, to, layout.mission.gate, layout);
    if (entry) offer({ type: 'gate', ...entry });
  }
  if (s.invulnerable <= 0) {
    const previousHazards = hazardsAt(layout, beforeTime);
    for (const hazard of hazardsAt(layout, s.elapsed)) {
      const previous = previousHazards.find(h => h.id === hazard.id);
      if (!hazard.active && !previous.active) continue;
      const a = { x: from.x - previous.x, y: from.y - previous.y }, b = { x: to.x - hazard.x, y: to.y - hazard.y };
      const fraction = ellipseEntry(a, b, { x: 0, y: 0 }, hazard.radius + layout.xRadius, hazard.radius + layout.halfHeight);
      if (fraction !== null) offer({ type: 'hazard', fraction, hazard });
    }
  }
  return contact;
}
function completeIfAtExit(s, from, to, layout, events) {
  if (s.completed || !s.mission.gateOpen) return;
  const exit = layout.mission.exit;
  if (ellipseEntry(from, to, exit, exit.radius + layout.xRadius, exit.radius + layout.halfHeight) === null) return;
  s.completed = true; s.mission.status = 'complete'; events.push({ type: 'complete' });
}
function integrate(s, events, layout) {
  const beforeTime = s.elapsed;
  s.elapsed += STEP; s.invulnerable = Math.max(0, s.invulnerable - STEP);
  const m = s.mission;
  if (m.remainingTime !== null && m.done.size < layout.mission.targets.length) {
    m.remainingTime = Math.max(0, m.remainingTime - STEP);
    if (m.remainingTime <= EPS) {
      m.remainingTime = null; m.status = 'timeout';
      const last = layout.mission.targets.find(t => t.id === [...m.done].at(-1));
      if (last) s.checkpoint = islandsAt(layout, s.elapsed).reduce((best, island) =>
        Math.hypot(island.x - last.x, island.y - last.y) < Math.hypot(best.x - last.x, best.y - last.y) ? island : best).id;
      events.push({ type: 'timeout', progress: m.done.size });
      const outcome = { type: 'fall', ...point(s.position), time: s.elapsed, reason: 'timeout' };
      rescue(s, events, layout, 'timeout');
      return outcome;
    }
  }
  updateCore(s, layout);
  const from = point(s.position), to = point(from);
  const heldVelocity = s.held ? point(s.velocity) : null;
  if (s.grounded) {
    const previous = islandsAt(layout, beforeTime)[s.checkpoint], support = islandsAt(layout, s.elapsed)[s.checkpoint];
    s.velocity.x = s.held ? 0 : s.velocity.x * Math.exp(-layout.groundFriction * STEP);
    if (Math.abs(s.velocity.x) < .015) s.velocity.x = 0;
    s.velocity.y = 0;
    to.x += support.x - previous.x + s.velocity.x * STEP; to.y = support.y + layout.halfHeight;
  } else if (!s.held) {
    s.velocity.x *= Math.exp(-layout.airDrag * STEP); s.velocity.y -= layout.gravity * STEP;
    for (const c of layout.currents) if (Math.abs(from.x - c.x) <= c.width / 2 && Math.abs(from.y - c.y) <= c.height / 2) {
      s.velocity.x += c.ax * STEP; s.velocity.y += c.ay * STEP;
    }
    s.velocity = boundedVector(s.velocity.x, s.velocity.y, layout.maxSpeed);
    to.x += s.velocity.x * STEP; to.y += s.velocity.y * STEP;
  }
  // Grabbing anchors only Gizmo. World time and relative hazard sweeps still run;
  // a supported grab follows its platform, and a rising platform can catch it.
  if (s.held) s.velocity = { x: (to.x - from.x) / STEP, y: (to.y - from.y) / STEP };
  const contact = firstContact(s, from, to, layout, beforeTime);
  const traveled = contact ? { x: from.x + (to.x - from.x) * contact.fraction, y: from.y + (to.y - from.y) * contact.fraction } : to;
  s.position = traveled; interactions(s, from, traveled, events, layout);
  if (contact?.type === 'hazard') {
    events.push({ type: 'hazard', id: contact.hazard.id, x: traveled.x, y: traveled.y });
    const outcome = { type: 'hazard', ...point(traveled), time: s.elapsed, hazardId: contact.hazard.id };
    rescue(s, events, layout, 'hazard'); return outcome;
  }
  if (contact?.type === 'land') {
    const impact = Math.max(0, -s.velocity.y);
    s.checkpoint = contact.island.id; s.position.y = contact.island.y + layout.halfHeight;
    // A visible edge catch should become a usable foothold. Resolve overlap onto
    // the support, then retain only as much drift as can stop within its margin.
    const safeRadius = Math.max(0, contact.island.radius - layout.xRadius - .08);
    const left = contact.island.x - safeRadius, right = contact.island.x + safeRadius;
    s.position.x = clamp(s.position.x, left, right);
    const retained = s.velocity.x * layout.landingRetention;
    const room = retained < 0 ? s.position.x - left : right - s.position.x;
    s.velocity.x = Math.sign(retained) * Math.min(Math.abs(retained), room * layout.groundFriction * .8);
    // The land impact drives the rendered squash. Keeping support attached avoids
    // a cosmetic bounce letting a moving platform escape from under an edge catch.
    s.velocity.y = 0; s.grounded = true;
    events.push({ type: 'land', island: s.checkpoint, impact });
  } else if (contact?.type === 'gate') {
    const normal = contact.normal;
    const dot = s.velocity.x * normal.x + s.velocity.y * normal.y;
    s.velocity.x -= 1.45 * dot * normal.x; s.velocity.y -= 1.45 * dot * normal.y;
    s.position.x += normal.x * .015; s.position.y += normal.y * .015; s.grounded = false;
    if (s.elapsed > s.gateHitUntil) { events.push({ type: 'gate', open: false, blocked: true }); s.gateHitUntil = s.elapsed + .3; }
  } else if (s.grounded && !overlaps(s.position.x, islandsAt(layout, s.elapsed)[s.checkpoint], layout)) s.grounded = false;
  if (heldVelocity && !contact) s.velocity = heldVelocity;
  if (s.position.y < -7) {
    const outcome = { type: 'fall', ...point(s.position), time: s.elapsed };
    rescue(s, events, layout, 'fall'); return outcome;
  }
  updateCore(s, layout); completeIfAtExit(s, from, s.position, layout, events);
  if (contact?.type === 'land') return { type: 'landing', ...point(s.position), platformId: contact.island.id, time: s.elapsed };
  if (contact?.type === 'gate') return { type: 'gate', ...point(s.position), time: s.elapsed };
  return null;
}
function levelIndexOf(level) {
  if (Number.isInteger(level) && level >= 0 && level < LEVELS.length) return level;
  return typeof level === 'string' ? LEVELS.findIndex(l => l.id === level) : -1;
}
function missionSnapshot(s, layout) {
  const m = s.mission, config = layout.mission;
  return { type: config.type, title: config.title, progress: m.done.size, total: config.targets.length,
    targets: config.targets.map(t => ({ ...t, completed: m.done.has(t.id), next: !m.done.has(t.id) && (!t.order || t.order === m.done.size + 1),
      ...(config.type === 'rescue' ? { hits: m.lockHits.get(t.id) || 0, durability: t.durability ?? 2,
        cracked: !!m.lockHits.get(t.id) && !m.done.has(t.id) } : {}) })),
    gateOpen: m.gateOpen, remainingTime: m.remainingTime, status: m.status,
    core: m.core ? { carried: m.core.carried, dropped: m.core.dropped, x: m.core.x, y: m.core.y, island: m.core.island } : null };
}

function launchState(s, velocity, kind, events, layout) {
  s.velocity = boundedVector(velocity.x, velocity.y, layout.maxSpeed);
  s.grounded = false; s.held = false; s.aim = null; s.launches++;
  s.mission.touching.clear();
  if (layout.mission.type === 'timed' && s.mission.done.size && !s.mission.gateOpen && s.mission.remainingTime === null) {
    s.mission.remainingTime = layout.mission.timeLimit; s.mission.status = 'active';
  }
  events.push({ type: 'launch', kind, velocity: point(s.velocity) });
}

/** Pure 120 Hz simulation. Holds anchor Gizmo while the active world keeps moving.
 * All levels are selectable. Switching cancels gestures; restart resets only the selected world.
 * predict runs the same integrator on a deep copy, including gates, currents, and moving supports.
 */
export function createGardenModel(level = 0) {
  let levelIndex = Math.max(0, levelIndexOf(level)), layout = LEVELS[levelIndex], s = initialState(layout), accumulator = 0;
  const saved = new Map([[levelIndex, s]]), remainders = new Map(), unlocked = new Set([0]);
  function launch(velocity, kind, events) {
    launchState(s, velocity, kind, events, layout);
  }
  function predict() {
    // Contact time is an absolute realm timestamp. Contact y is Gizmo's center,
    // so renderers can place a landing marker without guessing a platform phase.
    if (!s.aim) return { points: [], outcome: { type: 'flight', ...point(s.position), time: s.elapsed }, targets: [] };
    const preview = cloneState(s), points = [point(s.position)], targets = [];
    launchState(preview, pullVelocity(preview.aim, layout), 'pull', [], layout);
    let outcome = null;
    for (let tick = 1; tick <= 720; tick++) {
      const events = []; outcome = integrate(preview, events, layout);
      targets.push(...events.filter(e => e.type === 'target').map(e => ({ ...e })));
      if (outcome) { points.push({ x: outcome.x, y: outcome.y }); break; }
      if (tick % 4 === 0) points.push(point(preview.position));
    }
    return { points, targets, outcome: outcome || { type: 'flight', ...point(preview.position), time: preview.elapsed } };
  }
  return Object.freeze({
    get layout() { return layout; },
    get state() {
      return { position: point(s.position), velocity: point(s.velocity), grounded: s.grounded, checkpoint: s.checkpoint,
        completed: s.completed, launches: s.launches, rescues: s.rescues, aim: s.aim && point(s.aim), held: s.held,
        elapsed: s.elapsed, invulnerable: s.invulnerable, stars: [], totalStars: 0,
        levelIndex, levelId: layout.id, levelName: layout.name,
        unlockedLevels: [...unlocked].sort((a, b) => a - b),
        completedLevels: [...saved].filter(([, state]) => state.completed).map(([i]) => i).sort((a, b) => a - b),
        mission: missionSnapshot(s, layout), islands: islandsAt(layout, s.elapsed), hazards: hazardsAt(layout, s.elapsed),
        exit: { ...layout.mission.exit, open: s.mission.gateOpen } };
    },
    dispatch(action) {
      const events = [];
      if (!action || typeof action !== 'object') return events;
      switch (action.type) {
        case 'level': {
          const index = levelIndexOf(action.level); if (index < 0) break;
          remainders.set(levelIndex, accumulator);
          s.held = false; s.aim = null; s.recentSlap = null; levelIndex = index; layout = LEVELS[index];
          if (!saved.has(index)) saved.set(index, initialState(layout));
          s = saved.get(index); accumulator = remainders.get(index) || 0;
          events.push({ type: 'level', level: index, levelId: layout.id }); break;
        }
        case 'hold': if (typeof action.held === 'boolean') { s.held = action.held; if (!s.held) s.aim = null; } break;
        case 'aim': if (Number.isFinite(action.x) && Number.isFinite(action.y)) {
          s.aim = boundedVector(action.x, action.y, layout.maxDrag); s.held = true;
        } break;
        case 'release': if (s.aim) launch(pullVelocity(s.aim, layout), 'pull', events); else s.held = false; break;
        case 'cancel': s.aim = null; s.held = false; break;
        case 'poke': launch({ x: (Number.isFinite(action.direction) && action.direction < 0 ? -1 : 1) * 1.7, y: 3.6 }, 'poke', events); break;
        case 'slap': {
          const power = Number.isFinite(action.power) ? clamp(action.power, 0, 1) : 0;
          s.recentSlap = { power, at: s.elapsed };
          launch({ x: (Number.isFinite(action.direction) && action.direction < 0 ? -1 : 1) * (2.8 + power * 9.7), y: 4.6 + power * 4.4 }, 'slap', events); break;
        }
        case 'rescue': rescue(s, events, layout); break;
        case 'restart': s = initialState(layout); saved.set(levelIndex, s); accumulator = 0; break;
      }
      return events;
    },
    step(dt) {
      const events = [];
      if (!Number.isFinite(dt) || dt <= 0) return events;
      accumulator += Math.min(dt, 1);
      while (accumulator + EPS >= STEP) {
        integrate(s, events, layout);
        if (s.completed) { unlocked.add(levelIndex); if (levelIndex + 1 < LEVELS.length) unlocked.add(levelIndex + 1); }
        accumulator = Math.max(0, accumulator - STEP);
      }
      return events;
    },
    predict,
    trajectory() { return predict().points; },
  });
}
