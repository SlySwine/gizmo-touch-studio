import * as THREE from 'three';

/** Three rooted lotus flowers: collected petals form buds, then the garden action unfurls them. */
export function createGardenBloom(parent, garden, coarse = false) {
  const root = new THREE.Group();
  root.name = 'Living moon garden';
  root.position.set(garden.x, garden.y || 0, garden.z);
  parent.add(root);
  const owned = [], keep = value => (owned.push(value), value);
  const colors = [0xee96d0, 0x9bd9ef, 0xf2ca88];
  const routes = ['conservatory', 'arcade', 'foundry'];
  const glow = (color, opacity) => keep(new THREE.MeshBasicMaterial({color, opacity, transparent:true, depthWrite:false, toneMapped:false}));
  const sphere = keep(new THREE.SphereGeometry(1, 12, 8));
  const stalkGeometry = keep(new THREE.CylinderGeometry(1, 1, 1, 5));
  const stemMaterial = keep(new THREE.MeshStandardMaterial({color:0x587779, roughness:.55, metalness:.18}));
  function mesh(geometry, material, parent = root) {
    const value = new THREE.Mesh(geometry, material); parent.add(value); return value;
  }

  // Each petal has a curved center vein, a cupped cross section and a fine pointed tip.
  // The second shape opens radially; morph normals preserve the pearly surface as it unfolds.
  function petalGeometry(length, height) {
    const along = coarse ? 10 : 16, across = coarse ? 6 : 10;
    const closed = [], opened = [], color = [], indices = [];
    for (let row = 0; row <= along; row++) {
      const t = row / along, taper = Math.pow(Math.sin(Math.PI * t), .76);
      for (let col = 0; col <= across; col++) {
        const s = col / across * 2 - 1, edgeCurl = s * s * taper;
        closed.push(s * taper * .205, .035 + height * t + edgeCurl * .025, .07 + Math.sin(Math.PI * t) * .25);
        opened.push(s * taper * length * .43,
          .035 + height * (.17 * t + .68 * t * t) + edgeCurl * .14,
          .075 + length * t - edgeCurl * .045);
        const light = .70 + t * .30, alpha = 1 - Math.pow(t, 4) * .29;
        color.push(light, light, light, alpha);
        if (row < along && col < across) {
          const a = row * (across + 1) + col, b = a + across + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(closed, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 4));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const openGeometry = new THREE.BufferGeometry();
    openGeometry.setAttribute('position', new THREE.Float32BufferAttribute(opened, 3));
    openGeometry.setIndex(indices); openGeometry.computeVertexNormals();
    geometry.morphAttributes.position = [openGeometry.attributes.position.clone()];
    geometry.morphAttributes.normal = [openGeometry.attributes.normal.clone()];
    openGeometry.dispose();
    return geometry;
  }
  const outerGeometry = petalGeometry(.77, .66), innerGeometry = petalGeometry(.48, .94);
  const leafGeometry = petalGeometry(.65, .14);
  const leafMaterial = keep(new THREE.MeshStandardMaterial({color:0x2d5454, roughness:.64, metalness:.12, side:THREE.DoubleSide}));
  const flowers = [];
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3 - .5;
    const flower = new THREE.Group();
    flower.position.set(Math.cos(angle) * 1.8, .03, Math.sin(angle) * 1.8); root.add(flower);
    const petals = new THREE.Group(); flower.add(petals);
    const material = keep(new THREE.MeshPhysicalMaterial({
      color:colors[i], emissive:colors[i], emissiveIntensity:.018,
      roughness:.34, metalness:.13, clearcoat:.62, clearcoatRoughness:.26,
      iridescence:coarse ? .12 : .32, iridescenceIOR:1.3,
      side:THREE.DoubleSide, vertexColors:true, transparent:true, depthWrite:false
    }));
    const blades = [];
    for (const [count, geometry, offset, y] of [[coarse ? 6 : 8, outerGeometry, 0, 0], [coarse ? 4 : 5, innerGeometry, .38, .13]]) {
      for (let j = 0; j < count; j++) {
        const blade = mesh(geometry, material, petals);
        blade.rotation.y = j * Math.PI * 2 / count + offset;
        blade.position.y = y; blade.morphTargetInfluences[0] = 0;
        blades.push({mesh:blade, inner:y > 0});
      }
    }
    for (let j = 0; j < 5; j++) {
      const leaf = mesh(leafGeometry, leafMaterial, flower);
      leaf.rotation.y = j * Math.PI * 2 / 5 + .22; leaf.morphTargetInfluences[0] = 1;
      leaf.scale.set(1.08, .60, 1.08);
    }
    const heart = new THREE.Group(); petals.add(heart);
    const seedMaterial = glow(colors[i], .15);
    const stalks = new THREE.InstancedMesh(stalkGeometry, stemMaterial, 7);
    const seeds = new THREE.InstancedMesh(sphere, seedMaterial, 7);
    heart.add(stalks, seeds);
    const stemTransform = new THREE.Object3D();
    for (let j = 0; j < 7; j++) {
      const a = j * 2.399, radius = j === 0 ? 0 : .12, height = .42 + (j % 3) * .06;
      stemTransform.position.set(Math.cos(a) * radius, height / 2 + .10, Math.sin(a) * radius);
      stemTransform.scale.set(.015, height, .015); stemTransform.updateMatrix(); stalks.setMatrixAt(j, stemTransform.matrix);
      stemTransform.position.y += height / 2; stemTransform.scale.set(.04, .055, .04);
      stemTransform.updateMatrix(); seeds.setMatrixAt(j, stemTransform.matrix);
    }
    stalks.instanceMatrix.needsUpdate = seeds.instanceMatrix.needsUpdate = true;
    const core = mesh(sphere, glow(colors[i], .18), heart);
    core.position.y = .25; core.scale.set(.13, .075, .13);
    const points = [];
    for (let j = 0; j <= 32; j++) {
      const t = j / 32, a = t * Math.PI * 3.2 + i;
      points.push(new THREE.Vector3(Math.cos(a) * (.09 + .19 * t), .52 + t * 1.75, Math.sin(a) * (.09 + .19 * t)));
    }
    const ribbonCurve = new THREE.CatmullRomCurve3(points);
    const ribbon = mesh(keep(new THREE.TubeGeometry(ribbonCurve, 48, .009, 4, false)), glow(colors[i], 0), flower);
    const firefly = mesh(sphere, glow(colors[i], 0), flower); firefly.scale.setScalar(.055);
    flowers.push({flower, petals, material, blades, heart, seedMaterial, core, ribbon, ribbonCurve, firefly, power:0});
  }
  const pollenCount = coarse ? 36 : 72, pollenData = new Float32Array(pollenCount * 3);
  const pollenGeometry = keep(new THREE.BufferGeometry());
  pollenGeometry.setAttribute('position', new THREE.BufferAttribute(pollenData, 3));
  const pollen = new THREE.Points(pollenGeometry, keep(new THREE.PointsMaterial({color:0xc9ffe9, size:.045, transparent:true, opacity:0, depthWrite:false, toneMapped:false})));
  root.add(pollen);
  const ring = mesh(keep(new THREE.TorusGeometry(2.7, .023, 5, 64)), glow(0xb8f4e1, .06));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .085;
  let bloom = 0, lastElapsed = -1;
  function update(time, dt, state) {
    const t = state.elapsed ?? time, traversal = state.traversal || {};
    if (t < lastElapsed - .05) { bloom = 0; flowers.forEach(f => f.power = 0); }
    lastElapsed = t;
    bloom = THREE.MathUtils.damp(bloom, traversal.gardenAwake ? 1 : 0, 1.7, dt);
    flowers.forEach((flower, i) => {
      const visited = (traversal.visited || []).includes(routes[i]);
      flower.power = THREE.MathUtils.damp(flower.power, visited ? 1 : 0, 2.5, dt);
      const open = THREE.MathUtils.smoothstep(bloom, i * .055, .82 + i * .055);
      const size = .60 + flower.power * .19 + open * .21;
      flower.petals.scale.set(size, .20 + flower.power * .16 + open * .64, size);
      flower.material.color.setHex(visited ? colors[i] : 0x345259);
      flower.material.emissiveIntensity = .012 + flower.power * .035 + open * .14;
      flower.blades.forEach(({mesh,inner}, j) => {
        mesh.morphTargetInfluences[0] = open * (inner ? .86 : 1);
        mesh.rotation.z = Math.sin(t * .55 + j * .8 + i) * .022 * open;
      });
      flower.heart.scale.setScalar(.42 + open * .58);
      flower.seedMaterial.opacity = .08 + open * .86;
      flower.core.material.opacity = .12 + open * .65;
      flower.ribbon.material.opacity = open * .17;
      flower.ribbon.rotation.y = t * .20 + i;
      const age = (t * .20 + i * .27) % 1;
      flower.firefly.position.copy(flower.ribbonCurve.getPoint(age)).applyAxisAngle(new THREE.Vector3(0,1,0), flower.ribbon.rotation.y);
      flower.firefly.material.opacity = open * Math.sin(age * Math.PI) * .88;
    });
    ring.material.opacity = .05 + (traversal.petals === 3 ? .16 : 0) + bloom * .17;
    pollen.material.opacity = bloom * .56;
    for (let i = 0; i < pollenCount; i++) {
      const flower = flowers[i % 3].flower.position, age = (t * .23 + i * .137) % 1;
      const angle = i * 2.399 + age * 3, radius = .10 + age * .55;
      pollenData.set([flower.x + Math.cos(angle) * radius, .5 + age * 1.8, flower.z + Math.sin(angle) * radius], i * 3);
    }
    pollenGeometry.attributes.position.needsUpdate = true;
    root.userData.bloom = bloom;
  }
  return {update, group:root, dispose(){parent.remove(root);owned.forEach(value => value.dispose());}};
}
