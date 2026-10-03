import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const canvas=document.querySelector('#canvas'), stage=document.querySelector('.stage');
const loading=document.querySelector('#loading'), mood=document.querySelector('#mood');
const cursor=document.querySelector('#cursor');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let calm=reduced.matches, tool='poke', active=null, loaded=false, time=0, lastTime=0;
let rig,body,base,fur,furGeo,furRoots,furNormals,furGroom,furSeeds,bodyGeometry;
let furCount=0, groomed=0, gestureCount=0, maxDeform=0, frame=0, idleReturn=0;
const attachments=[],eyes=[], nodes=[];
const MAX=6, zero=new THREE.Vector3();
for(let i=0;i<MAX;i++)nodes.push({center:new THREE.Vector3(0,-100,0),value:new THREE.Vector3(),velocity:new THREE.Vector3(),target:new THREE.Vector3(),radius:0.72});
let nextNode=0, response=0, responseTarget=0, brushJoy=0;
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
const hitPlane=new THREE.Plane(), temp=new THREE.Vector3(), temp2=new THREE.Vector3();
const uCenter=nodes.map(n=>n.center), uDisplace=nodes.map(n=>n.value), uRadius=new Float32Array(MAX).fill(.72);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(34,1,.1,60);
camera.position.set(0,2.3,10.4);camera.lookAt(0,2.06,0);
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});}
catch(e){fail('Gizmo needs WebGL to play. Try a browser with hardware acceleration enabled.');throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
scene.add(new THREE.HemisphereLight(0xf7d5ec,0x28243e,2.1));
const key=new THREE.DirectionalLight(0xffd5e4,3.3);key.position.set(-4,6,6);scene.add(key);
const rim=new THREE.DirectionalLight(0x86cfff,2.3);rim.position.set(4,4,-2);scene.add(rim);
const fill=new THREE.DirectionalLight(0xff83bc,.9);fill.position.set(-4,1,0);scene.add(fill);

// Soft contact shadow; the character and all visible fibers are live geometry.
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
const sc=shadowCanvas.getContext('2d');const sg=sc.createRadialGradient(64,64,3,64,64,64);
sg.addColorStop(0,'rgba(0,0,0,.65)');sg.addColorStop(.5,'rgba(0,0,0,.34)');sg.addColorStop(1,'rgba(0,0,0,0)');sc.fillStyle=sg;sc.fillRect(0,0,128,128);
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(6.9,4.8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(0,-.005,0);scene.add(shadow);
const floor=new THREE.Mesh(new THREE.CircleGeometry(2.9,96),new THREE.MeshBasicMaterial({color:0x24314b,transparent:true,opacity:.16,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.01;scene.add(floor);

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
  rig=gltf.scene;scene.add(rig);rig.name='Gizmo';
  rig.traverse(o=>{if(!o.isMesh)return;o.frustumCulled=false;
    if(o.name==='Body'){body=o;bodyGeometry=o.geometry;base=new Float32Array(o.geometry.attributes.position.array);o.material=new THREE.MeshStandardMaterial({color:0xe82c85,roughness:1,bumpMap:noiseTexture,bumpScale:.035});}
    else if(o.name.startsWith('Hat')){o.material=new THREE.MeshStandardMaterial({color:o.name==='HatBand'?0x171322:0x10101b,roughness:o.name==='HatBand'?.63:.94,bumpMap:noiseTexture,bumpScale:.025});attachments.push({mesh:o,anchor:new THREE.Vector3(-1,3.37,0),original:o.position.clone()});}
    else if(o.name.startsWith('Eye')){o.material=new THREE.MeshStandardMaterial({color:0x05030a,roughness:1});o.geometry.computeBoundingBox();const center=o.geometry.boundingBox.getCenter(new THREE.Vector3());o.material.onBeforeCompile=shader=>{shader.uniforms.centers={value:uCenter};shader.uniforms.displacements={value:uDisplace};shader.uniforms.radii={value:uRadius};shader.vertexShader='uniform vec3 centers[6];uniform vec3 displacements[6];uniform float radii[6];\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <skinning_vertex>','#include <skinning_vertex>\nvec3 originalEye=transformed;for(int i=0;i<6;i++){vec3 d=originalEye-centers[i];transformed+=displacements[i]*exp(-dot(d,d)/(2.0*radii[i]*radii[i]));}');};o.material.customProgramCacheKey=()=> 'gizmo-eyes';eyes.push(o);}
  });
  if(!body)throw new Error('Body missing from character asset');
  makeFur();loaded=true;loading.classList.add('hidden');resize();
},undefined,error=>{console.error(error);fail('Gizmo could not load. Please refresh to try again.');});

function makeFur(){
  furCount=matchMedia('(pointer: coarse)').matches?26000:46000;
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
  const blade=[];for(let j=0;j<3;j++){const t=j/3,t1=(j+1)/3;blade.push(-1,t,0,1,t,0,-1,t1,0,1,t,0,1,t1,0,-1,t1,0);}
  furGeo.setAttribute('position',new THREE.Float32BufferAttribute(blade,3));
  furGeo.setAttribute('root',new THREE.InstancedBufferAttribute(furRoots,3));furGeo.setAttribute('hairNormal',new THREE.InstancedBufferAttribute(furNormals,3));
  furGeo.setAttribute('groom',new THREE.InstancedBufferAttribute(furGroom,3).setUsage(THREE.DynamicDrawUsage));furGeo.setAttribute('seed',new THREE.InstancedBufferAttribute(furSeeds,1));furGeo.instanceCount=furCount;
  const mat=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{centers:{value:uCenter},displacements:{value:uDisplace},radii:{value:uRadius}},vertexShader:`
    attribute vec3 root;attribute vec3 hairNormal;attribute vec3 groom;attribute float seed;
    uniform vec3 centers[6];uniform vec3 displacements[6];uniform float radii[6];
    varying vec3 vColor;varying float vT;
    vec3 displace(vec3 p){vec3 result=p;for(int i=0;i<6;i++){vec3 d=p-centers[i];result+=displacements[i]*exp(-dot(d,d)/(2.0*radii[i]*radii[i]));}return result;}
    void main(){
      float t=position.y;vT=t;vec3 n=hairNormal;
      vec3 tangent=normalize(cross(n,abs(n.y)<.9?vec3(0,1,0):vec3(1,0,0)));
      vec3 bitangent=cross(n,tangent);
      float angle=seed*62.83;vec3 curl=(tangent*cos(angle)+bitangent*sin(angle))*(.024+seed*.026);
      float eyeZone=length(vec2((abs(root.x)-.736)/.66,(root.y-2.38)/.44));float trim=root.z>1.0?mix(.035,1.0,smoothstep(.83,1.13,eyeZone)):1.0;curl*=trim;float len=(.065+seed*.058)*trim;float laid=clamp(length(groom)*3.5,0.0,.72);
      vec3 p=root+n*(.004+len*t*(1.0-laid))+curl*t*t+groom*t*t*trim;
      vec3 worldRoot=(modelMatrix*vec4(root,1)).xyz;
      vec3 viewDir=normalize((inverse(modelMatrix)*vec4(cameraPosition,1)).xyz-root);
      vec3 side=normalize(cross(n+groom*7.0,viewDir)+vec3(.0001));
      p+=side*position.x*(.0021+seed*.0012)*(1.0-t*.96);
      float light=max(dot(n,normalize(vec3(-.5,.8,1.0))),0.0);
      float rim=max(dot(n,normalize(vec3(.8,.6,-.3))),0.0);
      vec3 pink=mix(vec3(.36,.005,.09),vec3(.98,.10,.40),.38+light*.62);
      pink+=vec3(.07,.09,.17)*rim;
      vColor=pink*(.67+seed*.37)*(.66+t*.46);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(displace(p),1.0);
    }`,fragmentShader:`varying vec3 vColor;varying float vT;void main(){gl_FragColor=vec4(vColor,1.0);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
  fur=new THREE.Mesh(furGeo,mat);fur.frustumCulled=false;rig.add(fur);
}

const instructions={poke:'Press into the fluff. Let go for a little bounce.',pull:'Grab a lobe, stretch it out, and let it spring back.',brush:'Sweep across his fur. Every stroke leaves a trace.'};
const notes={poke:'TOUCH • HOLD • RELEASE',pull:'GRAB • STRETCH • LET GO',brush:'SWEEP • SMOOTH • REPEAT'};
function setTool(value){if(!Object.hasOwn(instructions,value))throw new Error('Choose poke, pull, or brush.');endGesture();tool=value;document.querySelectorAll('[data-tool]').forEach(b=>{const on=b.dataset.tool===tool;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});document.querySelector('#instruction').textContent=instructions[tool];document.querySelector('#gesture-note').textContent=notes[tool];cursor.className=tool;setMood(tool==='brush'?'A little grooming goes a long way.':'Perfectly unbothered.');}
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
function reset(){endGesture();for(const n of nodes){n.value.set(0,0,0);n.velocity.set(0,0,0);n.target.set(0,0,0);n.center.set(0,-100,0);}if(furGroom){furGroom.fill(0);furGeo.attributes.groom.needsUpdate=true;}groomed=0;response=0;responseTarget=0;brushJoy=0;maxDeform=0;if(rig){rig.position.set(0,0,0);rig.rotation.set(0,0,0);rig.scale.set(1,1,1);}setMood('Fresh fluff. Fresh start.');idleReturn=time+3;}
document.querySelector('#reset').addEventListener('click',reset);
const motion=document.querySelector('#motion');function setCalm(v){calm=v;motion.setAttribute('aria-pressed',String(calm));}setCalm(calm);motion.addEventListener('click',()=>setCalm(!calm));

function ray(e){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);cursor.style.left=(e.clientX-r.left)+'px';cursor.style.top=(e.clientY-r.top)+'px';}
function contact(e){if(!loaded)return null;ray(e);scene.updateMatrixWorld(true);const hits=raycaster.intersectObject(body,false);if(!hits.length)return null;const hit=hits[0];const local=body.worldToLocal(hit.point.clone());const face=hit.face;const p=body.geometry.attributes.position;
  const a=new THREE.Vector3().fromBufferAttribute(p,face.a),b=new THREE.Vector3().fromBufferAttribute(p,face.b),c=new THREE.Vector3().fromBufferAttribute(p,face.c);
  const bc=new THREE.Vector3();THREE.Triangle.getBarycoord(local,a,b,c,bc);const rest=new THREE.Vector3();for(const [vi,w] of [[face.a,bc.x],[face.b,bc.y],[face.c,bc.z]])rest.addScaledVector(new THREE.Vector3().fromArray(base,vi*3),w);
  return {point:rest,world:hit.point,normal:hit.face.normal.clone()};}
function newNode(point,radius){let index=nextNode++%MAX;const n=nodes[index];n.center.copy(point);n.radius=radius;uRadius[index]=radius;n.value.set(0,0,0);n.velocity.set(0,0,0);n.target.set(0,0,0);return n;}
function startGesture(e){if(active||e.button>0)return;const hit=contact(e);if(!hit)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);gestureCount++;
  const n=tool==='brush'?null:newNode(hit.point,tool==='pull'?.83:.62);
  const cameraDir=camera.getWorldDirection(new THREE.Vector3());hitPlane.setFromNormalAndCoplanarPoint(cameraDir,hit.world);
  active={id:e.pointerId,node:n,start:hit.world.clone(),last:hit.point.clone(),tool,point:hit.point.clone(),startTime:time};stage.classList.add('contact');cursor.style.opacity='1';
  if(tool==='poke'){n.target.copy(hit.normal).multiplyScalar(-.43);n.velocity.copy(hit.normal).multiplyScalar(-1.8);responseTarget=.32;setMood('Oh. Hello there.');}
  if(tool==='pull'){responseTarget=.75;setMood('A little stretch…');}
  if(tool==='brush'){brushJoy=.8;setMood('That’s the spot.');}
}
function moveGesture(e){if(!loaded)return;ray(e);if(!active){const hit=raycaster.intersectObject(body,false)[0];cursor.style.opacity=hit&&e.pointerType!=='touch'?'1':'0';return;}if(e.pointerId!==active.id)return;e.preventDefault();
  if(active.tool==='pull'){const p=raycaster.ray.intersectPlane(hitPlane,temp);if(p){const localNow=rig.worldToLocal(p.clone());const localStart=rig.worldToLocal(active.start.clone());active.node.target.copy(localNow.sub(localStart)).clampLength(0,1.75);active.node.target.z=.12*Math.min(active.node.target.length(),1);responseTarget=Math.min(1,active.node.target.length()*.8+.3);setMood(active.node.target.length()>1.1?'Okay, that’s quite a stretch.':'A little stretch…');}}
  if(active.tool==='brush'){const hit=contact(e);if(hit){const delta=hit.point.clone().sub(active.last).clampLength(0,.35);if(delta.length()>.001){groom(hit.point,delta);active.last.copy(hit.point);brushJoy=1;}}}
}
function groom(point,delta){let affected=0;const len=delta.length();if(len<.0001)return;const dir=delta.clone().normalize();const radius=.62;for(let i=0;i<furCount;i++){const j=i*3;const x=furRoots[j]-point.x,y=furRoots[j+1]-point.y,z=furRoots[j+2]-point.z,d=x*x+y*y+z*z;if(d>radius*radius)continue;const nDot=dir.x*furNormals[j]+dir.y*furNormals[j+1]+dir.z*furNormals[j+2];const w=(1-Math.sqrt(d)/radius)*Math.min(1,len*18);for(let k=0;k<3;k++){const target=(dir.getComponent(k)-nDot*furNormals[j+k])*.24;furGroom[j+k]+=(target-furGroom[j+k])*w;}affected++;}groomed+=affected;furGeo.attributes.groom.needsUpdate=true;}
function endGesture(e){if(e&&active&&e.pointerId!==undefined&&e.pointerId!==active.id)return;if(active){const id=active.id;if(active.node)active.node.target.set(0,0,0);active=null;if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);responseTarget=0;idleReturn=time+2.5;setMood(tool==='brush'?'Impeccably groomed. Mostly.':'Back to his usual self.');}stage.classList.remove('contact');}
canvas.addEventListener('pointerdown',startGesture);canvas.addEventListener('pointermove',moveGesture);canvas.addEventListener('pointerup',endGesture);canvas.addEventListener('pointercancel',endGesture);canvas.addEventListener('lostpointercapture',endGesture);canvas.addEventListener('pointerleave',()=>{if(!active)cursor.style.opacity='0';});window.addEventListener('blur',()=>endGesture());document.addEventListener('visibilitychange',()=>{if(document.hidden)endGesture();});canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;const values={'1':'poke','2':'pull','3':'brush'};if(values[e.key])setTool(values[e.key]);if(e.key.toLowerCase()==='r')reset();if(document.activeElement!==canvas||!loaded)return;if(e.key===' '){e.preventDefault();const n=newNode(new THREE.Vector3(0,1.6,1.25),.75);n.velocity.z=-4;responseTarget=.6;setTimeout(()=>responseTarget=0,220);gestureCount++;}if(e.key.startsWith('Arrow')){e.preventDefault();const d=new THREE.Vector3(e.key==='ArrowLeft'?-.5:e.key==='ArrowRight'?.5:0,e.key==='ArrowUp'?.5:e.key==='ArrowDown'?-.5:0,0);if(tool==='brush'){groom(new THREE.Vector3(0,1.6,1.3),d);brushJoy=1;}else{const n=newNode(new THREE.Vector3(0,1.6,1.2),.8);n.velocity.copy(d).multiplyScalar(6);gestureCount++;}}});

function tick(now){requestAnimationFrame(tick);const dt=Math.min((now-lastTime)/1000||.016,.033);lastTime=now;time+=dt;frame++;
  if(loaded){let moving=false,max=0;
    // Substeps keep the damped spring stable through slow frames and long grabs.
    const steps=3,h=dt/steps;for(const n of nodes){for(let s=0;s<steps;s++){const held=active?.node===n;const k=held?125:68,damping=held?17:8.5;n.velocity.addScaledVector(temp.copy(n.target).sub(n.value),k*h).multiplyScalar(Math.exp(-damping*h));n.value.addScaledVector(n.velocity,h);}if(n.value.lengthSq()+n.velocity.lengthSq()>.000001)moving=true;max=Math.max(max,n.value.length());}maxDeform=max;
    if(moving||frame%20===0){const arr=bodyGeometry.attributes.position.array;for(let i=0;i<base.length;i+=3){field(base[i],base[i+1],base[i+2],temp);arr[i]=base[i]+temp.x;arr[i+1]=base[i+1]+temp.y;arr[i+2]=base[i+2]+temp.z;}bodyGeometry.attributes.position.needsUpdate=true;if(frame%3===0)bodyGeometry.computeVertexNormals();bodyGeometry.computeBoundingSphere();}
    for(const a of attachments){field(a.anchor.x,a.anchor.y,a.anchor.z,temp);a.mesh.position.copy(a.original).add(temp);}
    response+=(responseTarget-response)*Math.min(1,dt*9);brushJoy=Math.max(0,brushJoy-dt*.17);
    const blink=!active&&Math.sin(time*.79)>.998?Math.pow((Math.sin(time*.79)-.998)/.002,1.4):0;
    for(const eye of eyes){const dict=eye.morphTargetDictionary;const values=eye.morphTargetInfluences;if(!dict||!values)continue;values[dict.Surprised]=response;values[dict.Smug]=brushJoy*.66;values[dict.Blink]=blink*(1-response);values[dict.Skeptical]=0;}
    if(!active){rig.rotation.y=calm?0:Math.sin(time*.55)*.035;rig.rotation.z=calm?0:Math.sin(time*.7)*.006;rig.scale.y=calm?1:1+Math.sin(time*1.8)*.004;}
    if(!active&&time>idleReturn&&brushJoy<.1&&mood.textContent!=='Perfectly unbothered.')setMood('Perfectly unbothered.');
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(tick);

// Readable state for interaction QA; no tracking or network requests.
window.gizmo={get state(){return {loaded,tool,active:!!active,gestureCount,groomed,maxDeform,furCount,calm,finite:!bodyGeometry||bodyGeometry.attributes.position.array.every(Number.isFinite),size:{width:canvas.clientWidth,height:canvas.clientHeight}};},setTool,reset};
const mc=document.modelContext;
if(mc?.registerTool){const lifecycle=new AbortController();const register=t=>{try{Promise.resolve(mc.registerTool(t,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
register({name:'select_gizmo_tool',title:'Select Gizmo tool',description:'Select Poke, Pull, or Brush in the visible Gizmo playground.',inputSchema:{type:'object',properties:{tool:{type:'string',enum:['poke','pull','brush']}},required:['tool'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||Object.keys(input).length!==1||!['poke','pull','brush'].includes(input.tool))throw new Error('Invalid tool');setTool(input.tool);return {tool};}});
register({name:'reset_gizmo',title:'Reset Gizmo',description:'Restore Gizmo’s original shape and clear every brush stroke.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||Object.keys(input).length)throw new Error('Expected an empty object');reset();return {reset:true};}});window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
