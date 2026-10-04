import * as THREE from 'three';
import { GARDEN } from './garden-model.js';

const COLORS = {
  moss: 0x235f6c, mint: 0x83ffe0, teal: 0x39bdb9, blue: 0x728eff,
  violet: 0x9a71ed, gold: 0xffd88b, pearl: 0xe4e2ff, stone: 0x34305d,
};
const TAU = Math.PI * 2;

function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function glowTexture() {
  const size = 48, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(Math.max(0, Math.exp(-r * r * 5) - Math.exp(-5)) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function cloudTexture() {
  const size = 96, data = new Uint8Array(size * size * 4);
  const lobes = [[-.56, .04, .26, .21], [-.28, -.12, .28, .33], [.05, -.16, .32, .35],
    [.39, .03, .29, .24], [.62, .13, .20, .18], [-.05, .19, .54, .22]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + .5) / size * 2 - 1, ny = (y + .5) / size * 2 - 1;
    let density = 0;
    for (const [cx, cy, rx, ry] of lobes) density += Math.exp(-((nx - cx) ** 2 / rx ** 2 + (ny - cy) ** 2 / ry ** 2) * 1.3);
    const alpha = (1 - Math.exp(-density * .75)) * Math.max(0, 1 - Math.abs(nx) ** 8);
    const light = .48 + .32 * (1 - ny) * .5 + .16 * Math.exp(-((nx + .22) ** 2 + (ny + .17) ** 2) * 4);
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.round(light * 255);
    data[i + 3] = Math.round(Math.max(0, alpha - .004) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function jewelGeometry(radius, depth, random, segments = 13) {
  const positions = [], colors = [];
  const rings = [[], [], []];
  const palette = [0x44446e, 0x35305f, 0x222b51, 0x56527e, 0x296071, 0x282844];
  for (let i = 0; i < segments; i++) {
    const a = i / segments * TAU, variation = .92 + random() * .12;
    rings[0].push(new THREE.Vector3(Math.cos(a) * radius, -.16, Math.sin(a) * radius * .69));
    rings[1].push(new THREE.Vector3(Math.cos(a + .06) * radius * variation * .78,
      -depth * (.35 + random() * .14), Math.sin(a + .06) * radius * variation * .57));
    rings[2].push(new THREE.Vector3(Math.cos(a - .15) * radius * .19 + radius * .12,
      -depth * (.84 + random() * .11), Math.sin(a - .15) * radius * .14));
  }
  const tip = new THREE.Vector3(radius * .06, -depth * 1.13, -.1);
  const color = new THREE.Color();
  const triangle = (a, b, c) => {
    color.setHex(palette[Math.floor(random() * palette.length)]);
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(color.r, color.g, color.b);
    }
  };
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    triangle(rings[0][i], rings[1][i], rings[0][j]);
    triangle(rings[0][j], rings[1][i], rings[1][j]);
    triangle(rings[1][i], rings[2][i], rings[1][j]);
    triangle(rings[1][j], rings[2][i], rings[2][j]);
    triangle(rings[2][i], tip, rings[2][j]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .115 : .255;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: .075, bevelEnabled: true, bevelThickness: .025, bevelSize: .018,
    bevelSegments: 1, steps: 1, curveSegments: 1,
  });
  geometry.translate(0, 0, -.0375);
  return geometry;
}

function particleMaterial({ size = 4, opacity = 1, animated = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, pointSize: { value: size }, opacity: { value: opacity } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float time; uniform float pointSize; uniform float opacity;
      attribute vec3 color; attribute float phase; attribute float life;
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vec3 p=position;
        ${animated ? 'p.x+=sin(time*.24+phase*61.0)*.13;p.y+=sin(time*.43+phase*29.0)*.14;' : ''}
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=pointSize*(.65+phase*.6)*clamp(22.0/max(1.0,-mv.z),.45,2.0);
        vColor=color;vAlpha=opacity*life*(.58+.42*sin(time*1.5+phase*37.0));
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main(){
        float r=length(gl_PointCoord-.5)*2.0;if(r>1.0)discard;
        gl_FragColor=vec4(vColor,(exp(-r*r*4.0)-.018)*vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function pointsGeometry(points, random, colors = [COLORS.pearl], dynamic = false) {
  const positions = new Float32Array(points.length * 3);
  const shades = new Float32Array(points.length * 3);
  const phases = new Float32Array(points.length), life = new Float32Array(points.length).fill(1);
  const color = new THREE.Color();
  points.forEach((p, i) => {
    positions.set([p.x, p.y, p.z || 0], i * 3);
    color.setHex(colors[i % colors.length]).toArray(shades, i * 3);
    phases[i] = random();
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(shades, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('life', new THREE.BufferAttribute(life, 1));
  if (dynamic) {
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geometry.attributes.life.setUsage(THREE.DynamicDrawUsage);
    geometry.attributes.color.setUsage(THREE.DynamicDrawUsage);
  }
  return geometry;
}

/** A self-contained, disposable world; it never changes the caller's fog or camera. */
export function createGardenWorld({ scene, coarse = false }) {
  const group = new THREE.Group();
  group.name = 'Starlight Garden';
  group.visible = false;
  scene.add(group);
  const random = randomSource(0x51a71e), glow = glowTexture(), cloudMap = cloudTexture();
  const matrix = new THREE.Object3D(), color = new THREE.Color();
  const animatedMaterials = [], jellyfish = [], seeds = [], guideArcs = [];
  let disposed = false, lastCompleted = false, victoryUntil = 0, meteorBudget = 0;
  const add = (object, name, parent = group) => { object.name = name; parent.add(object); return object; };
  const basic = (hex, extra = {}) => new THREE.MeshBasicMaterial({ color: hex, fog: false, ...extra });
  const standard = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: .82, fog: false, ...extra });
  const glowMaterial = (hex, opacity) => basic(hex, {
    map: glow, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glowPlane = new THREE.PlaneGeometry(1, 1);
  const makeGlow = (hex, size, opacity, parent, name) => {
    const mesh = add(new THREE.Mesh(glowPlane, glowMaterial(hex, opacity)), name, parent);
    mesh.scale.setScalar(size);
    return mesh;
  };

  add(new THREE.HemisphereLight(0xd7d9ff, 0x28214b, .8), 'Garden sky light');
  const gardenKey = add(new THREE.DirectionalLight(0x8affdd, .65), 'Garden mint light');
  gardenKey.position.set(-8, 14, 12);
  const gardenRim = add(new THREE.DirectionalLight(0x9676ff, .6), 'Garden violet light');
  gardenRim.position.set(22, 12, -8);

  const skyMaterial = new THREE.ShaderMaterial({
    depthWrite: false,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv;void main(){
      vec3 low=vec3(.007,.014,.027),high=vec3(.003,.005,.016);
      vec3 c=mix(low,high,smoothstep(.1,.85,vUv.y));
      c+=vec3(.006,.017,.020)*exp(-pow((vUv.y-.30)*7.0,2.0));
      c+=vec3(.012,.004,.022)*exp(-dot(vec2((vUv.x-.65)*4.0,(vUv.y-.54)*8.0),vec2((vUv.x-.65)*4.0,(vUv.y-.54)*8.0)));
      gl_FragColor=vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const sky = add(new THREE.Mesh(new THREE.PlaneGeometry(150, 100), skyMaterial), 'Twilight backdrop');
  sky.position.set(20, 14, -36);
  sky.renderOrder = -20;

  const auroraMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, tint: { value: new THREE.Color(0x70ead9) } },
    side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float time;varying vec2 vUv;void main(){
      vUv=uv;vec3 p=position;p.y+=sin(p.x*.10+time*.075)*1.7;
      p.z+=sin(p.x*.16+time*.06)*1.8+sin(p.x*.31)*.4;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }`,
    fragmentShader: `uniform float time;uniform vec3 tint;varying vec2 vUv;void main(){
      float fibers=.42+.38*pow(.5+.5*sin(vUv.x*520.0+sin(vUv.x*67.0)*3.0+time*.13),2.0);
      float edge=pow(max(0.0,sin(vUv.y*3.14159265)),1.7)*smoothstep(0.0,.08,vUv.x)*(1.0-smoothstep(.92,1.0,vUv.x));
      edge*=exp(-pow((vUv.y-(.38+.16*sin(vUv.x*9.0+time*.045)))*3.6,2.0));
      vec3 c=mix(vec3(.075,.018,.18),tint,smoothstep(.16,.85,vUv.y));
      gl_FragColor=vec4(c,edge*fibers*.12);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const aurora = add(new THREE.Mesh(new THREE.PlaneGeometry(72, 6, coarse ? 50 : 90, 6), auroraMaterial), 'Flowing aurora');
  aurora.position.set(22, 11.7, -25);
  animatedMaterials.push(auroraMaterial);
  const secondAuroraMaterial = auroraMaterial.clone();
  secondAuroraMaterial.uniforms.tint.value.setHex(0x9580fa);
  const secondAurora = add(new THREE.Mesh(aurora.geometry, secondAuroraMaterial), 'Distant violet aurora');
  secondAurora.position.set(17, 15, -29);
  secondAurora.scale.set(1.2, .6, 1);
  animatedMaterials.push(secondAuroraMaterial);

  const moon = add(new THREE.Group(), 'Ringed moon');
  moon.position.set(12, 9.2, -23);
  const moonMaterial = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vNormal;varying vec3 vP;void main(){vNormal=normalize(normalMatrix*normal);vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vNormal;varying vec3 vP;void main(){
      float lit=smoothstep(-.35,.8,dot(normalize(vNormal),normalize(vec3(-.7,.45,1.0))));
      float grain=sin(vP.x*2.0+sin(vP.z*1.3)*1.4)*sin(vP.y*1.6)*.012;
      vec3 c=mix(vec3(.17,.13,.29),vec3(.76,.80,.96),lit)+grain;
      gl_FragColor=vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  add(new THREE.Mesh(new THREE.SphereGeometry(3.3, coarse ? 28 : 44, 24), moonMaterial), 'Pearlescent moon', moon);
  const moonGlow = makeGlow(0xb2a5ff, 11.5, .16, moon, 'Moon atmosphere');
  moonGlow.position.z = -.4;
  const rings = add(new THREE.Group(), 'Moon rings', moon);
  rings.rotation.set(1.08, -.16, -.27);
  const ringDust = add(new THREE.Mesh(new THREE.RingGeometry(4.1, 5.45, 96), basic(0xb8aeea,
    { transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false })), 'Moon ring dust', rings);
  for (const [radius, opacity] of [[4.18, .44], [4.55, .72], [5.15, .3]]) {
    add(new THREE.Mesh(new THREE.TorusGeometry(radius, .015, 4, 112), basic(0xe9d9bd,
      { transparent: true, opacity, depthWrite: false })), 'Fine orbit ring', rings);
  }

  const skyPoints = [];
  for (let i = 0; i < (coarse ? 600 : 1150); i++) {
    skyPoints.push({ x: -25 + random() * 100, y: -1 + random() * 31, z: -33 + random() * 18 });
  }
  const starsMaterial = particleMaterial({ size: 2.6, opacity: .83 });
  add(new THREE.Points(pointsGeometry(skyPoints, random, [0xdad5ff, 0x96dbe9, 0xffe3b2]), starsMaterial), 'Distant starlight');
  animatedMaterials.push(starsMaterial);

  const islandStone = standard(0xffffff, { vertexColors: true, flatShading: true,
    emissive: 0x34354e, emissiveIntensity: .22 });
  // Every moss cap ends at its exact physics Y; the floating rock hangs below it.
  for (const [index, island] of GARDEN.islands.entries()) {
    const land = add(new THREE.Group(), `Island ${island.id}: ${island.name || index + 1}`);
    land.position.set(island.x, island.y, 0);
    land.userData.platform = { id: island.id, top: island.y, radius: island.radius };
    add(new THREE.Mesh(jewelGeometry(island.radius, 1.35 + random() * .9, random), islandStone), 'Faceted floating roots', land);
    const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(island.radius, island.radius * .96, .15, 20),
      standard(index === GARDEN.islands.length - 1 ? 0x387e72 : COLORS.moss)), 'Flat moss landing', land);
    cap.position.y = -.075;
    cap.scale.z = .69;
    const rim = add(new THREE.Mesh(new THREE.TorusGeometry(island.radius * .985, .025, 4, 40),
      basic(index === GARDEN.islands.length - 1 ? 0xb9dfa9 : 0x63b6af, { transparent: true, opacity: .46, depthWrite: false })), 'Moss rim', land);
    rim.rotation.x = Math.PI / 2;
    rim.scale.y = .69;
    rim.position.y = -.012;
    const seamPoints = [];
    for (let v = 0; v < 3; v++) {
      const x = (random() - .5) * island.radius * 1.35;
      seamPoints.push(new THREE.Vector3(x, -.27, island.radius * .59),
        new THREE.Vector3(x * .65 + .12, -1.0 - random() * .3, island.radius * .31));
    }
    add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seamPoints),
      new THREE.LineBasicMaterial({ color: 0x69c7bc, transparent: true, opacity: .27, depthWrite: false, fog: false })), 'Luminous mineral veins', land);
  }

  const makeInstances = (geometry, material, count, name) => {
    const mesh = add(new THREE.InstancedMesh(geometry, material, count), name);
    mesh.frustumCulled = false;
    return mesh;
  };
  const writeInstance = (mesh, index, position, scale, rotation, shade) => {
    matrix.position.set(position[0], position[1], position[2]);
    matrix.scale.set(scale[0], scale[1], scale[2]);
    matrix.rotation.set(rotation[0], rotation[1], rotation[2]);
    matrix.updateMatrix();
    mesh.setMatrixAt(index, matrix.matrix);
    if (shade !== undefined) mesh.setColorAt(index, color.setHex(shade));
  };
  const plantCount = GARDEN.islands.length * (coarse ? 5 : 8);
  const stems = makeInstances(new THREE.CylinderGeometry(.017, .032, 1, 5), standard(0x79acbc), plantCount, 'Whimsical mushroom stems');
  const caps = makeInstances(new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2),
    standard(0xffffff, { emissive: 0x447f85, emissiveIntensity: .42, roughness: .55 }), plantCount, 'Luminous mushroom bells');
  const spores = makeInstances(glowPlane, glowMaterial(0x72ffe0, .24), plantCount, 'Mushroom lantern glow');
  const crystals = makeInstances(new THREE.OctahedronGeometry(1, 0),
    standard(0xffffff, { roughness: .28, metalness: .24, emissive: 0x305779, emissiveIntensity: .6 }), plantCount, 'Jewel crystal clusters');
  const moss = makeInstances(new THREE.IcosahedronGeometry(1, 0), standard(0xffffff), plantCount * 2, 'Cushions of tiny moss');
  const leafCount = plantCount * 2;
  const leaves = makeInstances(new THREE.ConeGeometry(.065, .5, 3),
    standard(0xffffff, { emissive: 0x164b51, emissiveIntensity: .3 }), leafCount, 'Glowing meadow fronds');
  let plant = 0;
  for (const island of GARDEN.islands) {
    for (let i = 0; i < plantCount / GARDEN.islands.length; i++, plant++) {
      const side = i % 2 ? 1 : -1;
      const x = island.x + side * island.radius * (.4 + random() * .4);
      const z = -.22 - random() * island.radius * .37;
      const h = .20 + random() * .54, r = .11 + random() * .15;
      const hue = [0x80eacc, 0xb19bf1, 0x74c9f0, 0xe7cba1][i % 4];
      writeInstance(stems, plant, [x, island.y + h * .5, z], [1, h, 1], [0, 0, side * -.10], 0x77b7b4);
      writeInstance(caps, plant, [x - side * h * .045, island.y + h, z], [r, r * .6, r], [0, 0, side * -.10], hue);
      writeInstance(spores, plant, [x, island.y + h + .035, z + .025], [r * 4, r * 4, 1], [0, 0, 0]);
      const cx = island.x + side * island.radius * (.68 + random() * .12);
      const height = .21 + random() * .57;
      writeInstance(crystals, plant, [cx, island.y + height * .43, .03 + random() * .47],
        [.09 + random() * .09, height * .52, .1], [0, random(), side * -.15], [0x7dcbd8, 0x9685ee, 0x67c6b5][i % 3]);
      for (let j = 0; j < 2; j++) {
        const mx = island.x + (random() - .5) * island.radius * 1.72;
        const mz = (random() - .5) * island.radius * .87;
        writeInstance(moss, plant * 2 + j, [mx, island.y + .022, mz], [.10 + random() * .21, .045, .10 + random() * .16],
          [0, random() * TAU, 0], [0x3e817c, 0x4b9a8a, 0x31677a][j % 3]);
        const lh = .2 + random() * .35;
        writeInstance(leaves, plant * 2 + j, [x + (j - .5) * .20, island.y + lh * .43, z - .1],
          [1, lh * 2, 1], [0, random() * TAU, (j - .5) * .65], j ? 0x6ec1c0 : 0x9488cb);
      }
    }
  }

  const distantStone = standard(0x5b7089, { transparent: true, opacity: .27, depthWrite: false,
    emissive: 0x3c4d68, emissiveIntensity: .65, flatShading: true });
  for (let i = 0; i < (coarse ? 9 : 14); i++) {
    const r = .8 + random() * 1.55;
    const farIsland = add(new THREE.Mesh(jewelGeometry(r, 1.3 + random() * 1.9, random, 9), distantStone), 'Distant hanging island');
    farIsland.position.set(-15 + i * 6 + random() * 2, 1 + random() * 7, -17 - random() * 9);
    farIsland.scale.y = .8;
    const tinyTower = add(new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), distantStone), 'Far crystal spire');
    tinyTower.position.copy(farIsland.position).add(new THREE.Vector3(r * .18, r * .22, 0));
    tinyTower.scale.set(r * .10, r * .40, r * .12);
  }

  const cloudCount = coarse ? 78 : 116;
  const clouds = makeInstances(glowPlane, basic(0xffffff, { map: cloudMap, transparent: true,
    opacity: .42, depthWrite: false, alphaTest: .005 }), cloudCount, 'Soft layered sea of clouds');
  for (let i = 0; i < cloudCount; i++) {
    const foreground = i % 4 === 0;
    const x = -19 + random() * 85, z = foreground ? 2 + random() * 5 : -4 - random() * 15;
    const y = foreground ? -5.5 - random() * 1.6 : -3.2 - random() * 2;
    writeInstance(clouds, i, [x, y, z], [6 + random() * 8, 3.2 + random() * 3, 1],
      [0, 0, (random() - .5) * .10], foreground ? 0x687496 : [0x7385a4, 0x67799b, 0x607998][i % 3]);
  }

  const fireflyPoints = [];
  for (const island of GARDEN.islands) for (let i = 0; i < (coarse ? 8 : 15); i++) {
    fireflyPoints.push({ x: island.x + (random() - .5) * 4.2, y: island.y + .2 + random() * 2,
      z: -.4 - random() * 2.4 });
  }
  const fireflyMaterial = particleMaterial({ size: 4.1, opacity: .9, animated: true });
  add(new THREE.Points(pointsGeometry(fireflyPoints, random, [0xf4d995, 0x6cddce, 0xb0b1f2]), fireflyMaterial), 'Fireflies above the moss');
  animatedMaterials.push(fireflyMaterial);

  const jellyCap = new THREE.SphereGeometry(1, 16, 10, 0, TAU, 0, Math.PI / 2);
  const jellyMaterial = standard(0x8ed3e0, { transparent: true, opacity: .18, depthWrite: false,
    emissive: 0x436fa1, emissiveIntensity: .8, side: THREE.DoubleSide });
  const jellyThread = new THREE.LineBasicMaterial({ color: 0x8dcde0, transparent: true, opacity: .35, depthWrite: false, fog: false });
  for (let i = 0; i < (coarse ? 2 : 3); i++) {
    const jelly = add(new THREE.Group(), 'Drifting cloud jellyfish');
    const origin = new THREE.Vector3(5 + i * 16, 7 + i % 2 * 4, -11 - i * 3);
    jelly.position.copy(origin);
    jelly.scale.setScalar(.65 + i * .22);
    const bell = add(new THREE.Mesh(jellyCap, jellyMaterial), 'Translucent bell', jelly);
    bell.scale.y = .5;
    const lip = add(new THREE.Mesh(new THREE.TorusGeometry(.97, .015, 4, 32), basic(0x94d4e3,
      { transparent: true, opacity: .56, depthWrite: false })), 'Luminous bell rim', jelly);
    lip.rotation.x = Math.PI / 2;
    for (let j = 0; j < 6; j++) {
      const a = j / 6 * TAU, thread = [];
      for (let k = 0; k <= 14; k++) {
        const t = k / 14;
        thread.push(new THREE.Vector3(Math.cos(a) * (.65 - t * .22) + Math.sin(t * 7 + a) * .16,
          -t * (1.2 + j % 3 * .24), Math.sin(a) * .60));
      }
      add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(thread), jellyThread), 'Silken cloud tentacle', jelly);
    }
    jellyfish.push({ group: jelly, origin, phase: random() * TAU });
  }

  const seedGeo = starGeometry();
  const seedMaterial = standard(0xffebba, { emissive: 0xffb94d, emissiveIntensity: .75, metalness: .35, roughness: .27 });
  const haloGeometry = new THREE.TorusGeometry(.38, .012, 4, 40);
  const haloMaterial = basic(COLORS.gold, { transparent: true, opacity: .55, depthWrite: false });
  const starData = GARDEN.stars || GARDEN.islands.slice(1).map(i => ({ id: i.id, x: i.x, y: i.y + .85 }));
  for (const [i, star] of starData.entries()) {
    const seed = add(new THREE.Group(), `Star seed ${star.id}`);
    seed.position.set(star.x, star.y, .18);
    const gem = add(new THREE.Mesh(seedGeo, seedMaterial), 'Golden star jewel', seed);
    const halo = add(new THREE.Mesh(haloGeometry, haloMaterial), 'Orbiting star halo', seed);
    halo.rotation.x = .2;
    const light = makeGlow(COLORS.gold, 1.5, .4, seed, 'Warm seed light');
    light.position.z = -.05;
    const motePositions = [];
    for (let j = 0; j < 12; j++) {
      const a = j / 12 * TAU;
      motePositions.push({ x: Math.cos(a) * .47, y: Math.sin(a) * .47, z: -.02 });
    }
    const motesMaterial = particleMaterial({ size: 2.8, opacity: .9 });
    const motes = add(new THREE.Points(pointsGeometry(motePositions, random, [COLORS.gold]), motesMaterial), 'Star seed motes', seed);
    animatedMaterials.push(motesMaterial);
    seeds.push({ group: seed, gem, halo, motes, star, phase: i * .71 });
  }

  for (let i = 0; i < GARDEN.islands.length - 1; i++) {
    const from = GARDEN.islands[i], to = GARDEN.islands[i + 1], dots = [];
    for (let j = 0; j <= 17; j++) {
      const t = j / 17;
      dots.push({ x: THREE.MathUtils.lerp(from.x, to.x, t),
        y: THREE.MathUtils.lerp(from.y, to.y, t) + 1.2 + Math.sin(t * Math.PI) * 1.0, z: -2.0 });
    }
    const material = particleMaterial({ size: 2.2, opacity: .33 });
    add(new THREE.Points(pointsGeometry(dots, random, [COLORS.gold]), material), 'Guiding constellation arc');
    guideArcs.push(material);
    animatedMaterials.push(material);
  }

  const goal = add(new THREE.Group(), 'Destination constellation');
  const finalIsland = GARDEN.islands[GARDEN.islands.length - 1];
  goal.position.set(finalIsland.x, 12, -8);
  const constellationShape = [[-2.2, -.45], [-1.45, .75], [-.58, .15], [0, 1.5],
    [1.0, .38], [2.05, 1.05], [2.35, -.45], [.55, -1.15]];
  const constellationNodes = [];
  const goalNodeGeometry = new THREE.OctahedronGeometry(.105, 0);
  for (let i = 0; i < starData.length; i++) {
    const p = constellationShape[i % constellationShape.length];
    const node = add(new THREE.Mesh(goalNodeGeometry, basic(0x6c617b)), 'Waiting constellation light', goal);
    node.position.set(p[0], p[1], 0);
    const glowNode = makeGlow(COLORS.gold, .72, .0, goal, 'Constellation aura');
    glowNode.position.copy(node.position);
    glowNode.position.z = -.02;
    constellationNodes.push({ node, glow: glowNode, id: starData[i].id });
  }
  const constellationGeometry = new THREE.BufferGeometry();
  constellationGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(starData.length * 6), 3).setUsage(THREE.DynamicDrawUsage));
  constellationGeometry.setDrawRange(0, 0);
  const constellationLines = add(new THREE.LineSegments(constellationGeometry,
    new THREE.LineBasicMaterial({ color: 0xffdaa0, transparent: true, opacity: .8, depthWrite: false, fog: false })), 'Connected golden constellation', goal);
  constellationLines.frustumCulled = false;
  const goalGlow = makeGlow(0x9578df, 8, .1, goal, 'Destination nebula');
  goalGlow.position.z = -.1;

  const trajectoryCapacity = 120;
  const trajectoryGeometry = pointsGeometry(Array.from({ length: trajectoryCapacity }, () => ({ x: 0, y: 0, z: .7 })), random, [0xffe8b0], true);
  trajectoryGeometry.setDrawRange(0, 0);
  const trajectoryMaterial = particleMaterial({ size: 4.4, opacity: .85 });
  const trajectoryDots = add(new THREE.Points(trajectoryGeometry, trajectoryMaterial), 'Live jump trajectory');
  trajectoryDots.frustumCulled = false;
  animatedMaterials.push(trajectoryMaterial);
  const landingMarker = add(new THREE.Group(), 'First landing marker');
  const landingRing = add(new THREE.Mesh(new THREE.TorusGeometry(.35, .025, 5, 36), basic(0xffdf94,
    { transparent: true, opacity: .85, depthWrite: false })), 'Landing halo', landingMarker);
  landingRing.rotation.x = Math.PI / 2;
  const innerLanding = add(new THREE.Mesh(new THREE.TorusGeometry(.22, .009, 4, 28), haloMaterial), 'Inner landing halo', landingMarker);
  innerLanding.rotation.x = Math.PI / 2;
  landingMarker.visible = false;

  const capacity = coarse ? 160 : 300;
  const particles = Array.from({ length: capacity }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, meteor: false }));
  const burstGeometry = pointsGeometry(particles, random, [COLORS.gold], true);
  burstGeometry.attributes.life.array.fill(0);
  const burstMaterial = particleMaterial({ size: 5.0 });
  const particleCloud = add(new THREE.Points(burstGeometry, burstMaterial), 'Pooled stardust bursts');
  particleCloud.frustumCulled = false;
  animatedMaterials.push(burstMaterial);
  let nextParticle = 0;
  const meteorGeometry = new THREE.BufferGeometry();
  meteorGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 6), 3).setUsage(THREE.DynamicDrawUsage));
  meteorGeometry.setDrawRange(0, 0);
  const meteorLines = add(new THREE.LineSegments(meteorGeometry,
    new THREE.LineBasicMaterial({ color: 0xffdfac, transparent: true, opacity: .60, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), 'Victory meteor trails');
  meteorLines.frustumCulled = false;

  function emit(x, y, type, count, z = .45) {
    for (let i = 0; i < count; i++) {
      const index = nextParticle++ % capacity, p = particles[index], a = random() * TAU;
      const speed = .6 + random() * 2.3;
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * speed; p.vy = Math.sin(a) * speed + .7; p.vz = (random() - .5) * 1.1;
      p.life = p.maxLife = .8 + random() * 1.2;
      p.meteor = type === 'meteor';
      if (p.meteor) { p.vx = -2.1 - random(); p.vy = -5.4 - random() * 2; p.vz = .2; p.life = p.maxLife = 2.5; }
      const shade = type === 'checkpoint' ? 0x7effdc : i % 3 ? COLORS.gold : COLORS.pearl;
      color.setHex(shade).toArray(burstGeometry.attributes.color.array, index * 3);
    }
    burstGeometry.attributes.color.needsUpdate = true;
  }

  function burst({ x = 0, y = 0, type = 'collect' } = {}) {
    if (disposed) return;
    emit(x, y, type, type === 'victory' ? (coarse ? 70 : 110) : type === 'checkpoint' ? 35 : 25);
  }

  function collectedIds(state) {
    const ids = state?.stars || [];
    if (ids instanceof Set) return ids;
    return new Set(Array.isArray(ids) ? ids : Object.keys(ids).filter(id => ids[id]));
  }

  function update({ time = 0, dt = 0, state = {}, trajectory = [], cameraTarget } = {}) {
    if (disposed) return;
    const step = Math.min(Math.max(dt, 0), .05);
    const position = state.position || state;
    const playerX = Number.isFinite(position.x) ? position.x : 0;
    const playerY = Number.isFinite(position.y) ? position.y : 1;
    const targetX = Number.isFinite(cameraTarget?.x) ? cameraTarget.x : playerX + 2.5;
    sky.position.x = targetX;
    moon.position.x = 10.2 + targetX * .68;
    moon.position.y = 9.2 + ((cameraTarget?.y ?? playerY + 1.45) - 2.8) * .18;
    rings.rotation.z = -.27 + Math.sin(time * .045) * .05;
    ringDust.material.opacity = .13 + Math.sin(time * .11) * .015;
    for (const material of animatedMaterials) material.uniforms.time.value = time;
    for (const jelly of jellyfish) {
      jelly.group.position.x = jelly.origin.x + Math.sin(time * .055 + jelly.phase) * 3.8;
      jelly.group.position.y = jelly.origin.y + Math.sin(time * .25 + jelly.phase) * .35;
      jelly.group.rotation.z = Math.sin(time * .18 + jelly.phase) * .10;
      jelly.group.scale.y = (.65 + jellyfish.indexOf(jelly) * .22) * (1 + Math.sin(time * 1.1 + jelly.phase) * .035);
    }

    const collected = collectedIds(state);
    for (const seed of seeds) {
      seed.group.visible = !collected.has(seed.star.id);
      seed.group.position.y = seed.star.y + Math.sin(time * 1.5 + seed.phase) * .07;
      seed.gem.rotation.y = Math.sin(time * .8 + seed.phase) * .34;
      seed.gem.rotation.z = Math.sin(time * .7 + seed.phase) * .08;
      seed.halo.rotation.y = time * .55 + seed.phase;
      seed.motes.rotation.z = time * .22 + seed.phase;
    }
    let activeArc = GARDEN.islands.findIndex(i => i.id === state.checkpoint);
    if (activeArc < 0) activeArc = Math.max(0, Math.min(guideArcs.length - 1, Math.floor(playerX / 5)));
    guideArcs.forEach((material, i) => { material.uniforms.opacity.value = i === activeArc ? .60 : .17; });
    let lineVertex = 0;
    constellationNodes.forEach(({ node, glow: aura, id }, i) => {
      const lit = collected.has(id);
      node.material.color.setHex(lit ? COLORS.gold : 0x6c617b);
      aura.material.opacity = lit ? .60 : .06;
      node.scale.setScalar(lit ? 1.25 + Math.sin(time * 2 + i) * .12 : .75);
      const previous = constellationNodes[(i + constellationNodes.length - 1) % constellationNodes.length];
      if (lit && collected.has(previous.id)) {
        previous.node.position.toArray(constellationGeometry.attributes.position.array, lineVertex++ * 3);
        node.position.toArray(constellationGeometry.attributes.position.array, lineVertex++ * 3);
      }
    });
    constellationGeometry.setDrawRange(0, lineVertex);
    constellationGeometry.attributes.position.needsUpdate = true;
    goalGlow.material.opacity = state.completed ? .24 + Math.sin(time * .8) * .035 : .1;
    if (state.completed && !lastCompleted) {
      victoryUntil = time + 8;
      burst({ x: playerX, y: playerY + .7, type: 'victory' });
    }
    if (!state.completed && lastCompleted) victoryUntil = 0;
    lastCompleted = !!state.completed;
    if (time < victoryUntil) {
      meteorBudget += step * (coarse ? 10 : 18);
      while (meteorBudget >= 1) {
        meteorBudget--;
        emit(playerX - 8 + random() * 19, playerY + 9 + random() * 6, 'meteor', 1, -6 - random() * 6);
      }
    }

    const path = Array.isArray(trajectory) ? trajectory : [];
    const count = Math.min(path.length, trajectoryCapacity);
    for (let i = 0; i < count; i++) {
      const p = path[Math.round(i * (path.length - 1) / Math.max(1, count - 1))];
      trajectoryGeometry.attributes.position.array.set([p.x, p.y, .68], i * 3);
      trajectoryGeometry.attributes.life.array[i] = .45 + .55 * (1 - i / Math.max(1, count));
    }
    trajectoryGeometry.setDrawRange(0, count);
    trajectoryGeometry.attributes.position.needsUpdate = true;
    trajectoryGeometry.attributes.life.needsUpdate = true;
    landingMarker.visible = false;
    if (count > 1) {
      const end = path.find(p => p.landing || p.landed) || path[path.length - 1];
      const island = GARDEN.islands.find(i => Math.abs(end.x - i.x) <= i.radius + GARDEN.xRadius
        && Math.abs(end.y - i.y - GARDEN.halfHeight) < .04);
      if (island) {
        landingMarker.visible = true;
        landingMarker.position.set(end.x, island.y + .055, .08);
        landingMarker.scale.setScalar(1 + Math.sin(time * 5) * .07);
      }
    }

    let trailVertex = 0;
    for (let i = 0; i < capacity; i++) {
      const p = particles[i];
      p.life = Math.max(0, p.life - step);
      if (p.life > 0) {
        p.x += p.vx * step; p.y += p.vy * step; p.z += p.vz * step;
        if (!p.meteor) p.vy -= .7 * step;
        burstGeometry.attributes.position.array.set([p.x, p.y, p.z], i * 3);
        if (p.meteor) {
          meteorGeometry.attributes.position.array.set([p.x, p.y, p.z,
            p.x - p.vx * .16, p.y - p.vy * .16, p.z - p.vz * .16], trailVertex * 3);
          trailVertex += 2;
        }
      }
      burstGeometry.attributes.life.array[i] = p.life / p.maxLife;
    }
    burstGeometry.attributes.position.needsUpdate = true;
    burstGeometry.attributes.life.needsUpdate = true;
    meteorGeometry.attributes.position.needsUpdate = true;
    meteorGeometry.setDrawRange(0, trailVertex);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set(), materials = new Set();
    group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of [].concat(object.material)) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    glow.dispose();
    cloudMap.dispose();
    group.removeFromParent();
  }

  group.userData.islandCount = GARDEN.islands.length;
  group.userData.starIds = starData.map(star => star.id);
  return { group, update, burst, dispose };
}
