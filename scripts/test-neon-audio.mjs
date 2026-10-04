import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldAudio} from '../dist/neon/audio.js';

// A controllable clock deliberately leaves scheduled sounds pending across suspend,
// reproducing the browser behavior that used to replay stale tails on resume.
function audioClock(){
 const contexts=[];
 const parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
 class Node{
  constructor(){this.connected=false;}
  connect(destination){this.connected=true;return destination;}
  disconnect(){this.connected=false;}
 }
 class Context{
  constructor(){this.currentTime=0;this.state='suspended';this.destination=new Node();this.oscillators=[];contexts.push(this);}
  createGain(){const node=new Node();node.gain=parameter();return node;}
  createDynamicsCompressor(){const node=new Node();for(const key of ['threshold','knee','ratio','attack','release'])node[key]=parameter();return node;}
  createOscillator(){const node=new Node();node.frequency=parameter();node.start=()=>{node.started=true;};node.stop=()=>{node.stopped=true;};this.oscillators.push(node);return node;}
  resume(){this.state='running';return Promise.resolve();}
  suspend(){this.state='suspended';return Promise.resolve();}
 }
 return {contexts,Context};
}

test('game audio waits for a gesture and disconnects both current and scheduled voices before suspension',()=>{
 const clock=audioClock(),previous=globalThis.window;globalThis.window={AudioContext:clock.Context};
 try{
  const sound=createWorldAudio();sound.play('complete');assert.equal(clock.contexts.length,0);
  sound.unlock();const context=clock.contexts[0];sound.play('complete');sound.updateCharge({active:true,power:.6});
  assert(context.oscillators.some(v=>v.connected));sound.suspend();
  assert.equal(context.state,'suspended');assert(context.oscillators.every(v=>v.stopped&&!v.connected));
  const count=context.oscillators.length;sound.unlock();assert.equal(context.state,'running');
  assert.equal(context.oscillators.length,count);assert(context.oscillators.every(v=>!v.connected));
  context.currentTime=1;sound.play('land',.8);assert(context.oscillators.at(-1).connected);
  sound.setMuted(true);assert(context.oscillators.every(v=>!v.connected));
  const mutedCount=context.oscillators.length;sound.play('secret');sound.updateCharge({active:true,power:1});assert.equal(context.oscillators.length,mutedCount);
 }finally{globalThis.window=previous;}
});

test('finished notes release their resources, and a cancelled charge leaves no suspended tail',()=>{
 const clock=audioClock(),previous=globalThis.window;globalThis.window={AudioContext:clock.Context};
 try{
  const sound=createWorldAudio();sound.unlock();const context=clock.contexts[0];sound.play('step');
  const step=context.oscillators[0];step.onended();assert.equal(step.connected,false);
  sound.updateCharge({active:true,power:1});sound.updateCharge(null);sound.suspend();
  assert(context.oscillators.every(v=>!v.connected));sound.setMuted(false);
  assert(context.oscillators.every(v=>!v.connected));
 }finally{globalThis.window=previous;}
});
