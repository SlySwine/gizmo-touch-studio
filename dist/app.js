import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { createGizmoSound } from './sound.js';

const canvas=document.querySelector('#canvas'), stage=document.querySelector('.stage');
const loading=document.querySelector('#loading'), mood=document.querySelector('#mood');
const cursor=document.querySelector('#cursor');
const sound=createGizmoSound(),soundButton=document.querySelector('#sound-toggle');
function syncSoundButton(){const available=sound.state.available,on=sound.enabled&&available;soundButton.disabled=!available;soundButton.setAttribute('aria-pressed',String(on));soundButton.setAttribute('aria-label',!available?'Sound unavailable':on?'Mute sound':'Enable sound');soundButton.title=!available?'Sound unavailable in this browser':on?'Mute sound (M)':'Enable sound (M)';}
function unlockSound(e){if(e?.isTrusted)sound.unlock().then(syncSoundButton);}
function toggleSound(e){sound.setEnabled(!sound.enabled);if(sound.enabled)unlockSound(e);syncSoundButton();}
soundButton.addEventListener('click',toggleSound);syncSoundButton();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let calm=reduced.matches, tool='poke', active=null, loaded=false, time=0, lastTime=0;
let rig,body,base,fur,furGeo,furRoots,furNormals,furGroom,furSeeds,bodyGeometry;
let furCount=0, groomed=0, gestureCount=0, maxDeform=0, frame=0, idleReturn=0;
const attachments=[],eyes=[], nodes=[],pickable=[];
const HAT_OFFSET=new THREE.Vector3(-.32,-.16,0);
const MAX=6;
const orbit={yaw:0,pitch:0,vx:0,vy:0};
const wobble={value:new THREE.Vector3(),velocity:new THREE.Vector3()};
let pivot,pendingBrush=null,dirtyBody=false,physicsSteps=0;
const localCamera=new THREE.Vector3(), hairWind=new THREE.Vector3(),furNormalMatrix=new THREE.Matrix3();
const coarse=matchMedia('(pointer: coarse)').matches;
const nodeVelocities=[];

for(let i=0;i<MAX;i++)nodes.push({center:new THREE.Vector3(0,-100,0),value:new THREE.Vector3(),velocity:new THREE.Vector3(),target:new THREE.Vector3(),radius:0.72});
for(const n of nodes)nodeVelocities.push(n.velocity);
let nextNode=0, response=0, responseTarget=0, brushJoy=0;
const expression={surprise:0,annoyance:0,blink:0,pleased:0,label:'sleepy'};
const reaction={at:-100,lastPoke:-100,pokes:0,kind:'idle',gaze:new THREE.Vector2()};
const eyeFeel=new THREE.Vector4();
function react(kind,point){
  reaction.at=time;reaction.kind=kind;
  if(kind==='poke'){reaction.pokes=time-reaction.lastPoke<4?reaction.pokes+1:1;reaction.lastPoke=time;brushJoy=0;}
  if(kind==='pull')brushJoy=0;
  if(kind==='brush'){reaction.pokes=0;brushJoy=1;}
  reaction.gaze.set(THREE.MathUtils.clamp(point.x/1.7,-1,1),THREE.MathUtils.clamp((point.y-2.3)/1.5,-1,1));
}

const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
const hitPlane=new THREE.Plane(), temp=new THREE.Vector3(), temp2=new THREE.Vector3();
const uCenter=nodes.map(n=>n.center), uDisplace=nodes.map(n=>n.value), uRadius=new Float32Array(MAX).fill(.72);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(34,1,.1,60);
camera.position.set(0,2.3,10.4);camera.lookAt(0,2.06,0);
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});}
catch(e){fail('Gizmo needs WebGL to play. Try a browser with hardware acceleration enabled.');throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,coarse?1.5:2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
scene.add(new THREE.HemisphereLight(0xf7d5ec,0x35213f,.75));
const key=new THREE.DirectionalLight(0xffd5e4,1.2);key.position.set(-4,6,6);scene.add(key);
const blueBack=new THREE.PointLight(0x155aff,38,14,2);blueBack.position.set(-2.4,1.8,-2.2);scene.add(blueBack);
const violetBack=new THREE.PointLight(0x7007bf,38,14,2);violetBack.position.set(2.4,1.8,-2.2);scene.add(violetBack);
const fill=new THREE.DirectionalLight(0xff83bc,.25);fill.position.set(-4,1,0);scene.add(fill);
const hairLight=new THREE.SpotLight(0xcbd5ff,45,14,.62,.6,2);
hairLight.position.set(.4,6.2,-2);hairLight.target.position.set(0,2.2,0);scene.add(hairLight,hairLight.target);
const hairLightDirection=new THREE.Vector3().subVectors(hairLight.target.position,hairLight.position).normalize();

// Soft contact shadow; the character and all visible fibers are live geometry.
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
const sc=shadowCanvas.getContext('2d');const sg=sc.createRadialGradient(64,64,3,64,64,64);
sg.addColorStop(0,'rgba(0,0,0,.65)');sg.addColorStop(.5,'rgba(0,0,0,.34)');sg.addColorStop(1,'rgba(0,0,0,0)');sc.fillStyle=sg;sc.fillRect(0,0,128,128);
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(6.9,4.8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(0,-.005,0);scene.add(shadow);
const floor=new THREE.Mesh(new THREE.CircleGeometry(2.9,96),new THREE.MeshBasicMaterial({color:0x503169,transparent:true,opacity:.16,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.01;scene.add(floor);

function fail(text){loading.classList.remove('hidden');loading.innerHTML='';const p=document.createElement('p');p.className='error';p.textContent=text;loading.append(p);}
function setMood(text){if(mood.textContent!==text)mood.textContent=text;}
function resize(){const r=stage.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.position.z=Math.max(9.8,9.2/camera.aspect);camera.lookAt(0,2.06,0);camera.updateProjectionMatrix();endGesture();}
new ResizeObserver(resize).observe(stage);

const noiseCanvas=document.createElement('canvas');noiseCanvas.width=128;noiseCanvas.height=128;
const nc=noiseCanvas.getContext('2d'),nd=nc.createImageData(128,128);
let randomSeed=271828;function rand(){randomSeed=(Math.imul(1664525,randomSeed)+1013904223)>>>0;return randomSeed/4294967296;}
for(let i=0;i<nd.data.length;i+=4){const v=110+rand()*140;nd.data.set([v,v,v,255],i);}nc.putImageData(nd,0,0);
const noiseTexture=new THREE.CanvasTexture(noiseCanvas);noiseTexture.wrapS=noiseTexture.wrapT=THREE.RepeatWrapping;noiseTexture.repeat.set(14,14);

function field(x,y,z,out){out.set(0,0,0);for(const n of nodes){const dx=x-n.center.x,dy=y-n.center.y,dz=z-n.center.z;const w=Math.exp(-(dx*dx+dy*dy+dz*dz)/(2*n.radius*n.radius));out.addScaledVector(n.value,w);}return out;}

new GLTFLoader().load('./assets/gizmo.glb',gltf=>{
  rig=gltf.scene;pivot=new THREE.Group();pivot.position.y=1.8;pivot.rotation.order='YXZ';scene.add(pivot);pivot.add(rig);rig.position.y=-1.8;rig.name='Gizmo';
  rig.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;
    if(o.name==='Body'){body=o;bodyGeometry=o.geometry;base=new Float32Array(o.geometry.attributes.position.array);o.material=new THREE.MeshStandardMaterial({color:0xe82c85,roughness:1,bumpMap:noiseTexture,bumpScale:.035});}
    else if(o.name.startsWith('Hat')){o.position.add(HAT_OFFSET);o.material=new THREE.MeshStandardMaterial({color:o.name==='HatBand'?0x171322:0x10101b,roughness:o.name==='HatBand'?.63:.94,bumpMap:noiseTexture,bumpScale:.025});attachments.push({mesh:o,anchor:new THREE.Vector3(-1,3.37,0).add(HAT_OFFSET),original:o.position.clone()});}
    else if(o.name.startsWith('Eye')){o.material=new THREE.MeshStandardMaterial({color:0x05030a,roughness:1});o.geometry.computeBoundingBox();const center=o.geometry.boundingBox.getCenter(new THREE.Vector3());o.material.onBeforeCompile=shader=>{shader.uniforms.eyeFeel={value:eyeFeel};shader.uniforms.eyeCenter={value:center};shader.uniforms.eyePupil={value:o.name.includes('Pupil')?1:0};shader.uniforms.centers={value:uCenter};shader.uniforms.displacements={value:uDisplace};shader.uniforms.radii={value:uRadius};shader.vertexShader='uniform vec4 eyeFeel;uniform vec3 eyeCenter;uniform float eyePupil;uniform vec3 centers[6];uniform vec3 displacements[6];uniform float radii[6];\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <skinning_vertex>','#include <skinning_vertex>\nif(eyePupil>0.5){transformed.x=eyeCenter.x+(transformed.x-eyeCenter.x)*(1.0+eyeFeel.x*.55)+eyeFeel.z*.085;transformed.y=eyeCenter.y+(transformed.y-eyeCenter.y)*(1.0+eyeFeel.x*.38)+eyeFeel.w*.055;}else{transformed.y+=eyeFeel.x*.17;}vec3 originalEye=transformed;for(int i=0;i<6;i++){vec3 d=originalEye-centers[i];transformed+=displacements[i]*exp(-dot(d,d)/(2.0*radii[i]*radii[i]));}');};o.material.customProgramCacheKey=()=> 'gizmo-expressive-eyes';eyes.push(o);}
  });
  if(!body)throw new Error('Body missing from character asset');
  pickable.push(body,...attachments.map(a=>a.mesh));makeFur();loaded=true;loading.classList.add('hidden');resize();
},undefined,error=>{console.error(error);fail('Gizmo could not load. Please refresh to try again.');});

function makeFur(){
  furCount=coarse?85000:145000;
  const g=body.geometry,positions=g.attributes.position,normals=g.attributes.normal,idx=g.index;
  const faces=idx?idx.count/3:positions.count/3,cumulative=new Float32Array(faces);let sum=0;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
  for(let f=0;f<faces;f++){a.fromBufferAttribute(positions,idx?idx.getX(f*3):f*3);b.fromBufferAttribute(positions,idx?idx.getX(f*3+1):f*3+1);c.fromBufferAttribute(positions,idx?idx.getX(f*3+2):f*3+2);sum+=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()*.5;cumulative[f]=sum;}
  furRoots=new Float32Array(furCount*3);furNormals=new Float32Array(furCount*3);furGroom=new Float32Array(furCount*3);furSeeds=new Float32Array(furCount);
  const na=new THREE.Vector3(),nb=new THREE.Vector3(),nn=new THREE.Vector3();
  for(let s=0;s<furCount;s++){
    const target=rand()*sum;let lo=0,hi=faces-1;while(lo<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<target)lo=mid+1;else hi=mid;}const f=lo;
    const ia=idx?idx.getX(f*3):f*3,ib=idx?idx.getX(f*3+1):f*3+1,ic=idx?idx.getX(f*3+2):f*3+2;
    const sq=Math.sqrt(rand()),u=1-sq,v=rand()*sq,w=1-u-v;
    a.fromBufferAttribute(positions,ia);b.fromBufferAttribute(positions,ib);c.fromBufferAttribute(positions,ic);a.multiplyScalar(u).addScaledVector(b,v).addScaledVector(c,w).toArray(furRoots,s*3);
    na.fromBufferAttribute(normals,ia);nb.fromBufferAttribute(normals,ib);nn.fromBufferAttribute(normals,ic);na.multiplyScalar(u).addScaledVector(nb,v).addScaledVector(nn,w).normalize().toArray(furNormals,s*3);furSeeds[s]=rand();
  }
  furGeo=new THREE.InstancedBufferGeometry();
  const blade=[];for(let j=0;j<2;j++){const t=j/2,t1=(j+1)/2;blade.push(-1,t,0,1,t,0,-1,t1,0,1,t,0,1,t1,0,-1,t1,0);}
  furGeo.setAttribute('position',new THREE.Float32BufferAttribute(blade,3));
  furGeo.setAttribute('root',new THREE.InstancedBufferAttribute(furRoots,3));furGeo.setAttribute('hairNormal',new THREE.InstancedBufferAttribute(furNormals,3));
  furGeo.setAttribute('groom',new THREE.InstancedBufferAttribute(furGroom,3).setUsage(THREE.DynamicDrawUsage));furGeo.setAttribute('seed',new THREE.InstancedBufferAttribute(furSeeds,1));furGeo.instanceCount=furCount;
  const mat=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{centers:{value:uCenter},displacements:{value:uDisplace},velocities:{value:nodeVelocities},radii:{value:uRadius},localCamera:{value:localCamera},hairWind:{value:hairWind},eyeFeel:{value:eyeFeel},hatOffset:{value:HAT_OFFSET},furNormalMatrix:{value:furNormalMatrix},blueBackPosition:{value:blueBack.position},violetBackPosition:{value:violetBack.position},hairLightPosition:{value:hairLight.position},hairLightDirection:{value:hairLightDirection},hairLightColor:{value:hairLight.color},hairCone:{value:new THREE.Vector2(Math.cos(hairLight.angle),Math.cos(hairLight.angle*(1-hairLight.penumbra)))}},vertexShader:`
    attribute vec3 root;attribute vec3 hairNormal;attribute vec3 groom;attribute float seed;
    uniform vec3 centers[6];uniform vec3 displacements[6];uniform vec3 velocities[6];uniform float radii[6];uniform vec3 localCamera;uniform vec3 hairWind;uniform vec4 eyeFeel;uniform vec3 hatOffset;
    uniform mat3 furNormalMatrix;uniform vec3 blueBackPosition;uniform vec3 violetBackPosition;
    uniform vec3 hairLightPosition;uniform vec3 hairLightDirection;uniform vec3 hairLightColor;uniform vec2 hairCone;
    varying vec3 vColor;varying float vT;
    vec3 displace(vec3 p){vec3 result=p;for(int i=0;i<6;i++){vec3 d=p-centers[i];result+=displacements[i]*exp(-dot(d,d)/(2.0*radii[i]*radii[i]));}return result;}
    float backlight(vec3 lightPosition,vec3 worldP,vec3 N,vec3 V,float edge){
      vec3 D=lightPosition-worldP;vec3 L=normalize(D);
      float transmission=pow(max(dot(-L,V),0.0),4.0);
      float wrap=max((dot(N,L)+.35)/1.35,0.0);
      return edge*(.8*transmission+.35*wrap)/(1.0+.06*dot(D,D));
    }
    void main(){
      float t=position.y;vT=t;vec3 n=hairNormal;
      vec3 tangent=normalize(cross(n,abs(n.y)<.9?vec3(0,1,0):vec3(1,0,0)));
      vec3 bitangent=cross(n,tangent);
      float angle=seed*62.83;vec3 curl=(tangent*cos(angle)+bitangent*sin(angle))*(.030+seed*.064);
      float dx=abs(abs(root.x-eyeFeel.z*.085)-.736);
      float browY=2.465+eyeFeel.x*.30+(root.x<0.0?.075:-.020)*eyeFeel.y;
      float lid=length(vec2(max(abs(abs(root.x)-.736)-mix(.402,.18,eyeFeel.x),0.0),root.y-browY))-mix(.145,.17,eyeFeel.x);
      float pupil=(length(vec2(dx/(.165*(1.0+eyeFeel.x*.77)),(root.y-2.265-eyeFeel.w*.055)/(.245*(1.0+eyeFeel.x*.85))))-1.0)*.165;
      float trim=root.z>1.0?mix(.02,1.0,smoothstep(-.015,.115,min(lid,pupil)-.03)):1.0;
      float underHat=(1.0-smoothstep(.84,1.12,length(vec2((root.x-hatOffset.x+.995)/1.35,(root.z-hatOffset.z-.04)/1.03))))*smoothstep(2.72+hatOffset.y,2.98+hatOffset.y,root.y);
      trim*=mix(1.0,.05,underHat);
      curl*=trim;float len=mix(.09+seed*.105,.24+(seed-.75)*.30,step(.75,seed))*trim;float laid=clamp(length(groom)*3.5,0.0,.72);
      vec3 inertia=hairWind;
      for(int i=0;i<6;i++){vec3 d=root-centers[i];inertia-=velocities[i]*.013*exp(-dot(d,d)/(2.0*radii[i]*radii[i]));}
      inertia-=n*dot(n,inertia);inertia=clamp(inertia,vec3(-.13),vec3(.13));
      vec3 gravity=vec3(0,-1,0)+n*n.y;
      vec3 p=root+n*(.008+len*t*(1.0-laid))+(curl+gravity*len*.35)*t*t+(groom+inertia)*t*t*trim;
      vec3 viewDir=normalize(localCamera-root);
      vec3 side=normalize(cross(n+groom*7.0,viewDir)+vec3(.0001));
      p+=side*position.x*(.0043+seed*.0018)*(1.0-t*.96);
      vec3 displacedP=displace(p);vec3 worldP=(modelMatrix*vec4(displacedP,1.0)).xyz;
      vec3 litNormal=normalize(furNormalMatrix*n);float light=max(dot(litNormal,normalize(vec3(-.5,.8,1.0))),0.0);
      vec3 pink=mix(vec3(.36,.005,.09),vec3(.98,.10,.40),.38+light*.62);
      vColor=pink*(.67+seed*.37)*(.66+t*.46)*.38;
      vec3 V=normalize(cameraPosition-worldP);float edge=pow(max(0.0,1.0-abs(dot(litNormal,V))),3.0);
      float tips=mix(.18,1.0,smoothstep(.05,.85,t))*(.8+seed*.3);
      float blueRim=backlight(blueBackPosition,worldP,litNormal,V,edge)*tips;
      float violetRim=backlight(violetBackPosition,worldP,litNormal,V,edge)*tips;
      float rimSum=blueRim+violetRim;
      vec3 rimColor=vec3(.004,.055,1.0)*blueRim+vec3(.16,.002,.52)*violetRim;
      // Saturated blue/violet transmission catches the tips above the dimmer front light.
      vColor=mix(vColor,rimColor/max(rimSum,.001),clamp(rimSum*4.5,0.0,.96))+rimColor*.65;
      // A separate overhead/back light follows the actual bent and groomed fiber direction.
      vec3 fiberT=n*len*(1.0-laid)+2.0*t*(curl+gravity*len*.35+(groom+inertia)*trim);
      vec3 T=normalize(mat3(modelMatrix)*fiberT);
      vec3 hairD=hairLightPosition-worldP;vec3 hairL=normalize(hairD);vec3 H=normalize(hairL+V);
      float strandHighlight=pow(max(0.0,1.0-dot(T,H)*dot(T,H)),12.0);
      float spotCone=smoothstep(hairCone.x,hairCone.y,dot(-hairL,hairLightDirection));
      float facing=smoothstep(-.10,.65,dot(litNormal,hairL));
      float tipLight=smoothstep(.20,.95,t)*facing*(1.0-underHat*.92);
      float hairCatch=tipLight*(.20+.80*strandHighlight)*spotCone/(1.0+.05*dot(hairD,hairD));
      vColor+=hairLightColor*hairCatch*2.2;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(displacedP,1.0);
    }`,fragmentShader:`varying vec3 vColor;varying float vT;void main(){gl_FragColor=vec4(vColor,1.0);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
  fur=new THREE.Mesh(furGeo,mat);fur.frustumCulled=false;rig.add(fur);
}

const toolNames=['poke','pull','brush','turn'];
function setTool(value){if(!toolNames.includes(value))throw new Error('Choose poke, pull, brush, or turn.');endGesture();sound.stop();tool=value;document.querySelectorAll('[data-tool]').forEach(b=>{const on=b.dataset.tool===tool;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});cursor.className=tool;stage.classList.toggle('turn',tool==='turn');setMood(tool==='brush'?'A little grooming goes a long way.':tool==='turn'?'Every side is my good side.':'Perfectly unbothered.');idleReturn=time+4;}

document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
function reset(){endGesture();sound.stop();orbit.yaw=orbit.pitch=orbit.vx=orbit.vy=0;wobble.value.set(0,0,0);wobble.velocity.set(0,0,0);hairWind.set(0,0,0);pendingBrush=null;dirtyBody=true;for(const n of nodes){n.value.set(0,0,0);n.velocity.set(0,0,0);n.target.set(0,0,0);n.center.set(0,-100,0);}if(furGroom){furGroom.fill(0);furGeo.attributes.groom.needsUpdate=true;}groomed=0;response=0;responseTarget=0;brushJoy=0;reaction.at=reaction.lastPoke=-100;reaction.pokes=0;reaction.kind='idle';reaction.gaze.set(0,0);expression.surprise=expression.annoyance=expression.blink=expression.pleased=0;expression.label='sleepy';eyeFeel.set(0,0,0,0);maxDeform=0;if(rig){rig.position.set(0,-1.8,0);rig.rotation.set(0,0,0);rig.scale.set(1,1,1);pivot.rotation.set(0,0,0);}setMood('Fresh fluff. Fresh start.');idleReturn=time+3;}
document.querySelector('#reset').addEventListener('click',e=>{unlockSound(e);reset();if(e.isTrusted)sound.reset();});

function ray(e){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);cursor.style.left=(e.clientX-r.left)+'px';cursor.style.top=(e.clientY-r.top)+'px';}
function pick(e){if(!loaded)return null;ray(e);scene.updateMatrixWorld(true);return raycaster.intersectObjects(pickable,false)[0]||null;}
function hover(e){const hit=pick(e),hat=!!hit&&hit.object!==body;stage.classList.toggle('hat-hover',hat&&e.pointerType!=='touch');cursor.style.opacity=hit&&!hat&&e.pointerType!=='touch'&&tool!=='turn'?'1':'0';}
function contact(e,hit=pick(e)){if(!hit||hit.object!==body)return null;const local=body.worldToLocal(hit.point.clone());const face=hit.face;const p=body.geometry.attributes.position;
  const a=new THREE.Vector3().fromBufferAttribute(p,face.a),b=new THREE.Vector3().fromBufferAttribute(p,face.b),c=new THREE.Vector3().fromBufferAttribute(p,face.c);
  const bc=new THREE.Vector3();THREE.Triangle.getBarycoord(local,a,b,c,bc);const rest=new THREE.Vector3();for(const [vi,w] of [[face.a,bc.x],[face.b,bc.y],[face.c,bc.z]])rest.addScaledVector(new THREE.Vector3().fromArray(base,vi*3),w);
  return {point:rest,world:hit.point,normal:hit.face.normal.clone()};}
function newNode(point,radius){let index=nextNode++%MAX;const n=nodes[index];n.center.copy(point);n.radius=radius;uRadius[index]=radius;n.value.set(0,0,0);n.velocity.set(0,0,0);n.target.set(0,0,0);return n;}
function startGesture(e){
  if(active||!loaded||e.button!==0)return;
  const picked=pick(e),turning=tool==='turn'||(picked&&picked.object!==body);
  if(!turning&&!picked)return;
  const hit=turning?null:contact(e,picked);
  e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);gestureCount++;orbit.vx=orbit.vy=0;
  unlockSound(e);
  if(turning){active={id:e.pointerId,tool:'turn',x:e.clientX,y:e.clientY,eventTime:e.timeStamp,soundSpeed:0,soundPan:pointer.x};sound.begin('turn',{pan:pointer.x});stage.classList.add('turn','contact');setMood('Every side is my good side.');return;}
  const n=tool==='brush'?null:newNode(hit.point,tool==='pull'?1.03:.86);
  hitPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),hit.world);
  active={id:e.pointerId,node:n,start:hit.world.clone(),last:hit.point.clone(),tool,point:hit.point.clone(),startTime:time,eventTime:e.timeStamp,dragVelocity:new THREE.Vector3(),soundSpeed:0,soundPan:pointer.x};stage.classList.add('contact');cursor.style.opacity='1';
  if(tool==='poke')sound.poke({strength:.6+Math.min(reaction.pokes,4)*.07,pan:pointer.x});else sound.begin(tool,{pan:pointer.x});
  if(tool==='poke'){react('poke',hit.point);n.target.copy(hit.normal).multiplyScalar(-.78);n.velocity.copy(hit.normal).multiplyScalar(-5.2);wobble.velocity.set(hit.normal.z*.7,0,-hit.point.x*.35);responseTarget=.96;setMood(reaction.pokes>=4?'Personal space. Ever heard of it?':reaction.pokes>=2?'You again.': 'Hey! I was napping.');}
  if(tool==='pull'){react('pull',hit.point);responseTarget=.75;setMood('A little stretch…');}
  if(tool==='brush'){react('brush',hit.point);brushJoy=1;setMood('That’s the spot.');}
}
function moveGesture(e){
  if(!loaded)return;ray(e);
  if(!active){hover(e);return;}
  if(e.pointerId!==active.id)return;e.preventDefault();
  active.soundPan=pointer.x;
  if(active.tool!=='poke'&&sound.state.activeKind!==active.tool)sound.begin(active.tool,{pan:pointer.x});
  if(active.tool==='turn'){
    const dx=e.clientX-active.x,dy=e.clientY-active.y,dt=Math.max(.008,(e.timeStamp-active.eventTime)/1000);
    orbit.yaw+=dx*.009;orbit.pitch=THREE.MathUtils.clamp(orbit.pitch+dy*.006,-.6,.6);
    orbit.vx=THREE.MathUtils.clamp(dx*.009/dt,-6,6);orbit.vy=THREE.MathUtils.clamp(dy*.006/dt,-2,2);
    active.soundSpeed=Math.min(1,Math.hypot(dx,dy)/(dt*1400));
    active.x=e.clientX;active.y=e.clientY;active.eventTime=e.timeStamp;return;
  }
  if(active.tool==='pull'){
    const p=raycaster.ray.intersectPlane(hitPlane,temp);
    if(p){const localNow=body.worldToLocal(p.clone()),localStart=body.worldToLocal(active.start.clone());const target=localNow.sub(localStart).clampLength(0,2.65);const dt=Math.max(.008,(e.timeStamp-active.eventTime)/1000);
      active.dragVelocity.copy(target).sub(active.node.target).divideScalar(dt).clampLength(0,10);active.eventTime=e.timeStamp;active.node.target.copy(target);
      active.soundSpeed=Math.min(1,active.dragVelocity.length()/6);
      active.node.radius=1.03+target.length()*.36;uRadius[nodes.indexOf(active.node)]=active.node.radius;
      responseTarget=Math.min(1,target.length()*.55+.3);setMood(target.length()>1.8?'I am not a slingshot.':target.length()>1.1?'Okay, that’s quite a stretch.':'A little stretch…');
    }
  }
  if(active.tool==='brush'){
    const hit=contact(e),dt=Math.max(.008,(e.timeStamp-active.eventTime)/1000);active.eventTime=e.timeStamp;
    if(hit){if(active.last){const delta=hit.point.clone().sub(active.last).clampLength(0,.32);if(delta.length()>.001){active.soundSpeed=Math.min(1,delta.length()/(dt*3.2));pendingBrush={point:hit.point,delta:pendingBrush?pendingBrush.delta.add(delta).clampLength(0,.45):delta};brushJoy=1;}}active.last=hit.point.clone();}else{active.last=null;pendingBrush=null;active.soundSpeed=0;}
  }
}

function groom(point,delta){let affected=0;const len=delta.length();if(len<.0001)return;const dir=delta.clone().normalize();const radius=.62;for(let i=0;i<furCount;i++){const j=i*3;const x=furRoots[j]-point.x,y=furRoots[j+1]-point.y,z=furRoots[j+2]-point.z,d=x*x+y*y+z*z;if(d>radius*radius)continue;const nDot=dir.x*furNormals[j]+dir.y*furNormals[j+1]+dir.z*furNormals[j+2];const w=(1-Math.sqrt(d)/radius)*Math.min(1,len*18);for(let k=0;k<3;k++){const target=(dir.getComponent(k)-nDot*furNormals[j+k])*.24;furGroom[j+k]+=(target-furGroom[j+k])*w;}affected++;}groomed+=affected;furGeo.attributes.groom.needsUpdate=true;}
function endGesture(e){
  if(e&&active&&e.pointerId!==undefined&&e.pointerId!==active.id)return;
  if(active){const gesture=active,id=gesture.id;active=null;
    if(e?.type==='pointerup'){
      const firstTouch=sound.state.contextState==='uninitialized';unlockSound(e);
      if(firstTouch&&gesture.tool==='poke')sound.poke({strength:.65,pan:gesture.soundPan});
      if(firstTouch&&gesture.tool==='pull'){sound.begin('pull',{pan:gesture.soundPan});sound.update({tension:gesture.node.value.length()/2.65,speed:0,pan:gesture.soundPan});}
    }
    if(e?.type==='pointerup')sound.end({release:true,tension:gesture.node?gesture.node.value.length()/2.65:0});else sound.stop();
    if(gesture.node){gesture.node.target.set(0,0,0);if(gesture.tool==='pull'&&e?.type==='pointerup'&&time-gesture.startTime>.05){if(e.timeStamp-gesture.eventTime<120)gesture.node.velocity.addScaledVector(gesture.dragVelocity,.45).clampLength(0,12);wobble.velocity.z+=THREE.MathUtils.clamp(-gesture.node.value.x*.6,-1.3,1.3);wobble.velocity.x+=gesture.node.value.z*.4;}}
    if(pendingBrush&&gesture.tool==='brush'){groom(pendingBrush.point,pendingBrush.delta);pendingBrush=null;}
    if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);responseTarget=0;idleReturn=time+3.5;
    setMood(gesture.tool==='turn'?'Admire away.':gesture.tool==='brush'?'Impeccably groomed. Mostly.':gesture.tool==='poke'?(reaction.pokes>=3?'I’m counting those.':'You startled me.'):'Back to his usual self.');
  }
  orbit.vx=orbit.vy=0;stage.classList.remove('contact');stage.classList.toggle('turn',tool==='turn');
  if(e?.type==='pointerup')hover(e);else if(!e||e.type==='pointercancel'){stage.classList.remove('hat-hover');cursor.style.opacity='0';}
}

canvas.addEventListener('pointerdown',startGesture);canvas.addEventListener('pointermove',moveGesture);canvas.addEventListener('pointerup',endGesture);canvas.addEventListener('pointercancel',endGesture);canvas.addEventListener('lostpointercapture',endGesture);canvas.addEventListener('pointerleave',()=>{stage.classList.remove('hat-hover');if(!active)cursor.style.opacity='0';});window.addEventListener('blur',()=>endGesture());document.addEventListener('visibilitychange',()=>{if(document.hidden)endGesture();});canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.key.toLowerCase()==='m'&&!e.repeat){e.preventDefault();toggleSound(e);return;}
  const values={'1':'poke','2':'pull','3':'brush','4':'turn'};
  if(values[e.key])setTool(values[e.key]);
  if(e.key.toLowerCase()==='r'&&!e.repeat){unlockSound(e);reset();if(e.isTrusted)sound.reset();}
  if(document.activeElement!==canvas||!loaded)return;
  if(e.key===' '){
    e.preventDefault();unlockSound(e);sound.poke({strength:.7});
    react('poke',new THREE.Vector3(0,1.6,1.25));setMood(reaction.pokes>=3?'I’m counting those.':'Hey! I was napping.');
    const n=newNode(new THREE.Vector3(0,1.6,1.25),.75);n.velocity.z=-7.5;responseTarget=.6;setTimeout(()=>responseTarget=0,220);gestureCount++;
  }
  if(e.key.startsWith('Arrow')){
    e.preventDefault();unlockSound(e);
    const d=new THREE.Vector3(e.key==='ArrowLeft'?-.5:e.key==='ArrowRight'?.5:0,e.key==='ArrowUp'?.5:e.key==='ArrowDown'?-.5:0,0);
    if(!active){if(tool==='poke')sound.poke({strength:.6});else{if(sound.state.activeKind!==tool)sound.begin(tool);sound.update({tension:.35,speed:.6,pan:0});}}
    if(tool==='turn'){orbit.yaw+=d.x*.65;orbit.pitch=THREE.MathUtils.clamp(orbit.pitch+d.y*.35,-.6,.6);}
    else if(tool==='brush'){react('brush',new THREE.Vector3(0,1.6,1.3));groom(new THREE.Vector3(0,1.6,1.3),d);brushJoy=1;}
    else{react(tool,new THREE.Vector3(0,1.6,1.2));const n=newNode(new THREE.Vector3(0,1.6,1.2),.8);n.velocity.copy(d).multiplyScalar(9);gestureCount++;}
  }
});
window.addEventListener('keyup',e=>{if(e.key.startsWith('Arrow')&&!active)sound.end({release:true,tension:.35});});
window.addEventListener('pagehide',e=>{if(e.persisted)sound.stop();else sound.dispose();});

function tick(now){requestAnimationFrame(tick);const dt=Math.min((now-lastTime)/1000||.016,.05);lastTime=now;time+=dt;frame++;
  if(loaded){let moving=false,max=0;
    // Substeps keep the damped spring stable through slow frames and long grabs.
    const steps=Math.max(3,Math.ceil(dt/.008)),h=dt/steps;physicsSteps+=steps;for(const n of nodes){for(let s=0;s<steps;s++){const held=active?.node===n;const k=held?165:84,damping=held?16:5.3;n.velocity.addScaledVector(temp.copy(n.target).sub(n.value),k*h).multiplyScalar(Math.exp(-damping*h));n.value.addScaledVector(n.velocity,h).clampLength(0,3.1);n.velocity.clampLength(0,18);}if(n.value.lengthSq()+n.velocity.lengthSq()>.000001)moving=true;max=Math.max(max,n.value.length());}maxDeform=max;
    if(moving||dirtyBody||frame%20===0){const arr=bodyGeometry.attributes.position.array;for(let i=0;i<base.length;i+=3){field(base[i],base[i+1],base[i+2],temp);arr[i]=base[i]+temp.x;arr[i+1]=base[i+1]+temp.y;arr[i+2]=base[i+2]+temp.z;}bodyGeometry.attributes.position.needsUpdate=true;if(frame%3===0)bodyGeometry.computeVertexNormals();bodyGeometry.computeBoundingSphere();dirtyBody=false;}
    for(const a of attachments){field(a.anchor.x,a.anchor.y,a.anchor.z,temp);a.mesh.position.copy(a.original).add(temp);}
    const age=time-reaction.at,heldPoke=active?.tool==='poke',heldPull=active?.tool==='pull';
    brushJoy=Math.max(0,brushJoy-dt*.20);
    const startled=(reaction.kind==='poke'||reaction.kind==='pull')?Math.exp(-Math.max(0,age-.25)*2.1):0;
    const flinch=reaction.kind==='poke'?Math.max(0,1-Math.abs(age-.055)/.065):0;
    const annoyance=reaction.kind==='poke'?THREE.MathUtils.smoothstep(age,.22,.9)*Math.min(1,.24+Math.max(0,reaction.pokes-1)*.27+(heldPoke&&age>1?.35:0))*Math.exp(-Math.max(0,age-2.7)*1.1):0;
    const targetSurprise=Math.max(responseTarget,startled)*(1-annoyance*.72)*(1-flinch*.85);
    expression.surprise+=(targetSurprise-expression.surprise)*Math.min(1,dt*15);
    expression.annoyance+=(annoyance-expression.annoyance)*Math.min(1,dt*8);
    expression.pleased+=(brushJoy-expression.pleased)*Math.min(1,dt*7);
    const idleBlink=!active&&Math.sin(time*.79)>.998?Math.pow((Math.sin(time*.79)-.998)/.002,1.4):0;
    expression.blink=Math.max(flinch,idleBlink*(1-expression.surprise));
    expression.label=expression.blink>.45?'flinch':expression.surprise>.6?(heldPull?'alarmed':'startled'):expression.pleased>.4?'pleased':expression.annoyance>.32?'annoyed':'sleepy';
    response=expression.surprise;
    eyeFeel.set(expression.surprise,expression.annoyance,reaction.gaze.x*Math.min(1,expression.surprise+expression.annoyance),reaction.gaze.y*expression.surprise);
    for(const eye of eyes){const dict=eye.morphTargetDictionary,values=eye.morphTargetInfluences;if(!dict||!values)continue;values[dict.Surprised]=expression.surprise;values[dict.Smug]=expression.pleased*.95*(1-expression.surprise);values[dict.Blink]=expression.blink;values[dict.Skeptical]=expression.annoyance*(1-expression.surprise*.6);}
    if(pendingBrush){groom(pendingBrush.point,pendingBrush.delta);pendingBrush=null;}
    for(let s=0;s<steps;s++){wobble.velocity.addScaledVector(wobble.value,-65*h).multiplyScalar(Math.exp(-5.8*h));wobble.value.addScaledVector(wobble.velocity,h).clampLength(0,.2);}
    // Orientation changes only during an explicit Turn/hat drag or Turn keyboard action.
    pivot.rotation.set(orbit.pitch,orbit.yaw,0);
    let tension=0;for(const n of nodes)tension+=n.value.length();
    rig.scale.set(1+Math.min(tension,.9)*.025,1-Math.min(tension,.9)*.045+(calm?0:Math.sin(time*1.8)*.004),1+Math.min(tension,.9)*.015);
    rig.updateWorldMatrix(true,true);localCamera.copy(camera.position);rig.worldToLocal(localCamera);furNormalMatrix.getNormalMatrix(fur.matrixWorld);
    hairWind.set(-orbit.vx*.012,orbit.vy*.01,-wobble.velocity.x*.025);
    if(active&&active.tool!=='poke'){sound.update({tension:active.node?active.node.value.length()/2.65:0,speed:active.soundSpeed,pan:active.soundPan});active.soundSpeed*=Math.exp(-12*dt);}
    if(!active&&time>idleReturn&&brushJoy<.1&&mood.textContent!=='Perfectly unbothered.')setMood('Perfectly unbothered.');
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(tick);

// Readable state for interaction QA; no tracking or network requests.
window.gizmo={get state(){return {loaded,tool,audio:sound.state,active:!!active,activeTool:active?.tool||null,hatHovered:stage.classList.contains('hat-hover'),orientation:pivot?pivot.rotation.toArray().slice(0,3):[0,0,0],gestureCount,groomed,maxDeform,furCount,calm,yaw:orbit.yaw,pitch:orbit.pitch,turnSpeed:Math.hypot(orbit.vx,orbit.vy),wobble:wobble.value.length(),physicsSteps,expression:{...expression},pokeCount:reaction.pokes,springPositions:nodes.map(n=>n.value.toArray()),comments:mood.textContent,finite:!bodyGeometry||bodyGeometry.attributes.position.array.every(Number.isFinite),size:{width:canvas.clientWidth,height:canvas.clientHeight}};},setTool,reset};
const mc=document.modelContext;
if(mc?.registerTool){const lifecycle=new AbortController();const register=t=>{try{Promise.resolve(mc.registerTool(t,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
register({name:'select_gizmo_tool',title:'Select Gizmo tool',description:'Select Poke, Pull, Brush, or Turn in the visible Gizmo playground.',inputSchema:{type:'object',properties:{tool:{type:'string',enum:['poke','pull','brush','turn']}},required:['tool'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||Object.keys(input).length!==1||!['poke','pull','brush','turn'].includes(input.tool))throw new Error('Invalid tool');setTool(input.tool);return {tool};}});
register({name:'reset_gizmo',title:'Reset Gizmo',description:'Restore Gizmo’s original shape and clear every brush stroke.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||Object.keys(input).length)throw new Error('Expected an empty object');reset();return {reset:true};}});window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
