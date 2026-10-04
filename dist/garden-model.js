// Garden coordinates use island.y as the landing surface and position as Gizmo's center.
// This module owns simulation, contacts, progression, and the matching aim preview.
const islandNames = [
  'Mosslight Nook', 'Moonbell Rise', 'Velvet Cloud', 'Firefly Hollow',
  'Wishing Bloom', 'Dewdrop Rest', 'Aurora Perch', 'Dreamweaver Isle', 'Starwake Crown',
];
const heights = [.8, 1.8, 3, 1.5, 4.4, 2.4, 5.6, 4, 6.8];
const islands = Object.freeze(heights.map((y, id) => Object.freeze({
  id, x: id * 5, y, radius: 1.8, name: islandNames[id],
})));
const stars = Object.freeze(islands.slice(1).map(island => Object.freeze({
  id: island.id, x: island.x, y: island.y + .85,
})));

export const GARDEN = Object.freeze({
  islands, stars, starlight: stars,
  constellation: Object.freeze({ x: 40, y: heights[8] + 2.4 }),
  halfHeight: .55, xRadius: .42,
  gravity: 8, maxSpeed: 18, maxDrag: 2.6, launchGain: 5.2,
  fixedStep: 1 / 120,
});

const STEP = GARDEN.fixedStep;
const AIR_DRAG = .045;
const GROUND_FRICTION = 7.5;
const STAR_RADIUS = .19;
const MAX_FRAME_TIME = 1;
const EPSILON = 1e-9;

function initialState() {
  return {
    position: { x: 0, y: islands[0].y + GARDEN.halfHeight },
    velocity: { x: 0, y: 0 }, grounded: true, checkpoint: 0,
    stars: new Set(), completed: false, launches: 0, rescues: 0,
    aim: null, held: false, elapsed: 0,
  };
}

function boundedVector(x, y, limit) {
  // Normalize before multiplying so even very large finite inputs stay finite.
  const largest = Math.max(Math.abs(x), Math.abs(y));
  if (largest === 0) return { x: 0, y: 0 };
  const nx = x / largest, ny = y / largest, unitLength = Math.hypot(nx, ny);
  if (largest > limit / unitLength) return { x: nx / unitLength * limit, y: ny / unitLength * limit };
  return { x, y };
}

function pullVelocity(aim) {
  return boundedVector(-aim.x * GARDEN.launchGain, 3 - aim.y * GARDEN.launchGain, GARDEN.maxSpeed);
}

function overlapsIsland(x, island) {
  return Math.abs(x - island.x) <= island.radius + GARDEN.xRadius + EPSILON;
}

function rescue(state, events) {
  const sanctuary = islands[state.checkpoint];
  state.position = { x: sanctuary.x, y: sanctuary.y + GARDEN.halfHeight };
  state.velocity = { x: 0, y: 0 };
  state.held = false;
  state.aim = null;
  state.grounded = true;
  state.rescues++;
  events.push({ type: 'rescue', island: sanctuary.id });
}

function collectStars(state, from, to, events) {
  // Sweep an expanded ellipse along the actual traveled segment, including fast passes.
  const rx = GARDEN.xRadius + STAR_RADIUS, ry = GARDEN.halfHeight + STAR_RADIUS;
  const dx = (to.x - from.x) / rx, dy = (to.y - from.y) / ry;
  const lengthSquared = dx * dx + dy * dy;
  const contacts = [];
  for (const star of stars) {
    if (state.stars.has(star.id)) continue;
    const ox = (from.x - star.x) / rx, oy = (from.y - star.y) / ry;
    const c = ox * ox + oy * oy - 1;
    let entry = c <= 0 ? 0 : Infinity;
    if (c > 0 && lengthSquared > 0) {
      const b = ox * dx + oy * dy;
      const discriminant = b * b - lengthSquared * c;
      if (discriminant >= 0) entry = (-b - Math.sqrt(discriminant)) / lengthSquared;
    }
    if (entry >= -EPSILON && entry <= 1 + EPSILON) contacts.push({ star, entry });
  }
  contacts.sort((a, b) => a.entry - b.entry);
  for (const { star } of contacts) {
    state.stars.add(star.id);
    events.push({ type: 'star', id: star.id, count: state.stars.size });
  }
}

function firstLanding(from, to) {
  if (to.y >= from.y) return null;
  let first = null;
  for (const island of islands) {
    const centerY = island.y + GARDEN.halfHeight;
    if (from.y < centerY - EPSILON || to.y > centerY + EPSILON) continue;
    const fraction = Math.max(0, Math.min(1, (from.y - centerY) / (from.y - to.y)));
    const x = from.x + (to.x - from.x) * fraction;
    if (overlapsIsland(x, island) && (!first || fraction < first.fraction)) {
      first = { island, fraction, x, y: centerY };
    }
  }
  return first;
}

function completeOnIsland(state, island, events) {
  if (!state.completed && state.stars.size === stars.length && island.id === islands.length - 1) {
    state.completed = true;
    events.push({ type: 'complete' });
  }
}

function integrate(state, events) {
  const from = { ...state.position };
  if (state.grounded) {
    const support = islands[state.checkpoint];
    state.velocity.x *= Math.exp(-GROUND_FRICTION * STEP);
    if (Math.abs(state.velocity.x) < .015) state.velocity.x = 0;
    state.position.x += state.velocity.x * STEP;
    state.position.y = support.y + GARDEN.halfHeight;
    state.velocity.y = 0;
    collectStars(state, from, state.position, events);
    if (!overlapsIsland(state.position.x, support)) state.grounded = false;
    if (state.grounded) completeOnIsland(state, support, events);
    return;
  }

  state.velocity.x *= Math.exp(-AIR_DRAG * STEP);
  state.velocity.y -= GARDEN.gravity * STEP;
  state.velocity = boundedVector(state.velocity.x, state.velocity.y, GARDEN.maxSpeed);
  const to = {
    x: from.x + state.velocity.x * STEP,
    y: from.y + state.velocity.y * STEP,
  };
  const landing = firstLanding(from, to);
  if (landing) {
    state.position = { x: landing.x, y: landing.y };
    // Score only the path before contact; star events precede a simultaneous completion.
    collectStars(state, from, state.position, events);
    const impact = Math.max(0, -state.velocity.y);
    state.checkpoint = landing.island.id;
    state.velocity.x *= .74;
    state.velocity.y = impact > 7 ? Math.min(1.05, impact * .11) : 0;
    state.grounded = state.velocity.y === 0;
    events.push({ type: 'land', island: landing.island.id, impact });
    completeOnIsland(state, landing.island, events);
  } else {
    state.position = to;
    collectStars(state, from, to, events);
  }
  if (state.position.y < -7) rescue(state, events);
}

/**
 * A side-effect-free model: dispatch/step return transient events; state is a detached snapshot.
 * step takes seconds, accumulates fixed 120 Hz steps, and caps a single catch-up call at 1 second.
 * Holding freezes position and velocity. Cancel resumes without launching. Rescue preserves progress.
 */
export function createGardenModel() {
  let state = initialState(), accumulator = 0;

  function launch(velocity, kind, events) {
    state.velocity = boundedVector(velocity.x, velocity.y, GARDEN.maxSpeed);
    state.grounded = false;
    state.held = false;
    state.aim = null;
    state.launches++;
    accumulator = 0;
    events.push({ type: 'launch', kind, velocity: { ...state.velocity } });
  }

  return Object.freeze({
    get state() {
      return {
        ...state, position: { ...state.position }, velocity: { ...state.velocity },
        aim: state.aim ? { ...state.aim } : null,
        stars: [...state.stars].sort((a, b) => a - b), totalStars: stars.length,
      };
    },

    dispatch(action) {
      const events = [];
      if (!action || typeof action !== 'object') return events;
      switch (action.type) {
        case 'hold':
          if (typeof action.held === 'boolean') {
            state.held = action.held;
            accumulator = 0;
          }
          break;
        case 'aim':
          if (Number.isFinite(action.x) && Number.isFinite(action.y)) {
            state.aim = boundedVector(action.x, action.y, GARDEN.maxDrag);
            state.held = true;
            accumulator = 0;
          }
          break;
        case 'release':
          if (state.aim) launch(pullVelocity(state.aim), 'pull', events);
          else state.held = false;
          break;
        case 'cancel':
          state.aim = null;
          state.held = false;
          accumulator = 0;
          break;
        case 'poke': {
          const direction = Number.isFinite(action.direction) && action.direction < 0 ? -1 : 1;
          launch({ x: direction * 1.7, y: 3.6 }, 'poke', events);
          break;
        }
        case 'slap': {
          const power = Number.isFinite(action.power) ? Math.max(0, Math.min(1, action.power)) : 0;
          const direction = Number.isFinite(action.direction) && action.direction < 0 ? -1 : 1;
          launch({ x: direction * (2.8 + power * 9.7), y: 4.6 + power * 4.4 }, 'slap', events);
          break;
        }
        case 'rescue':
          rescue(state, events);
          accumulator = 0;
          break;
        case 'restart':
          state = initialState();
          accumulator = 0;
          break;
      }
      return events;
    },

    step(dt) {
      const events = [];
      if (!Number.isFinite(dt) || dt <= 0 || state.held) return events;
      accumulator += Math.min(dt, MAX_FRAME_TIME);
      while (accumulator + EPSILON >= STEP) {
        integrate(state, events);
        state.elapsed += STEP;
        accumulator = Math.max(0, accumulator - STEP);
      }
      return events;
    },

    trajectory() {
      if (!state.aim) return [];
      const preview = {
        ...state, position: { ...state.position }, velocity: pullVelocity(state.aim),
        stars: new Set(state.stars), grounded: false, held: false, aim: null,
      };
      const points = [{ ...preview.position }];
      for (let tick = 1; tick <= 720; tick++) {
        const events = [];
        integrate(preview, events);
        // A rescue is a teleport, so do not draw a false flight segment back to the sanctuary.
        if (events.some(event => event.type === 'rescue')) break;
        const ended = events.some(event => event.type === 'land');
        if (tick % 4 === 0 || ended) points.push({ ...preview.position });
        if (ended) break;
      }
      return points;
    },
  });
}
