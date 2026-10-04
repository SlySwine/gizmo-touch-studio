/** Small, quiet instrument for movement and discoveries. No samples or network. */
export function createWorldAudio() {
  let context, bus, muted=false, chargeVoice=null, lastLand=0;
  const voices=new Set();
  function unlock() {
    if(muted)return;
    try {
      if(!context) {
        context=new (window.AudioContext||window.webkitAudioContext)();
        const compressor=context.createDynamicsCompressor();
        compressor.threshold.value=-20;compressor.knee.value=18;
        compressor.ratio.value=5;compressor.attack.value=.005;compressor.release.value=.2;
        bus=context.createGain();bus.gain.value=.58;bus.connect(compressor).connect(context.destination);
      }
      if(context.state==='suspended')context.resume().catch(()=>{});
    } catch {}
  }
  function note(frequency,start,duration,volume=.07,type='sine',end=frequency) {
    if(!context||muted||context.state!=='running')return;
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,end),start+duration*.7);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.018);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    const voice={oscillator,gain};voices.add(voice);
    oscillator.connect(gain).connect(bus);oscillator.start(start);oscillator.stop(start+duration+.025);
    oscillator.onended=()=>{voices.delete(voice);oscillator.disconnect();gain.disconnect();};
  }
  function stopCharge() {
    if(!chargeVoice||!context)return;
    const voice=chargeVoice;chargeVoice=null;
    voice.gain.gain.setTargetAtTime(0,context.currentTime,.035);
    voice.oscillator.stop(context.currentTime+.18);
  }
  function updateCharge(charge) {
    if(!context||muted||context.state!=='running'||!charge?.active||charge.power<.14){stopCharge();return;}
    if(!chargeVoice) {
      const oscillator=context.createOscillator(),gain=context.createGain();
      oscillator.type='sine';gain.gain.value=0;oscillator.connect(gain).connect(bus);oscillator.start();
      chargeVoice={oscillator,gain};const voice=chargeVoice;voices.add(voice);
      oscillator.onended=()=>{voices.delete(voice);oscillator.disconnect();gain.disconnect();};
    }
    chargeVoice.oscillator.frequency.setTargetAtTime(130+charge.power*105,context.currentTime,.06);
    chargeVoice.gain.gain.setTargetAtTime(.024+charge.power*.022,context.currentTime,.08);
  }
  function play(kind,power=.5) {
    if(!context||muted||context.state!=='running')return;
    const now=context.currentTime;
    if(kind==='charge-release') {
      stopCharge();note(180+power*80,now,.30+power*.14,.105,'sine',350+power*230);
      note(440+power*120,now+.045,.28,.025,'sine',240);return;
    }
    if(kind==='land') {
      if(now-lastLand<.15)return;lastLand=now;
      note(105+power*35,now,.22,.03+power*.07,'sine',48);return;
    }
    const notes=kind==='complete'?[261.63,329.63,392,523.25]:kind==='secret'||kind==='chime'?[659.25,783.99,987.77]:kind==='bad'?[174.61,146.83]:kind==='step'?[96]:[329.63,493.88];
    notes.forEach((hz,i)=>{
      note(hz,now+i*.105,kind==='step'?.1:.7,kind==='step'?.014:.055);
      if(kind!=='step')note(hz*2,now+i*.105,.35,.013);
    });
  }
  function suspend(){
    chargeVoice=null;
    for(const voice of voices){try{voice.oscillator.stop();}catch{}voice.oscillator.disconnect();voice.gain.disconnect();}
    voices.clear();context?.suspend().catch(()=>{});
  }
  function setMuted(value){muted=value;if(muted)suspend();else if(context)context.resume().catch(()=>{});}
  return {unlock,play,updateCharge,suspend,setMuted};
}
