/* Experimental B236E-data synthesizer, not a sample-identical GXSCC emulator.
 * Oscillator reconstruction, ADSR curves, mixer and all percussion remain hypotheses.
 * The same Synth is used for interactive playback and offline WAV rendering.
 */
(function (root) {
  'use strict';
  const VERSION = 'audit-fix-20260908.1';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const frequency = note => 440 * Math.pow(2, (note - 69) / 12);
  const defaults = () => ({program: 0, volume: 100 / 127, expression: 1, pan: 0,
    bend: 0, bendRange: 2, sustain: false, rpnMSB: 127, rpnLSB: 127});

  function coefficients(samples) {
    const n = samples.length, real = new Float32Array(n / 2 + 1), imag = new Float32Array(n / 2 + 1);
    for (let k = 1; k <= n / 2; k++) {
      for (let i = 0; i < n; i++) {
        const angle = 2 * Math.PI * k * i / n;
        real[k] += samples[i] / 128 * Math.cos(angle);
        imag[k] += samples[i] / 128 * Math.sin(angle);
      }
      real[k] *= k === n / 2 ? 1 / n : 2 / n;
      imag[k] *= k === n / 2 ? 0 : 2 / n;
    }
    // Web Audio ignores DC; this is deliberately documented, not called exact PCM.
    return {real, imag};
  }

  class Synth {
    constructor(context, data, {instrumentSet = 0, masterGain = 0.12} = {}) {
      if (!context || !data || data.envelopes.length !== 128) throw new Error('Synth data/context missing');
      this.context = context; this.data = data; this.instrumentSet = instrumentSet;
      this.master = context.createGain(); this.master.gain.value = masterGain;
      this.master.connect(context.destination);
      this.states = Array.from({length: 32}, defaults);
      this.voices = []; this.owned = new Set(); this.cache = new Map(); this.serial = 0;
      this.warnings = new Set(); this.maxVoices = 46;
      this.buses = this.states.map(st => {
        const gain = context.createGain(), mute = context.createGain(), pan = context.createStereoPanner();
        gain.gain.value = st.volume; mute.gain.value = 1;
        gain.connect(mute).connect(pan).connect(this.master);
        return {gain, mute, pan};
      });
    }
    wave(program, set = this.instrumentSet) {
      return this.data.wavetables[this.data.instrumentSets[set].map[program & 127]];
    }
    periodic(program, set) {
      const idx = this.data.instrumentSets[set].map[program & 127];
      if (!this.cache.has(idx)) {
        const {real, imag} = coefficients(this.data.wavetables[idx].samples);
        this.cache.set(idx, this.context.createPeriodicWave(real, imag, {disableNormalization: true}));
      }
      return this.cache.get(idx);
    }
    envelope(program) {
      const v = this.data.envelopes[program & 127], rate = this.data.referenceSampleRate;
      return {a: v.a / rate, d: v.d / rate, s: clamp(v.s / 65535, 0, 1), r: v.r / rate};
    }
    active(time = this.context.currentTime) {
      return this.voices.filter(v => v.start <= time && v.end > time);
    }
    allocate(time) {
      this.voices = this.voices.filter(v => v.end > time);
      while (this.voices.length >= this.maxVoices) {
        // An explicit oldest-voice policy, NOT verified against the EXE allocator.
        const oldest = this.voices.shift(); this.release(oldest, time, true);
      }
    }
    own(v) {
      this.voices.push(v); this.owned.add(v);
      v.source.onended = () => {
        this.owned.delete(v);
        this.voices = this.voices.filter(x => x !== v);
        v.source.disconnect(); v.gain.disconnect();
      };
    }
    amplitudeAt(v, time) {
      const age = Math.max(0, time - v.start), e = v.env;
      if (e.a > 0 && age < e.a) return v.peak * age / e.a;
      if (e.d > 0 && age < e.a + e.d) return v.peak * Math.pow(Math.max(1e-5, e.s), (age - e.a) / e.d);
      return v.peak * e.s;
    }
    release(v, time, hard = false) {
      if (!v || v.end <= time || (!hard && v.releaseTime !== null)) return;
      time = Math.max(time, this.context.currentTime);
      const param = v.gain.gain;
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
      else {
        param.cancelScheduledValues(time);
        const value = Math.max(1e-6, this.amplitudeAt(v, time));
        if (time - v.start < v.env.a) param.linearRampToValueAtTime(value, time);
        else param.exponentialRampToValueAtTime(value, time);
      }
      v.keyDown = false; v.held = false; v.releaseTime = time;
      const duration = hard ? 0 : v.env.r;
      v.end = time + duration;
      if (duration > 0) {
        param.exponentialRampToValueAtTime(1e-6, v.end);
        param.setValueAtTime(0, v.end);
      } else param.setValueAtTime(0, time);
      v.source.stop(v.end);
    }
    silence(time = this.context.currentTime) {
      // Includes scheduled/releasing nodes already pruned from the logical allocator.
      for (const v of this.owned) {
        v.gain.gain.cancelScheduledValues(time); v.gain.gain.setValueAtTime(0, time);
        try { v.source.stop(time); } catch (_) { /* A node may already have ended. */ }
        v.end = time;
      }
      this.voices = [];
    }
    reset(time = this.context.currentTime) {
      this.silence(time);
      this.states = Array.from({length: 32}, defaults);
      this.states.forEach((s, c) => {
        for (const param of [this.buses[c].gain.gain, this.buses[c].pan.pan]) param.cancelScheduledValues(time);
        this.updateBus(c, time);
      });
    }
    dispose() {
      this.silence(); this.master.disconnect();
      this.buses.forEach(b => { b.gain.disconnect(); b.mute.disconnect(); b.pan.disconnect(); });
    }
    updateBus(channel, time) {
      const s = this.states[channel], b = this.buses[channel];
      b.gain.gain.setValueAtTime(s.volume * s.expression, time);
      b.pan.pan.setValueAtTime(s.pan, time);
    }
    mute(channel, value, time = this.context.currentTime) {
      this.buses[channel].mute.gain.setValueAtTime(value ? 0 : 1, time);
    }
    bend(channel, time) {
      const s = this.states[channel];
      for (const v of this.active(time)) if (v.channel === channel && v.note >= 0) {
        v.source.frequency.setValueAtTime(frequency(v.note) * Math.pow(2, s.bend * s.bendRange / 8192 / 12), time);
      }
    }
    noteOn(e, time, snapshot = null) {
      const s = this.states[e.channel], program = snapshot ? snapshot.program : s.program;
      this.allocate(time);
      const source = this.context.createOscillator(), gain = this.context.createGain();
      const wave = this.wave(program), env = this.envelope(program);
      const peak = e.velocity / 127 * wave.gain / 255 * 0.9;
      const v = {id: ++this.serial, channel: e.channel, note: e.note, velocity: e.velocity, program,
        source, gain, env, peak, wave, start: time, end: Infinity, releaseTime: null,
        keyDown: !(snapshot && snapshot.held), held: !!(snapshot && snapshot.held)};
      source.setPeriodicWave(this.periodic(program, this.instrumentSet));
      source.frequency.setValueAtTime(frequency(e.note) * Math.pow(2, s.bend * s.bendRange / 8192 / 12), time);
      const age = snapshot ? Math.max(0, snapshot.age || 0) : 0;
      v.start = time - age;
      gain.gain.setValueAtTime(Math.max(1e-6, this.amplitudeAt(v, time)), time);
      if (env.a > age) gain.gain.linearRampToValueAtTime(peak, v.start + env.a);
      if (env.a + env.d > age) gain.gain.exponentialRampToValueAtTime(Math.max(1e-6, peak * env.s), v.start + env.a + env.d);
      if (env.s === 0 && env.a + env.d <= age) gain.gain.setValueAtTime(0, time);
      source.connect(gain).connect(this.buses[e.channel].gain);
      source.start(time); this.own(v); return v;
    }
    noteOff(channel, note, time) {
      const v = this.voices.find(x => x.channel === channel && x.note === note && x.keyDown && x.end > time);
      if (!v) return;
      v.keyDown = false;
      if (this.states[channel].sustain) v.held = true; else this.release(v, time);
    }
    noise(duration) {
      const c = this.context, b = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
      const data = b.getChannelData(0); let lfsr = 0x7fff;
      for (let i = 0; i < data.length; i++) {
        lfsr = (lfsr >> 1) | (((lfsr ^ (lfsr >> 1)) & 1) << 14);
        data[i] = lfsr & 1 ? 0.78 : -0.78;
      }
      return b;
    }
    drumPart(e, time, kind, duration, level, pitch, endPitch) {
      this.allocate(time);
      const c = this.context, source = kind === 'noise' ? c.createBufferSource() : c.createOscillator();
      if (kind === 'noise') source.buffer = this.noise(duration);
      else {
        source.type = 'square'; source.frequency.setValueAtTime(pitch, time);
        source.frequency.exponentialRampToValueAtTime(endPitch, time + duration * 0.7);
      }
      const gain = c.createGain(), peak = e.velocity / 127 * level;
      gain.gain.setValueAtTime(peak, time);
      gain.gain.exponentialRampToValueAtTime(1e-6, time + duration);
      source.connect(gain).connect(this.buses[e.channel].gain);
      source.start(time); source.stop(time + duration);
      this.own({id: ++this.serial, source, gain, channel: e.channel, note: -1, drumNote: e.note,
        velocity: e.velocity, program: 0, peak, start: time, end: time + duration,
        env: {a: 0, d: duration, s: 0, r: 0}, keyDown: false, held: false, releaseTime: time});
    }
    drum(e, time) {
      // Deliberately retain approximation labels. Removed the invented parity-based PC50 mapping.
      this.warnings.add('Percussion is approximate; special drum program 50 is not decoded');
      const n = e.note;
      if (n === 35 || n === 36) this.drumPart(e, time, 'tone', 0.14, 0.55, n === 35 ? 92 : 110, 43);
      else if (n === 38 || n === 40) {
        this.drumPart(e, time, 'noise', 0.10, 0.38);
        this.drumPart(e, time, 'tone', 0.085, 0.22, n === 38 ? 185 : 205, 105);
      } else if (n === 42 || n === 44) this.drumPart(e, time, 'noise', 0.045, 0.20);
      else if (n === 46) this.drumPart(e, time, 'noise', 0.17, 0.18);
      else if (n === 49 || n === 57) this.drumPart(e, time, 'noise', 0.28, 0.22);
      else if ([41, 43, 45, 47, 48, 50].includes(n)) {
        const f = 72 + (n - 41) * 17; this.drumPart(e, time, 'tone', 0.13, 0.32, f * 1.28, f);
      } else this.drumPart(e, time, 'noise', 0.065, 0.18);
    }
    event(e, time) {
      if (e.type === 'sysex') { this.warnings.add('SysEx not synthesized'); return; }
      const s = this.states[e.channel]; if (!s) return;
      if (e.type === 'program') s.program = e.value; // Existing voices retain their snapshot.
      else if (e.type === 'bend') { s.bend = e.value; this.bend(e.channel, time); }
      else if (e.type === 'on') {
        if (e.channel % 16 === 9) this.drum(e, time); else this.noteOn(e, time);
      } else if (e.type === 'off') {
        if (e.channel % 16 !== 9) this.noteOff(e.channel, e.note, time);
      } else if (e.type === 'cc') {
        const c = e.controller, value = e.value;
        if (c === 7) s.volume = value / 127;
        else if (c === 11) s.expression = value / 127;
        else if (c === 10) s.pan = (value - 64) / (value < 64 ? 64 : 63);
        else if (c === 64) {
          s.sustain = value !== 0; // GXSCC's documented Hold 1 convention, not generic MIDI's threshold.
          if (!s.sustain) for (const v of this.voices) if (v.channel === e.channel && v.held) this.release(v, time);
        } else if (c === 101) s.rpnMSB = value;
        else if (c === 100) s.rpnLSB = value;
        else if (c === 6 && s.rpnMSB === 0 && s.rpnLSB === 0) {
          s.bendRange = clamp(value, 0, 24); this.bend(e.channel, time);
        } else if (c === 121) {
          Object.assign(s, {bend: 0, bendRange: 2, expression: 1, sustain: false, rpnMSB: 127, rpnLSB: 127});
          for (const v of this.voices) if (v.channel === e.channel && v.held) this.release(v, time);
          this.bend(e.channel, time);
        } else if (c === 120 || c === 123) {
          for (const v of this.voices) if (v.channel === e.channel && v.end > time) {
            if (c === 120) this.release(v, time, true);
            else if (v.note >= 0 && v.keyDown) {
              v.keyDown = false; if (s.sustain) v.held = true; else this.release(v, time);
            }
          }
        }
        if ([7, 11, 10, 121].includes(c)) this.updateBus(e.channel, time);
      }
    }
    restore(events, position, time) {
      this.reset(time);
      const notes = [];
      for (const e of events) {
        if (e.time >= position) break;
        if (e.type === 'on' && e.channel % 16 !== 9) {
          notes.push({...e, program: this.states[e.channel].program, down: true, held: false});
        } else if (e.type === 'off') {
          const n = notes.find(x => x.channel === e.channel && x.note === e.note && x.down);
          if (n) { n.down = false; n.held = this.states[e.channel].sustain; }
        } else if (e.type !== 'on') {
          this.event(e, time);
          if (e.type === 'cc') {
            for (const n of notes) if (n.channel === e.channel) {
              if (e.controller === 120) { n.down = false; n.held = false; }
              if (e.controller === 123) { n.down = false; n.held = this.states[e.channel].sustain; }
              if ((e.controller === 64 && !e.value) || e.controller === 121) n.held = false;
            }
          }
        }
      }
      for (const n of notes.filter(n => n.down || n.held).slice(-46)) {
        this.noteOn(n, time, {program: n.program, held: n.held, age: position - n.time});
      }
      // Seeking restarts oscillator phase and excludes already-releasing/percussion tails.
    }
  }

  class Transport {
    constructor(context, synth, midi) {
      this.context = context; this.synth = synth; this.midi = midi;
      this.state = 'stopped'; this.offset = 0; this.anchor = 0; this.next = 0;
      this.queue = Promise.resolve(); this.repeat = false;
    }
    command(fn) { const result = this.queue.then(fn); this.queue = result.catch(() => {}); return result; }
    get position() {
      return this.state === 'playing' ? this.offset + this.context.currentTime - this.anchor : this.offset;
    }
    play() { return this.command(async () => {
      if (this.state === 'playing') return;
      if (this.offset >= this.midi.duration + 8) { this.offset = 0; this.next = 0; this.synth.reset(); }
      // Set anchor before resume; time starts advancing when resume resolves.
      this.anchor = this.context.currentTime; this.state = 'playing';
      try { await this.context.resume(); } catch (e) { this.state = 'paused'; throw e; }
      this.tick();
    }); }
    pause() { return this.command(async () => {
      if (this.state !== 'playing') return;
      await this.context.suspend();
      this.offset = this.position; // Uses our own state, never the already-paused GUI state.
      this.state = 'paused';
    }); }
    stop() { return this.command(async () => {
      await this.context.suspend(); this.synth.reset();
      this.offset = 0; this.next = 0; this.state = 'stopped';
    }); }
    seek(position) { return this.command(async () => {
      const wasPlaying = this.state === 'playing';
      await this.context.suspend();
      this.offset = clamp(Number(position) || 0, 0, this.midi.duration);
      this.anchor = this.context.currentTime;
      this.synth.restore(this.midi.events, this.offset, this.anchor);
      this.next = this.midi.events.findIndex(e => e.time >= this.offset);
      if (this.next < 0) this.next = this.midi.events.length;
      this.state = wasPlaying ? 'playing' : 'paused';
      if (wasPlaying) await this.context.resume();
      this.tick();
    }); }
    tick() {
      if (this.state !== 'playing') return;
      const now = this.position;
      while (this.next < this.midi.events.length && this.midi.events[this.next].time <= now + 0.12) {
        const e = this.midi.events[this.next++];
        this.synth.event(e, this.anchor + e.time - this.offset < this.context.currentTime ? this.context.currentTime : this.anchor + e.time - this.offset);
      }
      if (now >= this.midi.duration && !this.ending) {
        const active = this.synth.active();
        // Release malformed hanging Note Ons at EOT; retain finite release tails.
        for (const v of active) if (v.end === Infinity) this.synth.release(v, this.context.currentTime);
        if (!this.synth.active().length || now >= this.midi.duration + 8) {
          this.ending = true;
          const action = this.repeat ? this.seek(0) : this.stop();
          action.finally(() => { this.ending = false; });
        }
      }
    }
  }

  async function renderMidi(midi, data, options = {}) {
    const rate = options.sampleRate || 44100, tail = options.tailSeconds === undefined ? 8 : options.tailSeconds;
    if (![22050, 44100, 48000].includes(rate)) throw new Error('Choose 22050, 44100 or 48000 Hz');
    const seconds = midi.duration + tail;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 900) throw new Error('Offline export supports up to 15 minutes including tail');
    const c = new root.OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
    const synth = new Synth(c, data, options);
    (options.muted || []).forEach(channel => synth.mute(channel, true, 0));
    for (const e of midi.events) synth.event(e, e.time);
    for (const v of synth.voices) if (v.end === Infinity) synth.release(v, midi.duration);
    return c.startRendering();
  }
  function wav(buffer) {
    const length = buffer.length, channels = buffer.numberOfChannels;
    const out = new ArrayBuffer(44 + length * channels * 2), v = new DataView(out);
    const text = (p, s) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };
    text(0, 'RIFF'); v.setUint32(4, out.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
    v.setUint32(24, buffer.sampleRate, true); v.setUint32(28, buffer.sampleRate * channels * 2, true);
    v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true); text(36, 'data'); v.setUint32(40, out.byteLength - 44, true);
    const samples = Array.from({length: channels}, (_, i) => buffer.getChannelData(i));
    for (let i = 0, p = 44; i < length; i++) for (let ch = 0; ch < channels; ch++, p += 2) {
      const x = clamp(samples[ch][i], -1, 1); v.setInt16(p, Math.round(x < 0 ? x * 32768 : x * 32767), true);
    }
    return out;
  }
  root.JSSCCAudio = {VERSION, Synth, Transport, coefficients, renderMidi, wav};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.JSSCCAudio;
})(typeof window !== 'undefined' ? window : globalThis);
