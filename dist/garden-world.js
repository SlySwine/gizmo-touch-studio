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

const REALMS = [
  { sky:0x080e26, haze:0x182f51, color:0x564591, edge:0x70f5ce, accent:0xffa7db, key:0xc3d9ff },
  { sky:0x070c25, haze:0x163b68, color:0x668acd, edge:0x8ff7ff, accent:0xc3a1ff, key:0xb1d9ff },
  { sky:0x100a2b, haze:0x352560, color:0x8f80ba, edge:0xf6cfff, accent:0x72f2ff, key:0xcce0ff },
  { sky:0x090c28, haze:0x28255b, color:0x54467d, edge:0xc69dff, accent:0x8befff, key:0xd2cbff },
  { sky:0x100e28, haze:0x30224b, color:0x796b96, edge:0xffdca0, accent:0x95e8ff, key:0xffe2b6 },
];
function realmIndex(layout) {
  return Math.max(0, ['starlight-garden','moonlit-tidelands','frostglass-reach','emberfall-caldera','cloud-cathedral'].indexOf(layout.id));
}
function combineGeometries(entries) {
  const p=[],n=[],uv=[];
  for(const entry of entries){
    const source=entry.geometry || entry, matrix=entry.matrix || new THREE.Matrix4();
    const geometry=source.index?source.toNonIndexed():source.clone();geometry.applyMatrix4(matrix);
    p.push(...geometry.attributes.position.array);n.push(...geometry.attributes.normal.array);
    if(geometry.attributes.uv)uv.push(...geometry.attributes.uv.array);else uv.push(...new Array(geometry.attributes.position.count*2).fill(0));
    geometry.dispose();
  }
  const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  result.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));result.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return result;
}
function petalGeometry(count=10) {
  const p=[],uv=[],indices=[];
  for(let k=0;k<count;k++){
    const base=p.length/3,angle=k/count*TAU;
    for(let u=0;u<=12;u++)for(let v=0;v<=6;v++){
      const t=u/12,s=v/6*2-1,width=Math.sin(t*Math.PI)**.65*.36;
      const r=.12+t*.99, lateral=s*width;
      p.push(Math.cos(angle)*r-Math.sin(angle)*lateral,
        -.08-Math.sin(t*Math.PI)*.20-t*t*.22+Math.abs(s)**2*.08,
        Math.sin(angle)*r+Math.cos(angle)*lateral);uv.push(t,v/6);
      if(u<12&&v<6){const a=base+u*7+v;indices.push(a,a+1,a+7,a+1,a+8,a+7);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function landingGeometry() {
  const p=[0,0,0],uv=[.5,.5],index=[],sides=72;
  for(let j=0;j<sides;j++){const a=j/sides*TAU,r=1-.055*Math.sin(a*5)**2;p.push(Math.cos(a)*r,0,Math.sin(a)*r*.75);uv.push(Math.cos(a)*.5+.5,Math.sin(a)*.5+.5);}
  for(let j=0;j<sides;j++)index.push(0,1+(j+1)%sides,1+j);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}
function jellyGeometry(coarse) {
  const p=[],uv=[],index=[],sides=coarse?36:56,rings=18;
  for(let j=0;j<=rings;j++)for(let k=0;k<=sides;k++){
    const t=j/rings*Math.PI*.5,a=k/sides*TAU,r=Math.sin(t)*(1+Math.sin(a*16)*.025*Math.sin(t)**4);
    p.push(Math.cos(a)*r,.62*Math.cos(t)-.035*Math.sin(a*16)*Math.sin(t)**8,Math.sin(a)*r);uv.push(k/sides,j/rings);
    if(j<rings&&k<sides){const i=j*(sides+1)+k;index.push(i,i+sides+1,i+1,i+1,i+sides+1,i+sides+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}
function tentacleGeometry(coarse) {
  const parts=[];
  for(let i=0;i<12;i++){
    const a=i/12*TAU,points=[];
    for(let j=0;j<=12;j++){const t=j/12, r=.66+.10*Math.sin(t*8+i);points.push(new THREE.Vector3(Math.cos(a)*r+Math.sin(t*5+i)*t*.18,-t*(1.7+(i%4)*.38),Math.sin(a)*r+Math.cos(t*6+i)*t*.18));}
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),coarse?14:22,.012+(i%3)*.006,3,false));
  }
  const result=combineGeometries(parts);parts.forEach(g=>g.dispose());return result;
}
function radialGeometry() {
  const parts=[];
  for(let i=0;i<12;i++){
    const a=i/12*TAU,points=[];for(let j=0;j<12;j++){const t=j/11*Math.PI*.49;points.push(new THREE.Vector3(Math.cos(a)*Math.sin(t)*.93,.57*Math.cos(t),Math.sin(a)*Math.sin(t)*.93));}
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),14,.009,3,false));
  }
  const result=combineGeometries(parts);parts.forEach(g=>g.dispose());return result;
}

/** Believable magical materials and precise visible mission contacts share one world space. */
export function createGardenWorld({scene,coarse=false,layout=GARDEN,assets={}}) {
  const realm=realmIndex(layout),theme=REALMS[realm],random=randomSource(81571+realm*619);
  const group=new THREE.Group();group.name=layout.name || 'Starlight Garden';group.visible=false;scene.add(group);
  const geometries=new Set(),materials=new Set(),sharedGeometries=new Set(),textures=new Set();
  const sourceKit=assets.kit?.scene || assets.kit,environment=assets.environment || null;
  if(sourceKit)sourceKit.traverse(o=>{if(o.geometry)sharedGeometries.add(o.geometry);});
  const timeUniform={value:0}, hazeColor=new THREE.Color(theme.haze);
  const glow=glowTexture(),cloud=cloudTexture();textures.add(glow);textures.add(cloud);
  const own=g=>(geometries.add(g),g),mat=m=>(materials.add(m),m);
  const add=(o,name,parent=group)=>{o.name=name;parent.add(o);return o;};
  const mesh=(geometry,material,name,parent=group)=>add(new THREE.Mesh(geometry,material),name,parent);
  const basic=(color,extra={})=>mat(new THREE.MeshBasicMaterial({color,fog:false,...extra}));
  function physical(color,extra={}) {
    const {haze=.011,flex=false,...options}=extra;
    const m=mat(new THREE.MeshPhysicalMaterial({color,roughness:.3,metalness:.12,envMap:environment,
      envMapIntensity:.4,clearcoat:.6,clearcoatRoughness:.22,fog:false,...options}));
    m.onBeforeCompile=shader=>{
      shader.uniforms.dreamHaze={value:hazeColor};shader.uniforms.dreamDensity={value:haze};shader.uniforms.dreamTime=timeUniform;
      shader.fragmentShader='uniform vec3 dreamHaze;uniform float dreamDensity;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
        '#include <opaque_fragment>\ngl_FragColor.rgb=mix(gl_FragColor.rgb,dreamHaze,min(.93,1.0-exp(-pow(length(vViewPosition)*dreamDensity,2.0))));');
      if(flex){shader.vertexShader='uniform float dreamTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        'vec3 transformed=position;float w=max(0.0,-position.y);transformed.x+=sin(dreamTime*.8+w*1.9+position.z*5.0)*w*.045;transformed.z+=cos(dreamTime*.63+w*1.5+position.x*3.0)*w*.035;');}
    };m.customProgramCacheKey=()=>`dream-haze-${flex?'flex':'rigid'}`;return m;
  }
  const gold=physical(0xc59d5d,{metalness:.82,roughness:.25,envMapIntensity:.65});
  const pearl=physical(0xa7b9d7,{roughness:.27,metalness:.2});
  const petal=physical(theme.color,{roughness:.34,metalness:.04,sheen:1,sheenColor:new THREE.Color(theme.accent),sheenRoughness:.45,side:THREE.DoubleSide});
  const surface=physical(realm===0?0x48577a:theme.color,{roughness:realm===2?.15:.33,metalness:.10,clearcoat:.8});
  const glass=physical(0x315784,{roughness:.16,metalness:0,transmission:coarse?.30:.65,thickness:.65,ior:1.36,transparent:true,opacity:.62,side:THREE.DoubleSide,depthWrite:false,envMapIntensity:.65,attenuationColor:new THREE.Color(theme.edge),attenuationDistance:2.5});
  // The bright HDR sky otherwise dominates low-roughness glass and washes its facets to chalk.
  const crystal=physical(realm===2?0x6680c8:0x51769d,{roughness:.03,metalness:0,transmission:coarse?.72:.92,thickness:.8,ior:1.6,dispersion:coarse?0:.5,clearcoat:1,envMapIntensity:realm===2||realm===4?.132:1.1,attenuationColor:new THREE.Color(0x5268cd),attenuationDistance:1.5});
  const glowMaterial=physical(theme.edge,{emissive:theme.edge,emissiveIntensity:.28,roughness:.25,metalness:.15});
  const filament=physical(theme.edge,{emissive:theme.edge,emissiveIntensity:.25,transparent:true,opacity:.55,roughness:.35,depthWrite:false,flex:true});
  const backGlass=physical(theme.accent,{haze:.028,roughness:.3,metalness:0,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide,emissive:theme.edge,emissiveIntensity:.1});
  const backFilament=physical(theme.edge,{haze:.028,transparent:true,opacity:.17,depthWrite:false,emissive:theme.edge,emissiveIntensity:.12,flex:true});
  const accentBasic=basic(theme.edge,{transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending});
  const dimBasic=basic(theme.edge,{transparent:true,opacity:.18,depthWrite:false});
  const plane=own(new THREE.PlaneGeometry(1,1)),ring=own(new THREE.TorusGeometry(1,.017,5,coarse?48:72));
  const sphere=own(new THREE.SphereGeometry(1,coarse?16:24,coarse?10:16));
  const petals=own(petalGeometry()),landing=own(landingGeometry()),bell=own(jellyGeometry(coarse));
  const tentacles=own(tentacleGeometry(coarse)),radials=own(radialGeometry());
  const diamond=own(new THREE.OctahedronGeometry(1,0));
  const haloMaterials=[];
  function halo(color,size,opacity,parent=group){const m=basic(color,{map:glow,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});haloMaterials.push(m);const o=mesh(plane,m,'Atmospheric glow',parent);o.scale.setScalar(size);return o;}
  function hoop(radius,material,parent,name='Luminous hoop'){const o=mesh(ring,material,name,parent);o.scale.setScalar(radius);return o;}
  function kit(name,parent,{width=2,height=1,depth=width,top=false,material=null}={}) {
    const source=sourceKit?.getObjectByName(name);if(!source)return null;
    sourceKit.updateWorldMatrix(true,true);const inverse=source.matrixWorld.clone().invert(),bounds=new THREE.Box3(),parts=[];
    source.traverse(o=>{if(!o.isMesh)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const transform=inverse.clone().multiply(o.matrixWorld);bounds.union(o.geometry.boundingBox.clone().applyMatrix4(transform));parts.push({o,transform});});
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),result=add(new THREE.Group(),name,parent);
    const normalization=new THREE.Matrix4().makeScale(width/size.x,height/size.y,depth/size.z).multiply(new THREE.Matrix4().makeTranslation(-center.x,-(top?bounds.max.y:bounds.min.y),-center.z));
    for(const {o,transform} of parts){const slot=o.material?.name || '';const mapped=material || (/gold|brass|metal/i.test(slot)?gold:/canal|organ|light|energy/i.test(slot)?glowMaterial:/glass|prism|crystal/i.test(slot)?crystal:/membrane/i.test(slot)?glass:petal);const child=mesh(o.geometry,mapped,o.name,result);child.applyMatrix4(normalization.clone().multiply(transform));child.castShadow=true;child.receiveShadow=true;}
    return result;
  }
  function jelly(parent,size=1,background=false){
    const g=add(new THREE.Group(),background?'Distant living jellyfish':'Living jellyfish',parent);g.scale.setScalar(size);
    const b=kit('JellyBell',g,{width:2,height:.64,depth:2,material:background?backGlass:null}) || mesh(bell,background?backGlass:glass,'Translucent bell',g);
    const canals=mesh(radials,background?backFilament:glowMaterial,'Radial organs',g);canals.position.y=.015;
    mesh(tentacles,background?backFilament:filament,'Flowing tentacles',g);
    const organ=mesh(sphere,background?backGlass:crystal,'Pulsing inner organ',g);organ.scale.set(.32,.19,.32);organ.position.y=.25;
    return {group:g,bell:b,organ};
  }

  // An opaque, softly structured nebula backs the scene without flattening its depth.
  const skyMaterial=mat(new THREE.ShaderMaterial({depthWrite:false,uniforms:{time:timeUniform,base:{value:new THREE.Color(theme.sky)},haze:{value:hazeColor},accent:{value:new THREE.Color(theme.accent)}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform float time;uniform vec3 base,haze,accent;varying vec2 vUv;
      float wave(vec2 p){return sin(p.x*9.+sin(p.y*7.))*sin(p.y*5.+sin(p.x*6.));}
      void main(){vec2 p=vUv;float n=wave(p*2.3)*.5+wave(p*5.7)*.22;float veil=exp(-pow((p.y-.44-n*.05)*8.,2.));
      vec3 c=base+haze*veil*.34+accent*pow(max(0.,n),3.)*.025;gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`}));
  const sky=mesh(own(new THREE.PlaneGeometry(320,210)),skyMaterial,'Deep nocturnal nebula');sky.position.set(20,12,-110);sky.renderOrder=-30;
  const ambient=add(new THREE.HemisphereLight(0xb0cfff,0x291e45,.55),'Soft celestial sky');
  const key=add(new THREE.DirectionalLight(theme.key,1.7),'Soft moon key');add(key.target,'Moon key target');key.castShadow=true;key.shadow.mapSize.set(coarse?1024:2048,coarse?1024:2048);Object.assign(key.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:.5,far:65});key.shadow.bias=-.0002;key.shadow.normalBias=.018;key.shadow.radius=3;
  const fill=add(new THREE.PointLight(theme.edge,7,26,2),'Subtle luminous bounce');

  const platforms=new Map(),platformAnimations=[],backgroundJellies=[];
  const tinyFlowerParts=[];
  for(let i=0;i<6;i++){const m=new THREE.Matrix4().makeRotationY(i/6*TAU).multiply(new THREE.Matrix4().makeTranslation(.11,.025,0)).multiply(new THREE.Matrix4().makeScale(.17,.045,.085));tinyFlowerParts.push({geometry:sphere,matrix:m});}
  const facetShape=new THREE.Shape();facetShape.moveTo(-1,-.37);facetShape.lineTo(-.80,-.60);facetShape.lineTo(.72,-.60);facetShape.lineTo(1,-.30);facetShape.lineTo(1,.29);facetShape.lineTo(.76,.60);facetShape.lineTo(-.77,.60);facetShape.lineTo(-1,.32);facetShape.closePath();
  const facet=own(new THREE.ExtrudeGeometry(facetShape,{depth:.16,bevelEnabled:true,bevelThickness:.045,bevelSize:.035,bevelSegments:2,steps:1}));facet.rotateX(Math.PI/2);facet.translate(0,-.045,0);
  const facetMaterial=physical(realm===4?0x30294d:0x263767,{roughness:.07,metalness:0,transmission:coarse?.15:.36,thickness:.18,ior:1.52,clearcoat:1,envMapIntensity:.065,attenuationColor:new THREE.Color(0x25368a),attenuationDistance:.7});
  const facetEdges=own(new THREE.EdgesGeometry(facet));
  const facetEdgeMaterial=basic(theme.edge,{transparent:true,opacity:.30,depthWrite:false});
  const contactMembrane=physical(0x467fac,{roughness:.19,metalness:.03,transmission:coarse?.22:.62,thickness:.08,ior:1.36,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide});
  const tinyFlower=own(combineGeometries(tinyFlowerParts));
  const flowerMaterial=physical(0xa393b8,{emissive:theme.accent,emissiveIntensity:.15,roughness:.35,sheen:1,sheenColor:new THREE.Color(theme.accent)});
  const dummy=new THREE.Object3D();
  for(const [index,island] of (layout.islands || GARDEN.islands).entries()){
    const p=add(new THREE.Group(),`Landing ${island.id}`);p.position.set(island.x,island.y,0);platforms.set(island.id,p);const r=island.radius;
    if(realm===1){const top=mesh(landing,contactMembrane,'Thin jelly contact membrane',p);top.scale.set(r,1,r);top.receiveShadow=true;}
    if(realm===2 || realm===4){const top=mesh(facet,facetMaterial,'Beveled optical landing facet',p);top.scale.set(r/1.035,1,realm===4?r*.65:r);top.receiveShadow=true;top.castShadow=true;const edges=add(new THREE.LineSegments(facetEdges,facetEdgeMaterial),'Optical facet bevel',p);edges.scale.copy(top.scale);}
    if(realm===1){const j=jelly(p,r);j.group.position.y=-.63*r-.06;platformAnimations.push({type:'jelly',...j});}
    else if(realm===2){
      const c=kit('CrystalCluster',p,{width:r*1.9,height:2.5+index%3*.4,depth:r*1.35,top:true});
      if(!c){const o=mesh(diamond,crystal,'Crystalline support',p);o.position.y=-1.5;o.scale.set(r,1.5,r*.72);}
      for(let n=0;n<3;n++){const q=mesh(diamond,crystal,'Prismatic crown',p);q.scale.set(.18,.32+n*.14,.18);q.position.set((n-1)*r*.5,.10,-r*.55);q.rotation.z=(n-1)*.18;}
    }else{
      const pet=realm===4?null:kit('LotusPlatform',p,{width:r*2,height:realm===3?1.25:.9,depth:r*1.55,top:true}) || mesh(petals,petal,'Layered flower petals',p);
      if(pet?.isMesh)pet.scale.set(r,1.8,r*.76);
      if(realm===4){const o=kit('Orrery',p,{width:r*2.4,height:1.7,depth:r*1.8,top:true});if(!o){const h=hoop(r*1.1,gold,p);h.rotation.x=1.13;h.position.y=-.55;}}
      if(realm===3){const h=hoop(r*1.1,gold,p,'Conducting storm ring');h.rotation.x=Math.PI/2;h.position.y=-.35;platformAnimations.push({type:'ring',group:h,baseY:h.position.y});}
    }
    if(realm!==2 && realm!==4){const rim=hoop(r*.96,realm===1?accentBasic:glowMaterial,p,'Landing edge');rim.rotation.x=Math.PI/2;rim.scale.y*=.75;rim.position.y=-.025;}
    if(realm===0 || realm===3){
      const count=coarse?12:23,flowers=add(new THREE.InstancedMesh(tinyFlower,flowerMaterial,count),'Living edge blossoms',p);
      for(let j=0;j<count;j++){const a=random()*TAU,rad=r*(.71+random()*.2);dummy.position.set(Math.cos(a)*rad,.04,Math.sin(a)*rad*.72);if(Math.abs(dummy.position.z)<.22)dummy.position.z=-.28;dummy.rotation.set((random()-.5)*.2,random()*TAU,0);dummy.scale.setScalar(.6+random()*.8);dummy.updateMatrix();flowers.setMatrixAt(j,dummy.matrix);}
    }
    if(index>0){const underside=halo(theme.edge,r*2.2,.13,p);underside.position.set(0,-.6,-.3);}
  }

  // Distinct background silhouettes stay behind the route and are deliberately subdued.
  for(let i=0;i<(realm===1?(coarse?5:8):realm===0?(coarse?2:3):0);i++){
    const j=jelly(group,1.8+random()*1.8,true);j.group.position.set(-12+i*(realm===0?27:11),4+random()*7,-22-random()*18);j.group.rotation.z=(random()-.5)*.3;backgroundJellies.push({...j,origin:j.group.position.clone(),phase:random()*TAU});
  }
  if(realm===0 || realm===3){
    const count=coarse?18:34,canopyMaterial=physical(0x332b67,{haze:.032,roughness:.5,metalness:0,emissive:theme.accent,emissiveIntensity:.04,side:THREE.DoubleSide});
    const canopy=add(new THREE.InstancedMesh(petals,canopyMaterial,count),'Distant blooming lotus canopy');
    for(let i=0;i<count;i++){dummy.position.set(-18+i*3.1, -1+random()*4, -15-random()*21);dummy.scale.set(2.1+random()*2,2+random()*2,2+random()*2);dummy.rotation.set((random()-.5)*.2,random()*TAU,0);dummy.updateMatrix();canopy.setMatrixAt(i,dummy.matrix);}
  }
  if(realm===2 || realm===4){
    for(let i=0;i<8;i++){const parent=add(new THREE.Group(),'Distant astral monument');parent.position.set(-17+i*13,2+random()*8,-28-random()*16);parent.rotation.z=(random()-.5)*.6;
      if(realm===4){for(let j=0;j<3;j++){const h=hoop(2+j*.7,backFilament,parent);h.rotation.set(j*.5,j*.9,j*.3);}}
      else{const o=mesh(diamond,backGlass,'Distant beveled diamond',parent);o.scale.set(1.7,3.4,1.7);}
    }
  }
  const mistCount=coarse?24:42,mist=add(new THREE.InstancedMesh(plane,basic(theme.haze,{map:cloud,transparent:true,opacity:.16,depthWrite:false}),mistCount),'Deep low cloud sea');
  for(let i=0;i<mistCount;i++){dummy.position.set(-20+random()*100,-4+random()*4,-7-random()*25);dummy.scale.set(10+random()*14,3+random()*5,1);dummy.rotation.set(0,0,0);dummy.updateMatrix();mist.setMatrixAt(i,dummy.matrix);}
  const fireflyPoints=[];for(let i=0;i<(coarse?220:480);i++)fireflyPoints.push({x:-12+random()*85,y:-2+random()*17,z:-1-random()*36});
  const fireflyMaterial=mat(particleMaterial({size:realm===0?3:2.3,opacity:.7,animated:true}));add(new THREE.Points(own(pointsGeometry(fireflyPoints,random,[theme.edge,theme.accent,0xffe3a0])),fireflyMaterial),'Fireflies and astral dust');

  const targets=new Map(),hazards=new Map();let gate=null,exit=null,core=null,coreLink=null,coreGlow=null;
  const chargePoints=[];for(let i=0;i<=80;i++){const a=Math.PI/2-i/80*TAU;chargePoints.push(new THREE.Vector3(Math.cos(a),Math.sin(a),.2));}
  const chargeRing=add(new THREE.Line(own(new THREE.BufferGeometry().setFromPoints(chargePoints)),basic(0xffd99c,{transparent:true,opacity:.9})),'Stabilizer remaining charge');chargeRing.visible=false;
  const numberSegments=[['a','b','c','d','e','f'],['b','c'],['a','b','g','e','d'],['a','b','g','c','d'],['f','g','b','c'],['a','f','g','c','d'],['a','f','g','e','c','d'],['a','b','c'],['a','b','c','d','e','f','g'],['a','b','c','d','f','g']];
  const segmentPoints={a:[[-.12,.20],[.12,.20]],b:[[.12,.20],[.12,0]],c:[[.12,0],[.12,-.20]],d:[[-.12,-.20],[.12,-.20]],e:[[-.12,0],[-.12,-.20]],f:[[-.12,.20],[-.12,0]],g:[[-.12,0],[.12,0]]};
  function numeral(number,parent){const points=[];for(const s of numberSegments[number%10])for(const q of segmentPoints[s])points.push(new THREE.Vector3(q[0],q[1],.22));const o=add(new THREE.LineSegments(own(new THREE.BufferGeometry().setFromPoints(points)),basic(0xffffff)),`Mirror ${number}`,parent);return o;}
  function makeTarget(t,index){
    const target=add(new THREE.Group(),`Mission ${t.kind || layout.mission?.type} ${t.id}`);target.position.set(t.x,t.y,.18);
    const r=t.radius || .52,m=physical(theme.edge,{emissive:theme.edge,emissiveIntensity:.30,metalness:.5,roughness:.22});
    const outer=hoop(r,m,target,'Contact boundary'),inner=hoop(r*.83,gold,target,'Inner contact ring');inner.rotation.x=.18;
    const glow=halo(theme.edge,r*4,.19,target);glow.position.z=-.1;
    const type=layout.mission?.type;
    if(type==='sequence'){const relay=kit('PrismRelay',target,{width:r*.82,height:r*1.1,depth:r*.45}) || mesh(diamond,crystal,'Mirror prism',target);if(relay.isMesh)relay.scale.setScalar(r*.44);relay.position.y=-r*.5;numeral(t.order ?? index+1,target);}
    else if(type==='rescue'){const lock=mesh(own(new THREE.BoxGeometry(.24,.24,.13)),gold,'Jelly cage lock',target);lock.position.y=-.07;const shackle=hoop(.12,gold,target);shackle.position.y=.10;shackle.scale.y*=1.15;}
    else if(type==='timed'){for(let n=0;n<4;n++){const o=mesh(diamond,crystal,'Stabilizer terminal',target);o.scale.set(.06,.13,.06);o.position.set(Math.cos(n/4*TAU)*r,Math.sin(n/4*TAU)*r,0);}}
    else{const center=mesh(diamond,crystal,'Resonator heart',target);center.scale.set(.13,.25,.13);}
    targets.set(t.id,{group:target,outer,inner,glow,material:m,r,index,done:false});return target;
  }
  (layout.mission?.targets || []).forEach(makeTarget);
  if(layout.mission?.gate){
    const spec=layout.mission.gate;gate=add(new THREE.Group(),'Physical mission gate');gate.position.set(spec.x,spec.y,0);
    const frame=kit('GateFrame',gate,{width:spec.width+.5,height:spec.height,depth:.35});if(frame)frame.position.y=-spec.height*.5;
    const pane=mesh(own(new THREE.PlaneGeometry(spec.width,spec.height)),basic(theme.edge,{transparent:true,opacity:.26,side:THREE.DoubleSide,depthWrite:false}),'Closed gate barrier',gate);
    for(let i=0;i<5;i++){const beam=mesh(own(new THREE.CylinderGeometry(.015,.015,spec.height,5)),glowMaterial,'Gate energy bar',gate);beam.position.x=(i/4-.5)*spec.width;}
  }
  const exitSpec=layout.mission?.exit || {x:layout.islands.at(-1).x,y:layout.islands.at(-1).y+.7,radius:.8};
  exit=add(new THREE.Group(),'Realm exit');exit.position.set(exitSpec.x,exitSpec.y,-.18);
  const exitMaterial=physical(0x686180,{emissive:theme.edge,emissiveIntensity:.08,metalness:.6});
  const exitRing=hoop(exitSpec.radius || .8,exitMaterial,exit,'Exit boundary');const exitGlow=halo(theme.edge,3.7,.04,exit);exitGlow.position.z=-.1;
  let rescueJelly,cage,engine;
  if(layout.mission?.type==='rescue'){
    rescueJelly=jelly(exit,1.35);rescueJelly.group.position.set(0,1.4,-1.8);
    cage=add(new THREE.Group(),'Jellyfish energy cage',exit);
    for(let i=0;i<6;i++){const h=hoop(1.6,gold,cage,'Cage meridian');h.rotation.y=i/6*Math.PI;h.scale.y=1.6;h.position.set(0,.3,-1.8);}
    for(let n=0;n<2;n++){const h=hoop(1.6,gold,cage,'Cage chain');h.rotation.x=Math.PI/2;h.position.set(0,n*1.6-.4,-1.8);}
  }
  if(layout.mission?.type==='escort'){
    core=add(new THREE.Group(),'Carried astral core');const o=mesh(diamond,crystal,'Core prism',core);o.scale.setScalar(.30);hoop(.44,gold,core);coreGlow=halo(theme.edge,1.6,.35,core);
    const linkGeometry=own(new THREE.BufferGeometry());linkGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(9),3));coreLink=add(new THREE.Line(linkGeometry,basic(theme.edge,{transparent:true,opacity:.55})),'Core tether');
  }
  if(layout.mission?.type==='escort' || layout.mission?.type==='resonance'){
    engine=add(new THREE.Group(),'Sleeping dream engine');engine.position.set(exitSpec.x,exitSpec.y+.7,-1.4);kit('DreamEngine',engine,{width:3.5,height:4.5,depth:1.5});for(let i=0;i<3;i++){const h=hoop(1+i*.35,gold,engine,'Engine orbit');h.rotation.set(i*.6,i*.7,0);}
  }
  const energyLinks=[];
  const missionTargets=layout.mission?.targets || [],missionType=layout.mission?.type;
  const energyMaterial=mat(new THREE.LineBasicMaterial({color:theme.edge,transparent:true,opacity:.40,depthWrite:false,blending:THREE.AdditiveBlending}));
  for(let i=0;i<missionTargets.length;i++){
    if(!['sequence','timed','resonance'].includes(missionType))break;
    const from=missionTargets[i],to=missionType==='resonance'?exitSpec:missionTargets[i+1] || layout.mission.gate || exitSpec;
    const geometry=own(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array([from.x,from.y,-.24,to.x,to.y,-.24]),3));
    const line=add(new THREE.Line(geometry,energyMaterial),missionType==='resonance'?'Resonance engine charge beam':'Activated relay energy link');line.visible=false;energyLinks.push({line,index:i,to});
  }
  let engineCore=null,engineGlow=null;
  if(engine){const energy=physical(theme.edge,{emissive:theme.edge,emissiveIntensity:.05,roughness:.16,metalness:.15});engineCore=mesh(sphere,energy,'Engine charge core',engine);engineCore.scale.setScalar(.44);engineGlow=halo(theme.edge,3.6,.02,engine);engineGlow.position.z=.25;}
  function makeHazard(h){const g=add(new THREE.Group(),`${h.type} obstacle`),m=physical(0xc36a9c,{emissive:0xff4f9d,emissiveIntensity:.7,transparent:true,opacity:.75,roughness:.2});const r=h.radius || .5;const ring=hoop(r,m,g,'Obstacle contact boundary');const inner=hoop(r*.72,m,g);inner.rotation.x=.8;const glow=halo(0xff6099,r*3,.2,g);hazards.set(h.id,{group:g,material:m,ring,inner,glow,r});return hazards.get(h.id);}
  (layout.hazards || []).forEach(makeHazard);
  const currents=[];
  for(const c of layout.currents || []){const g=add(new THREE.Group(),'Visible guiding current');g.position.set(c.x,c.y,-.25);for(let j=0;j<3;j++){const h=hoop(Math.min(c.width,c.height)*.32,dimBasic,g);h.position.set(0,(j-1)*c.height*.24,0);h.scale.y=.38;}currents.push({group:g,source:c});}

  const trajectoryGeometry=own(new THREE.BufferGeometry());const trajectoryPositions=new Float32Array(180*3);trajectoryGeometry.setAttribute('position',new THREE.BufferAttribute(trajectoryPositions,3));trajectoryGeometry.setDrawRange(0,0);
  const trajectoryPoints=add(new THREE.Points(trajectoryGeometry,mat(new THREE.PointsMaterial({color:0xffe6a6,size:.065,sizeAttenuation:true,transparent:true,opacity:.9,depthWrite:false}))), 'Actual flight prediction');
  const landingMarker=hoop(.22,basic(0xffe7a3),group,'Predicted landing');landingMarker.rotation.x=Math.PI/2;landingMarker.visible=false;
  const burstCount=coarse?120:220,burstParticles=Array.from({length:burstCount},()=>({life:0,max:1,x:0,y:0,z:0,vx:0,vy:0,vz:0}));let burstCursor=0;
  const burstGeo=own(pointsGeometry(burstParticles.map(()=>({x:0,y:0,z:0})),random,[theme.edge,theme.accent,0xffdea0],true));burstGeo.attributes.life.array.fill(0);const burstMat=mat(particleMaterial({size:4.5,opacity:1}));add(new THREE.Points(burstGeo,burstMat),'Contact and victory particles');
  function burst({x=0,y=0,type='hit',status,id}){
    const target=id?targets.get(id):null;
    if(type==='target' && status && status!=='activated'){if(target)target.rejectUntil=timeUniform.value+.65;return;}
    if(type==='target' && target){if(timeUniform.value-(target.lastBurst ?? -10)<.05)return;target.lastBurst=timeUniform.value;}
    for(let i=0;i<(type==='complete'?60:24);i++){const p=burstParticles[burstCursor++%burstCount],a=random()*TAU,s=1+random()*3;p.x=x;p.y=y;p.z=.2;p.vx=Math.cos(a)*s;p.vy=Math.sin(a)*s+1;p.vz=(random()-.5)*2;p.life=p.max=.6+random()*.65;}}
  let lastComplete=false,disposed=false;
  function update({time=0,dt=1/60,state={},trajectory=[],cameraTarget}={}){
    if(disposed)return;timeUniform.value=time;fireflyMaterial.uniforms.time.value=time;burstMat.uniforms.time.value=time;
    const focus=cameraTarget || state.position || {x:0,y:2};sky.position.x=focus.x;sky.position.y=focus.y+10;
    key.position.set(focus.x-5,focus.y+9,8);key.target.position.set(focus.x+2,focus.y-1,-2);fill.position.set(focus.x+3,focus.y-1,3);
    for(const p of state.islands || []){const visual=platforms.get(p.id);if(visual)visual.position.set(p.x,p.y,0);}
    for(const a of platformAnimations){if(a.type==='jelly')a.organ.scale.set(.32,.19*(1+Math.sin(time*1.7)*.10),.32);else a.group.rotation.z=time*.12;}
    for(const j of backgroundJellies){j.group.position.set(j.origin.x+Math.sin(time*.065+j.phase)*1.5,j.origin.y+Math.sin(time*.17+j.phase)*.65,j.origin.z);const pulse=1+Math.sin(time*.9+j.phase)*.05;j.organ.scale.set(.32*pulse,.19*pulse,.32*pulse);}
    const mission=state.mission || {};
    for(const [i,t] of (mission.targets || layout.mission?.targets || []).entries()){
      const v=targets.get(t.id) || (makeTarget(t,i),targets.get(t.id));v.group.position.set(t.x,t.y,.18);
      const done=!!t.completed,active=!done&&(layout.mission?.type!=='sequence'||t.next);
      if(done&&!v.done)burst({x:t.x,y:t.y,type:'target',id:t.id,status:'activated'});v.done=done;
      v.material.color.setHex(done?0x7bdfb1:active?theme.edge:0x68627c);v.material.emissiveIntensity=done?.13:active?.65:.06;
      v.glow.material.opacity=done?.05:active?.17+Math.sin(time*2.8)*.045:.035;v.outer.rotation.z=time*(active?.24:.05);v.inner.rotation.y=Math.sin(time*.8+i)*.22;v.group.scale.setScalar(done?.78:1);
      const rejected=time<(v.rejectUntil || 0);v.outer.scale.setScalar(v.r*(rejected?1+Math.sin(time*22)*.055:1));
      if(rejected){v.material.color.setHex(0xffb45a);v.material.emissive.setHex(0xffa83f);v.material.emissiveIntensity=.8;v.glow.material.opacity=.19;}else v.material.emissive.setHex(theme.edge);
      if(layout.mission?.type==='rescue'){const lock=v.group.getObjectByName('Jelly cage lock');const shackle=v.group.children.find(o=>o.name==='Luminous hoop');if(lock){lock.rotation.z=done?.7:0;lock.position.x=done?.13:0;}if(shackle){shackle.rotation.z=done?-.9:0;shackle.position.x=done?-.13:0;}}
    }
    for(const link of energyLinks){const ts=mission.targets || [],from=ts[link.index];link.line.visible=!!from?.completed;if(from){const to=missionType==='resonance'?exitSpec:ts[link.index+1] || link.to;link.line.geometry.attributes.position.array.set([from.x,from.y,-.24,to.x,to.y,-.24]);link.line.geometry.attributes.position.needsUpdate=true;}}
    if(gate)gate.visible=!mission.gateOpen;
    const waiting=(mission.targets || []).find(t=>!t.completed);
    chargeRing.visible=layout.mission?.type==='timed' && mission.remainingTime!=null && !!waiting;
    if(chargeRing.visible){chargeRing.position.set(waiting.x,waiting.y,.2);chargeRing.scale.setScalar((waiting.radius || .6)*1.28);chargeRing.geometry.setDrawRange(0,Math.max(2,Math.floor(81*mission.remainingTime/(layout.mission.timeLimit || 30))));}
    const exitOpen=!!state.exit?.open;exitMaterial.emissiveIntensity=exitOpen?.85:.07;exitMaterial.color.setHex(exitOpen?theme.edge:0x625771);exitGlow.material.opacity=exitOpen?.26:.025;exitRing.rotation.z=time*.12;
    if(cage){cage.visible=!exitOpen;const broken=(mission.targets || []).filter(t=>t.completed).length;cage.children.forEach((bar,i)=>{bar.visible=i<6?i%3>=broken:i-5>=broken;});}if(rescueJelly&&exitOpen)rescueJelly.group.position.y=1.4+Math.sin(time*.5)*.25;
    if(core){const c=mission.core;core.visible=!!c;if(c){core.position.set(c.x,c.y,.35);core.rotation.y=time*.8;core.rotation.z=Math.sin(time)*.15;if(coreGlow)coreGlow.material.opacity=c.carried?.24:.40+Math.sin(time*3)*.10;
      if(coreLink){coreLink.visible=!!c.carried;if(c.carried){const from=state.position || c;coreLink.geometry.attributes.position.array.set([from.x,from.y,.25,(from.x+c.x)*.5,(from.y+c.y)*.5-.12,.3,c.x,c.y,.35]);coreLink.geometry.attributes.position.needsUpdate=true;}}}else if(coreLink)coreLink.visible=false;}
    if(engine){engine.rotation.y=Math.sin(time*.14)*.15;if(exitOpen)engine.rotation.z=time*.09;const charged=(mission.targets || []).filter(t=>t.completed).length/Math.max(1,missionTargets.length);if(engineCore)engineCore.material.emissiveIntensity=.08+charged*1.1;if(engineGlow)engineGlow.material.opacity=.025+charged*.24;}
    for(const h of state.hazards || []){const v=hazards.get(h.id) || makeHazard(h);v.group.position.set(h.x,h.y,.1);const active=!!h.active,warning=Number(h.warning || h.warn || 0);v.material.emissiveIntensity=active?1.2:warning?.45:.06;v.material.opacity=active?.85:warning?.55:.16;v.material.color.setHex(active?0xff579b:warning?0xffd190:0x759bbb);v.glow.material.opacity=active?.24:warning?.14:.025;v.ring.rotation.z=time*(active?1.5:.3);v.inner.rotation.y=time*.8;}
    for(const c of currents)c.group.rotation.z=(c.source.ax||0)>.1?-Math.PI/2:(c.source.ax||0)<-.1?Math.PI/2:0;
    let count=0;for(let i=0;i<trajectory.length&&count<180;i+=2){const p=trajectory[i];trajectoryPositions.set([p.x,p.y,.55],count++*3);}trajectoryGeometry.setDrawRange(0,count);trajectoryGeometry.attributes.position.needsUpdate=true;
    landingMarker.visible=false;if(trajectory.length){const end=trajectory.at(-1),actual=state.islands || layout.islands;const p=actual.find(p=>Math.abs(end.x-p.x)<=p.radius+(layout.xRadius || .42)&&Math.abs(end.y-p.y-(layout.halfHeight || .55))<.07);if(p){landingMarker.visible=true;landingMarker.position.set(end.x,p.y+.025,.05);}}
    if(state.completed&&!lastComplete)burst({x:state.position?.x || exitSpec.x,y:state.position?.y || exitSpec.y,type:'complete'});lastComplete=!!state.completed;
    for(let i=0;i<burstCount;i++){const p=burstParticles[i];if(p.life>0){p.life=Math.max(0,p.life-dt);p.vy-=dt*2.8;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;}burstGeo.attributes.position.array.set([p.x,p.y,p.z],i*3);burstGeo.attributes.life.array[i]=p.life/p.max;}burstGeo.attributes.position.needsUpdate=true;burstGeo.attributes.life.needsUpdate=true;
  }
  function dispose(){if(disposed)return;disposed=true;group.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.shadow)o.shadow.dispose();if(o.geometry&&!sharedGeometries.has(o.geometry))geometries.add(o.geometry);if(o.material)for(const m of [].concat(o.material))materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();group.removeFromParent();}
  group.userData.islandCount=platforms.size;group.userData.biome=layout.name;group.userData.assetKit=!!sourceKit;group.userData.missionType=layout.mission?.type;
  return {group,update,burst,dispose};
}
