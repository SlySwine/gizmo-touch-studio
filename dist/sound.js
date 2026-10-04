// Soft, nonverbal cartoon creature vocals. Call unlock() from a trusted gesture.
// Movement inputs are normalized: tension/speed 0..1, pan -1..1.
export function createGizmoSound() {
  const STORAGE_KEY = 'gizmo-sound-enabled';
  const MAX_VOICES = 8;
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  const voices = new Set();
  const events = { unlock: 0, poke: 0, slap: 0, wonder: 0, star: 0, land: 0, launch: 0, rescue: 0, complete: 0, begin: 0, update: 0, end: 0, release: 0, giggle: 0, reset: 0, stop: 0, dropped: 0, errors: 0 };
  let enabled = true, available = !!AudioContextClass, disposed = false;
  let context = null, master = null, limiter = null, noise = null, voiceWave = null, purrWave = null, active = null;
  let resumePromise = null, lastPoke = -Infinity, lastSlap = -Infinity;
  const wonderCooldown = { star: .07, land: .1, launch: .12, rescue: .45, complete: .8 };
  const lastWonder = Object.create(null);
  try { enabled = globalThis.localStorage?.getItem(STORAGE_KEY) !== 'false'; } catch (_) { /* Storage may be private. */ }

  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
  const random = (low, high) => low + Math.random() * (high - low);
  const hidden = () => globalThis.document?.hidden === true;
  const usable = () => !disposed && enabled && available && context && (context.state === 'running' || resumePromise) && !hidden();

  function hold(param, time) {
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
    else {
      const value = param.value;
      param.cancelScheduledValues(time);
      param.setValueAtTime(value, time);
    }
  }

  function cleanup(voice) {
    if (voice.cleaned) return;
    voice.cleaned = true;
    for (const source of voice.sources) {
      source.onended = null;
      try { source.stop(); } catch (_) {}
    }
    voice.remaining = 0;
    for (const node of voice.nodes) { try { node.disconnect(); } catch (_) {} }
    voices.delete(voice);
    if (active === voice) active = null;
  }

  function finish(voice, seconds = .045) {
    if (!voice || voice.cleaned) return;
    if (voice.ending && !voice.tail) {
      if (context.state !== 'running') cleanup(voice);
      return;
    }
    // A lingering purr is still interruptible by stop, mute or cancellation.
    voice.tail = false;
    voice.ending = true;
    if (active === voice) active = null;
    const now = context.currentTime;
    for (const gain of voice.gains) {
      hold(gain.gain, now);
      gain.gain.linearRampToValueAtTime(0, now + seconds);
    }
    for (const source of voice.sources) {
      try { source.stop(now + seconds + .005); } catch (_) {}
    }
    // A suspended context cannot advance a release envelope or fire onended.
    if (context.state !== 'running') cleanup(voice);
  }

  function stop() {
    events.stop++;
    active = null;
    if (context) for (const voice of voices) finish(voice);
  }

  function initialize() {
    context = new AudioContextClass({ latencyHint: 'interactive' });
    master = context.createGain();
    master.gain.value = .32;
    limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 12;
    limiter.attack.value = .003;
    limiter.release.value = .1;
    master.connect(limiter);
    limiter.connect(context.destination);
    noise = context.createBuffer(1, Math.ceil(context.sampleRate * 2), context.sampleRate);
    const data = noise.getChannelData(0);
    let soft = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      soft = soft * .76 + white * .24;
      data[i] = soft * .8 + white * .2;
    }
    const real = new Float32Array(25), imaginary = new Float32Array(25);
    for (let i = 1; i < imaginary.length; i++) imaginary[i] = 1 / Math.pow(i, 1.12);
    voiceWave = context.createPeriodicWave(real, imaginary);
    // A rounded hum with just a little warmth from its first few harmonics.
    // Keep this separate from the brighter vowel source used for creature calls.
    purrWave = context.createPeriodicWave(new Float32Array(5), new Float32Array([0, 1, .18, .045, .01]));
    context.onstatechange = () => {
      if (context && context.state !== 'running') stop();
    };
  }

  function unlock() {
    if (disposed || !enabled || !available || hidden()) return Promise.resolve(false);
    // Where available, reject script-dispatched events before creating audio.
    if (globalThis.navigator?.userActivation && !globalThis.navigator.userActivation.isActive) return Promise.resolve(false);
    events.unlock++;
    try {
      if (!context) initialize();
      if (context.state === 'running') return Promise.resolve(true);
      if (context.state === 'closed') return Promise.resolve(false);
      if (!resumePromise) {
        // Invoke resume synchronously while the browser's gesture activation lives.
        resumePromise = Promise.resolve(context.resume()).then(() => {
          resumePromise = null;
          return !disposed && enabled && !hidden() && context?.state === 'running';
        }, () => {
          resumePromise = null;
          events.errors++;
          stop();
          return false;
        });
      }
      return resumePromise;
    } catch (_) {
      events.errors++;
      if (!context) available = false;
      stop();
      return Promise.resolve(false);
    }
  }

  function newVoice(kind, pan) {
    if (!usable()) return null;
    if (voices.size >= MAX_VOICES) { events.dropped++; return null; }
    const voice = { kind, sources: [], gains: [], nodes: [], remaining: 0, ending: false, cleaned: false, pan: null };
    if (typeof context.createStereoPanner === 'function') {
      voice.pan = context.createStereoPanner();
      voice.pan.pan.value = clamp(pan, -1, 1) * .65;
      voice.pan.connect(master);
      voice.nodes.push(voice.pan);
    }
    voices.add(voice);
    return voice;
  }

  function sourceFor(voice, type, frequency, cutoff) {
    const source = type === 'noise' ? context.createBufferSource() : context.createOscillator();
    if (type === 'noise') { source.buffer = noise; source.loop = true; }
    else {
      if (type === 'voice') source.setPeriodicWave(voiceWave);
      else if (type === 'purr') source.setPeriodicWave(purrWave);
      else source.type = type;
      source.frequency.setValueAtTime(frequency, context.currentTime);
    }
    const gain = context.createGain();
    gain.gain.value = 0;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, context.currentTime);
    filter.Q.value = .55;
    source.connect(filter);
    const formants = [];
    if (type === 'voice') {
      // A small harmonic glottal voice through three vowel resonances.
      // The quiet dry path keeps mmm/uh warm even at a low fundamental.
      const dry = context.createGain();
      dry.gain.value = .23;
      filter.connect(dry); dry.connect(gain); voice.nodes.push(dry);
      for (const [frequency, amount, q] of [[520, .95, 5], [1250, .6, 7], [2600, .24, 8]]) {
        const resonance = context.createBiquadFilter(), weight = context.createGain();
        resonance.type = 'bandpass'; resonance.frequency.value = frequency; resonance.Q.value = q;
        weight.gain.value = amount;
        filter.connect(resonance); resonance.connect(weight); weight.connect(gain);
        formants.push(resonance); voice.nodes.push(resonance, weight);
      }
    } else filter.connect(gain);
    gain.connect(voice.pan || master);
    voice.sources.push(source);
    voice.gains.push(gain);
    voice.nodes.push(source, filter, gain);
    voice.remaining++;
    source.onended = () => { if (--voice.remaining === 0) cleanup(voice); };
    return { source, gain, filter, formants };
  }

  function start(layer, now, duration) {
    if ('buffer' in layer.source) layer.source.start(now, random(0, .8));
    else layer.source.start(now);
    layer.source.stop(now + duration);
  }

  function envelope(layer, now, peak, attack, duration) {
    layer.gain.gain.setValueAtTime(0, now);
    layer.gain.gain.linearRampToValueAtTime(peak, now + attack);
    layer.gain.gain.exponentialRampToValueAtTime(.0001, now + duration - .015);
    layer.gain.gain.linearRampToValueAtTime(0, now + duration);
    start(layer, now, duration + .01);
  }

  function attempt(makeSound) {
    if (!usable()) return false;
    try { return makeSound(); }
    catch (_) { events.errors++; stop(); for (const voice of voices) cleanup(voice); return false; }
  }

  function vowel(layer, first, second, third = 2600, now = context.currentTime) {
    for (const [index, value] of [first, second, third].entries()) {
      const frequency = layer.formants[index].frequency;
      hold(frequency, now);
      frequency.setTargetAtTime(value, now, .035);
    }
  }

  function giggle(pan = 0, energy = .5) {
    const voice = newVoice('giggle', pan);
    if (!voice) return false;
    const now = context.currentTime, pitch = random(225, 275);
    const body = sourceFor(voice, 'voice', pitch, 3600);
    vowel(body, 340, 2050, 2900);
    const gain = body.gain.gain, f = body.source.frequency;
    gain.setValueAtTime(0, now);
    for (let i = 0; i < 3; i++) {
      const at = now + i * .115;
      f.setValueAtTime(pitch * (1 - i * .07), at);
      f.exponentialRampToValueAtTime(pitch * (.79 - i * .035), at + .085);
      gain.linearRampToValueAtTime(.20 + clamp(energy) * .10, at + .018);
      gain.linearRampToValueAtTime(.001, at + .083);
      gain.setValueAtTime(.001, at + .112);
    }
    gain.linearRampToValueAtTime(0, now + .36);
    start(body, now, .38);
    const breath = sourceFor(voice, 'noise', 0, 2400);
    envelope(breath, now, .11, .015, .37);
    events.giggle++;
    return true;
  }

  function poke({ strength = .65, pan = 0 } = {}) {
    return attempt(() => {
      const now = context.currentTime;
      if (now - lastPoke < .09) { events.dropped++; return false; }
      lastPoke = now;
      events.poke++;
      if (events.poke % 4 === 0) return giggle(pan, strength);
      const voice = newVoice('poke', pan);
      if (!voice) return false;
      const force = clamp(strength), pitch = random(135, 180) * (1 + force * .18);
      const body = sourceFor(voice, 'voice', pitch * .8, 3500);
      vowel(body, random(450, 620), random(1050, 1550));
      body.source.frequency.exponentialRampToValueAtTime(pitch * 1.24, now + .065);
      body.source.frequency.exponentialRampToValueAtTime(pitch * .72, now + .30);
      envelope(body, now, .25 + force * .10, .024, .36);
      const breath = sourceFor(voice, 'noise', 0, 1600);
      envelope(breath, now, .10, .015, .16);
      return true;
    });
  }

  function slap({ strength = .55, pan = 0 } = {}) {
    return attempt(() => {
      const now = context.currentTime;
      if (now - lastSlap < .09) { events.dropped++; return false; }
      for (const voice of voices) if (voice.tail) finish(voice);
      const voice = newVoice('slap', pan);
      if (!voice) return false;
      lastSlap = now;
      events.slap++;
      const force = clamp(strength), pitch = random(128, 136) + force * 22;
      // Power opens a clear percussive slap, with a brief rounded transient.
      // The shared master/limiter still bounds this louder contact layer.
      const impact = sourceFor(voice, 'noise', 0, 1700 + Math.pow(force, 1.2) * 5300);
      impact.filter.frequency.exponentialRampToValueAtTime(1400, now + .03);
      impact.filter.frequency.exponentialRampToValueAtTime(420, now + .10);
      const impactGain = impact.gain.gain, impactPeak = .24 + force * .82;
      impactGain.setValueAtTime(0, now);
      impactGain.linearRampToValueAtTime(impactPeak, now + .004 - force * .002);
      impactGain.setValueAtTime(impactPeak, now + .008 + force * .006);
      impactGain.exponentialRampToValueAtTime(impactPeak * .18, now + .04);
      impactGain.exponentialRampToValueAtTime(.0001, now + .115);
      impactGain.linearRampToValueAtTime(0, now + .13);
      start(impact, now, .14);
      // A separate rounded "Oh!": more power means a wider surprised pitch
      // leap and a longer open vowel, rather than the poke's short grunt.
      const voiceStart = now + .07, duration = .27 + force * .4;
      const peakPitch = Math.min(286, pitch * (1.14 + force * .78));
      const body = sourceFor(voice, 'voice', pitch, 2500);
      vowel(body, 450, 850, 2200, voiceStart);
      body.source.frequency.setValueAtTime(pitch, voiceStart);
      body.source.frequency.exponentialRampToValueAtTime(peakPitch, voiceStart + .055 + force * .045);
      body.source.frequency.exponentialRampToValueAtTime(peakPitch * .92, voiceStart + duration * .43);
      body.source.frequency.exponentialRampToValueAtTime(104 + force * 18, voiceStart + duration * .88);
      body.formants[0].frequency.setTargetAtTime(460 + force * 85, voiceStart + .055, .04);
      body.formants[0].frequency.setTargetAtTime(340, voiceStart + duration * .48, .10);
      body.formants[1].frequency.setTargetAtTime(730, voiceStart + duration * .48, .10);
      const gain = body.gain.gain, peak = .24 + force * .28;
      gain.setValueAtTime(0, voiceStart);
      gain.linearRampToValueAtTime(peak, voiceStart + .018);
      gain.setValueAtTime(peak, voiceStart + duration * .28);
      gain.linearRampToValueAtTime(peak * .48, voiceStart + duration * .70);
      gain.exponentialRampToValueAtTime(.0001, voiceStart + duration - .015);
      gain.linearRampToValueAtTime(0, voiceStart + duration);
      start(body, voiceStart, duration + .01);
      return true;
    });
  }

  function chime(voice, now, notes, step, shortLength, lastLength, amplitude) {
    // Alternate two plucked sines so notes can overlap gently without adding
    // sources. Every pitch change happens after that oscillator reaches zero.
    const layers = [sourceFor(voice, 'sine', notes[0], 4200), sourceFor(voice, 'sine', notes[1], 4200)];
    const ends = [now, now];
    notes.forEach((frequency, index) => {
      const slot = index % 2, layer = layers[slot], at = now + index * step;
      const length = index === notes.length - 1 ? lastLength : shortLength;
      const gain = layer.gain.gain, peak = amplitude * (1 - index * .05);
      layer.source.frequency.setValueAtTime(frequency, at);
      gain.setValueAtTime(0, at);
      gain.linearRampToValueAtTime(peak, at + .008);
      gain.exponentialRampToValueAtTime(peak * .16, at + length * .55);
      gain.exponentialRampToValueAtTime(.0001, at + length - .01);
      gain.linearRampToValueAtTime(0, at + length);
      ends[slot] = at + length;
    });
    layers.forEach((layer, index) => start(layer, now, ends[index] - now + .015));
  }

  function wonder(kind, strength = 1) {
    if (!Object.prototype.hasOwnProperty.call(wonderCooldown, kind)) return false;
    const force = clamp(strength);
    if (force === 0) return false;
    return attempt(() => {
      const now = context.currentTime;
      if (now - (lastWonder[kind] ?? -Infinity) < wonderCooldown[kind]) {
        events.dropped++;
        return false;
      }
      const voice = newVoice(kind, 0);
      if (!voice) return false;
      const energy = Math.sqrt(force);
      if (kind === 'star') {
        chime(voice, now, [783.99, 987.77, 1174.66], .1, .17, .36, .085 * energy);
      } else if (kind === 'complete') {
        chime(voice, now, [523.25, 659.25, 783.99, 1046.50], .16, .29, .5, .11 * energy);
      } else if (kind === 'rescue') {
        chime(voice, now, [392, 329.63], .16, .26, .38, .065 * energy);
      } else if (kind === 'land') {
        const body = sourceFor(voice, 'sine', 85 + force * 70, 600);
        body.source.frequency.exponentialRampToValueAtTime(58, now + .16);
        envelope(body, now, .15 * energy, .012, .24);
        const contact = sourceFor(voice, 'noise', 0, 550 + force * 350);
        contact.source.loop = false;
        envelope(contact, now, .065 * energy, .007, .10);
      } else {
        const body = sourceFor(voice, 'purr', 115, 1000);
        body.source.frequency.exponentialRampToValueAtTime(240 + force * 90, now + .29);
        envelope(body, now, .075 * energy, .045, .42);
        const air = sourceFor(voice, 'noise', 0, 1200);
        air.source.loop = false;
        air.filter.frequency.exponentialRampToValueAtTime(2800, now + .2);
        envelope(air, now, .055 * energy, .06, .35);
      }
      lastWonder[kind] = now;
      events.wonder++;
      events[kind]++;
      return true;
    });
  }

  function begin(kind, { pan = 0 } = {}) {
    if (!['pull', 'brush', 'turn'].includes(kind)) return false;
    return attempt(() => {
      finish(active);
      const now = context.currentTime;
      const continuing = kind === 'brush' ? Array.from(voices).find(voice =>
        voice.tail && !voice.cleaned && voice.remaining === voice.sources.length && now < voice.tailUntil - .04) : null;
      for (const voice of voices) if (voice.tail && voice !== continuing) finish(voice);
      if (continuing) {
        // Continue the same purr across strokes instead of layering new tails.
        const fade = clamp(1 - Math.max(0, now - continuing.tailStartedAt - .5) / .9);
        continuing.brushEnergy *= Math.pow(fade, 1 / .6);
        continuing.tail = false;
        continuing.ending = false;
        continuing.lastUpdate = now;
        hold(continuing.body.source.frequency, now);
        breathe(continuing.body, now, continuing.body.gain.gain.value);
        active = continuing;
        events.begin++;
        return true;
      }
      const voice = newVoice(kind, pan);
      if (!voice) return false;
      const brushing = kind === 'brush';
      // Brushing is a clean voiced hum; a noise bed reads as static here.
      if (!brushing) {
        voice.fuzz = sourceFor(voice, 'noise', 0, 650);
        start(voice.fuzz, now, .34);
      }
      voice.body = sourceFor(voice, brushing ? 'purr' : 'voice', brushing ? 94 : kind === 'turn' ? 155 : 105, brushing ? 360 : 3200);
      if (!brushing) vowel(voice.body, kind === 'pull' ? 440 : 280, kind === 'turn' ? 1400 : 850);
      start(voice.body, now, .34);
      voice.brushEnergy = 0;
      voice.lastUpdate = now;
      voice.purrPhase = random(0, Math.PI * 2);
      voice.tension = 0;
      active = voice;
      events.begin++;
      return true;
    });
  }

  function breathe(layer, now, amplitude) {
    hold(layer.gain.gain, now);
    layer.gain.gain.linearRampToValueAtTime(amplitude, now + .035);
    // Native audio-time watchdog: a stalled/missing update fades out by itself.
    layer.gain.gain.setValueAtTime(amplitude, now + .15);
    layer.gain.gain.linearRampToValueAtTime(0, now + .29);
    layer.source.stop(now + .34);
  }

  function update({ tension = 0, speed = 0, pan = 0 } = {}) {
    return attempt(() => {
      if (!active || active.ending) return false;
      const voice = active, now = context.currentTime, move = clamp(speed), stretch = clamp(tension);
      events.update++;
      voice.tension = stretch;
      if (voice.pan) {
        hold(voice.pan.pan, now);
        voice.pan.pan.setTargetAtTime(clamp(pan, -1, 1) * .65, now, .045);
      }
      if (voice.kind === 'pull') {
        hold(voice.body.source.frequency, now);
        voice.body.source.frequency.setTargetAtTime(98 + stretch * 105 + Math.sin(now * 22) * (2 + stretch * 3), now, .045);
        vowel(voice.body, 390 + stretch * 280, 820 + stretch * 540);
        breathe(voice.body, now, stretch * .19 + move * .045);
        breathe(voice.fuzz, now, stretch * .035 + move * .03);
        voice.fuzz.filter.frequency.setTargetAtTime(350 + stretch * 800, now, .06);
      } else if (voice.kind === 'brush') {
        // Smooth hand-speed changes, and pulse the volume instead of buzzing
        // the pitch. Slow, shallow drift keeps the low hum feeling alive.
        const elapsed = clamp(now - voice.lastUpdate, 0, .15);
        voice.lastUpdate = now;
        const response = move > voice.brushEnergy ? .11 : .6;
        voice.brushEnergy += (move - voice.brushEnergy) * (1 - Math.exp(-elapsed / response));
        const energy = voice.brushEnergy;
        const phase = voice.purrPhase;
        const pulse = .86 + Math.sin(now * 14.5 + phase + Math.sin(now * 1.8) * .15) * .11;
        hold(voice.body.source.frequency, now);
        voice.body.source.frequency.setTargetAtTime(94 + energy * 8 + Math.sin(now * 3.4 + phase) * .6, now, .14);
        breathe(voice.body, now, Math.pow(energy, .6) * .095 * pulse);
      } else {
        hold(voice.body.source.frequency, now);
        voice.body.source.frequency.setTargetAtTime(155 + move * 55 + Math.sin(now * 12) * 3, now, .04);
        breathe(voice.body, now, Math.pow(move, .6) * .13);
        breathe(voice.fuzz, now, Math.pow(move, .7) * .08);
        voice.fuzz.filter.frequency.setTargetAtTime(350 + move * 950, now, .06);
      }
      return true;
    });
  }

  function release(tension, pan) {
    const voice = newVoice('release', pan);
    if (!voice) return false;
    const now = context.currentTime, stretch = clamp(tension);
    const body = sourceFor(voice, 'voice', 155 + stretch * 90, 3500);
    vowel(body, 550, 1250);
    const f = body.source.frequency;
    f.exponentialRampToValueAtTime(100 + stretch * 20, now + .09);
    f.exponentialRampToValueAtTime(150 + stretch * 35, now + .19);
    f.exponentialRampToValueAtTime(85, now + .42);
    body.formants[0].frequency.setTargetAtTime(340, now + .14, .075);
    body.formants[1].frequency.setTargetAtTime(820, now + .14, .075);
    envelope(body, now, .24 + stretch * .10, .023, .48);
    const breath = sourceFor(voice, 'noise', 0, 1500);
    envelope(breath, now, .11 + stretch * .04, .025, .30);
    events.release++;
    return true;
  }

  function end({ release: shouldRelease = false, tension = 0 } = {}) {
    if (!active) {
      if (!shouldRelease) for (const voice of voices) if (voice.tail) finish(voice);
      return false;
    }
    const voice = active;
    const pan = voice.pan ? voice.pan.pan.value / .65 : 0;
    events.end++;
    if (shouldRelease && voice.kind === 'brush' && usable() && context.state === 'running') {
      const now = context.currentTime;
      active = null;
      voice.ending = true;
      voice.tail = true;
      voice.tailStartedAt = now;
      voice.tailUntil = now + 1.45;
      // Enjoy the last stroke for half a second, then settle gently to silence.
      // Reuse the voiced source; its native stop time bounds an unattended tail.
      const layer = voice.body, level = layer.gain.gain.value;
      hold(layer.gain.gain, now);
      layer.gain.gain.setValueAtTime(level, now + .5);
      layer.gain.gain.linearRampToValueAtTime(0, now + 1.4);
      layer.source.stop(voice.tailUntil);
      hold(voice.body.source.frequency, now);
      voice.body.source.frequency.setTargetAtTime(94, now, .45);
      return true;
    }
    finish(voice, .05);
    if (shouldRelease && voice.kind === 'pull') return attempt(() => release(Math.max(clamp(tension), voice.tension), pan));
    return true;
  }

  function reset() {
    stop();
    return attempt(() => {
      const voice = newVoice('reset', 0);
      if (!voice) return false;
      events.reset++;
      const now = context.currentTime;
      const fluff = sourceFor(voice, 'noise', 0, 450);
      fluff.filter.frequency.exponentialRampToValueAtTime(2400, now + .11);
      fluff.filter.frequency.exponentialRampToValueAtTime(600, now + .39);
      envelope(fluff, now, .22, .09, .62);
      const body = sourceFor(voice, 'voice', 145, 2500);
      vowel(body, 480, 1020);
      body.source.frequency.exponentialRampToValueAtTime(165, now + .1);
      body.source.frequency.exponentialRampToValueAtTime(80, now + .46);
      envelope(body, now, .19, .045, .52);
      return true;
    });
  }

  function setEnabled(value) {
    enabled = !!value;
    try { globalThis.localStorage?.setItem(STORAGE_KEY, String(enabled)); } catch (_) {}
    if (!enabled) stop();
    return enabled;
  }

  const onHidden = () => { if (hidden()) stop(); };
  globalThis.addEventListener?.('blur', stop);
  globalThis.document?.addEventListener('visibilitychange', onHidden);

  function dispose() {
    if (disposed) return;
    stop();
    disposed = true;
    globalThis.removeEventListener?.('blur', stop);
    globalThis.document?.removeEventListener('visibilitychange', onHidden);
    if (context) {
      context.onstatechange = null;
      for (const voice of voices) cleanup(voice);
      try { master?.disconnect(); limiter?.disconnect(); } catch (_) {}
      try { Promise.resolve(context.close()).catch(() => {}); } catch (_) {}
    }
    noise = null;
  }

  return Object.freeze({
    unlock, setEnabled, poke, slap, wonder, begin, update, end, reset, stop, dispose,
    get enabled() { return enabled; },
    get state() {
      return Object.freeze({
        enabled, available: available && !disposed, contextState: context?.state || 'uninitialized',
        activeKind: active?.kind || null, voices: voices.size,
        sources: Array.from(voices).reduce((sum, voice) => sum + voice.remaining, 0),
        events: Object.freeze({ ...events })
      });
    }
  });
}
