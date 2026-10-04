// Mission geometry is shared by simulation, HUD, and scenery. y is a platform's top.
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function level({ id, name, subtitle, x, y, radii, motions = {}, mission, hazards, currents = [], environment, ...physics }) {
  const islands = x.map((position, index) => ({
    id: index, x: position, y: y[index], radius: radii[index], name: `${name} · ${index + 1}`,
    ...(motions[index] ? { motion: motions[index] } : {}),
  }));
  const last = islands.at(-1);
  return freeze({
    id, name, subtitle, islands, stars: [], starlight: [], environment,
    constellation: { x: last.x, y: last.y + 2.4 },
    halfHeight: .55, xRadius: .42, maxSpeed: 18, maxDrag: 2.6, launchGain: 5.2,
    fixedStep: 1 / 120, gravity: 8, airDrag: .045, groundFriction: 7.5,
    landingRetention: .74, bounceThreshold: 7, bounceRestitution: .11, maxBounce: 1.05,
    ...physics, hazards, currents,
    mission: { ...mission, gate: mission.gate || null, exit: { x: last.x, y: last.y + .7, radius: 1.1 } },
  });
}

export const LEVELS = freeze([
  level({
    id: 'starlight-garden', name: 'Starlight Garden', subtitle: 'Resonate through the sleeping engine’s three hoops.',
    x: [0, 4.5, 9, 13.5, 19, 24, 29, 35], y: [1, 2.2, 1.4, 4, 2, 4.8, 3, 5.5],
    radii: [2, 1.6, 2, 1.65, 2.1, 1.6, 2, 2.4],
    motions: { 3: { axis: 'x', amplitude: 1.25, period: 7, phase: 0 } },
    mission: { type: 'resonance', title: 'Wake the resonance engine', targets: [
      { id: 'resonance-1', x: 5.8, y: 4.7, radius: .95, kind: 'hoop', requiredSpeed: 5.8 },
      { id: 'resonance-2', x: 16, y: 6.4, radius: 1, kind: 'hoop', requiredSpeed: 6.4 },
      { id: 'resonance-3', x: 27.5, y: 6.9, radius: 1.05, kind: 'hoop', requiredSpeed: 7.2 },
    ] },
    hazards: [
      { id: 'garden-orb', type: 'orb', x: 11.5, y: 3.1, radius: .48, motion: { axis: 'y', amplitude: .85, period: 6, phase: 0 } },
      { id: 'garden-pulse', type: 'orb', x: 22, y: 5.5, radius: .45, pulse: { period: 5, on: 1.5, phase: 2 } },
    ],
    environment: { biome: 'garden', surface: 'light-petals', sky: 0x061c32, fog: 0x173b55, stone: 0x5a9fc5, accent: 0x78ffe0, description: 'Living light petals and resonant rings around a dreaming engine.' },
  }),
  level({
    id: 'moonlit-tidelands', name: 'Luminous Tides', subtitle: 'Shatter the three guardian locks and free the giant jellyfish.',
    x: [0, 5, 10.8, 16.6, 23, 28.4, 35, 41], y: [1.2, 2.4, 1.6, 3.8, 2.1, 4.4, 3.2, 5.3],
    radii: [2, 2, 1.7, 2, 1.85, 2, 1.7, 2.6],
    motions: { 4: { axis: 'y', amplitude: .7, period: 6.5, phase: 0 } },
    gravity: 7.1, groundFriction: 6.5,
    mission: { type: 'rescue', title: 'Free the giant jellyfish', targets: [
      { id: 'guardian-1', x: 5, y: 3.3, radius: .5, kind: 'lock', requiredSpeed: 8.5, requiredPower: .6 },
      { id: 'guardian-2', x: 16.6, y: 4.7, radius: .5, kind: 'lock', requiredSpeed: 8.5, requiredPower: .6 },
      { id: 'guardian-3', x: 28.4, y: 5.3, radius: .5, kind: 'lock', requiredSpeed: 8.5, requiredPower: .6 },
    ] },
    hazards: [
      { id: 'tide-sentinel', type: 'sentinel', x: 13.4, y: 4.7, radius: .6, motion: { axis: 'y', amplitude: 1.5, period: 7, phase: 0 } },
      { id: 'tide-spark', type: 'orb', x: 31.8, y: 4.9, radius: .55, pulse: { period: 5.5, on: 1.8, phase: 1 } },
    ],
    currents: [{ id: 'tide-stream', x: 12, y: 4.5, width: 8, height: 6, ax: .85, ay: .25 }],
    environment: { biome: 'coast', surface: 'jelly-bells', sky: 0x061c36, fog: 0x0f4665, stone: 0x5fbad4, accent: 0x9afff8, description: 'Floating jellyfish bells and luminous tides around a guardian cage.' },
  }),
  level({
    id: 'frostglass-reach', name: 'Prism Vault', subtitle: 'Align the numbered mirrors, then cross the sealed beam gate.',
    x: [0, 4.6, 9.3, 14.1, 19.2, 24.7, 30, 36.3], y: [1, 2.5, 3.8, 2.1, 4.6, 2.9, 5, 5.8],
    radii: [2, 1.8, 2, 1.7, 1.85, 1.7, 2, 2.4],
    motions: { 3: { axis: 'x', amplitude: 1.3, period: 8, phase: 0 } },
    gravity: 8.1, groundFriction: 5.2,
    mission: { type: 'sequence', title: 'Align mirrors 1 → 2 → 3', targets: [
      { id: 'mirror-1', x: 9.3, y: 4.7, radius: .55, kind: 'mirror', order: 1 },
      { id: 'mirror-2', x: 4.6, y: 3.4, radius: .55, kind: 'mirror', order: 2 },
      { id: 'mirror-3', x: 19.2, y: 5.5, radius: .55, kind: 'mirror', order: 3 },
    ], gate: { x: 27, y: 5.4, width: .65, height: 12 } },
    hazards: [
      { id: 'prism-sweep', type: 'sentinel', x: 12.2, y: 4.8, radius: .48, motion: { axis: 'y', amplitude: 1.5, period: 6.5, phase: 1 } },
      { id: 'prism-pulse', type: 'orb', x: 22.1, y: 4.8, radius: .5, pulse: { period: 6, on: 1.6, phase: 2.5 } },
    ],
    environment: { biome: 'glacier', surface: 'prism-panels', sky: 0x121a45, fog: 0x363c71, stone: 0x93b9ff, accent: 0xe6acff, description: 'Glass prisms, numbered mirror relays, and a living beam seal.' },
  }),
  level({
    id: 'emberfall-caldera', name: 'Stormbloom', subtitle: 'Link the storm stabilizers before their charge fades.',
    x: [0, 5.5, 11.4, 17.7, 24.5, 31.1, 38, 45], y: [1, 2.4, 1.6, 3.7, 2.2, 4.8, 3.1, 5.7],
    radii: [2, 2, 1.8, 2, 1.8, 2, 1.8, 2.4],
    motions: { 4: { axis: 'y', amplitude: 1, period: 7.5, phase: 0 } },
    gravity: 7.8,
    mission: { type: 'timed', title: 'Link three storm stabilizers', timeLimit: 30, targets: [
      { id: 'stabilizer-1', x: 5.5, y: 3.35, radius: .6, kind: 'stabilizer' },
      { id: 'stabilizer-2', x: 17.7, y: 4.65, radius: .6, kind: 'stabilizer' },
      { id: 'stabilizer-3', x: 31.1, y: 5.75, radius: .6, kind: 'stabilizer' },
    ] },
    hazards: [
      { id: 'storm-pulse-1', type: 'orb', x: 8.5, y: 4.7, radius: .6, pulse: { period: 5, on: 1.4, phase: 1.8 } },
      { id: 'storm-pulse-2', type: 'orb', x: 21.5, y: 5.7, radius: .65, pulse: { period: 6, on: 1.8, phase: 3 } },
      { id: 'storm-pulse-3', type: 'orb', x: 34.5, y: 5.8, radius: .6, pulse: { period: 5.5, on: 1.4, phase: .6 } },
    ],
    currents: [{ id: 'storm-current', x: 22, y: 5, width: 10, height: 9, ax: -1.1, ay: .5 }],
    environment: { biome: 'volcano', surface: 'storm-petals', sky: 0x161334, fog: 0x403455, stone: 0xa483e3, accent: 0xffc082, description: 'Storm flowers, glowing charge paths, and visibly pulsing thunder orbs.' },
  }),
  level({
    id: 'cloud-cathedral', name: 'Astral Clockwork', subtitle: 'Carry the dreamcore through two relays to the celestial cradle.',
    x: [0, 4.8, 10.5, 16.8, 23.4, 30.6, 37.3, 44.7, 52], y: [1, 2.2, 1.8, 3.9, 2.6, 4.8, 3.3, 5.6, 6.4],
    radii: [2.2, 1.8, 2, 2, 1.9, 1.9, 2.1, 1.8, 2.5],
    motions: { 4: { axis: 'x', amplitude: 1.4, period: 7, phase: 0 }, 7: { axis: 'y', amplitude: .8, period: 6, phase: 0 } },
    gravity: 6.8, airDrag: .06,
    mission: { type: 'escort', title: 'Bring the dreamcore home', targets: [
      { id: 'core-relay-1', x: 16.8, y: 4.85, radius: .65, kind: 'relay', order: 1 },
      { id: 'core-relay-2', x: 37.3, y: 4.25, radius: .65, kind: 'relay', order: 2 },
    ] },
    hazards: [
      { id: 'clock-sentinel-1', type: 'sentinel', x: 7.6, y: 4.1, radius: .55, motion: { axis: 'y', amplitude: 1.4, period: 6, phase: 0 } },
      { id: 'clock-sentinel-2', type: 'sentinel', x: 26.8, y: 5, radius: .65, motion: { axis: 'y', amplitude: 1.7, period: 7, phase: 0 } },
      { id: 'clock-pulse', type: 'orb', x: 41, y: 5.4, radius: .65, pulse: { period: 5, on: 1.5, phase: 1.8 } },
    ],
    environment: { biome: 'ruins', surface: 'astral-gears', sky: 0x0c1433, fog: 0x29375b, stone: 0x8daadd, accent: 0xffe1a2, description: 'Celestial gears and orbital sentinels guarding the dreamcore’s cradle.' },
  }),
]);
