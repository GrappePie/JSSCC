'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {ev, smf, note} = require('./fixtures.cjs');
require('../js/gxscc-exact-data.js');
const D = globalThis.GXSCC_EXACT_DATA;
const {parseMidi} = require('../js/midi-core.js');
const {Synth, Transport, coefficients, wav} = require('../js/audio-core.js');
const root = path.resolve(__dirname, '..');
class Param {
  constructor() { this.value = 1; this.events = []; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exponential', v, t]); return this; }
  cancelScheduledValues(t) { this.events = this.events.filter(e => e[2] < t); return this; }
  cancelAndHoldAtTime(t) { this.events.push(['hold', null, t]); return this; }
}
class Node {
  constructor() { this.gain = new Param(); this.pan = new Param(); this.frequency = new Param(); this.connections = []; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; }
  start(time) { this.startTime = time; }
  stop(time) { this.stopTime = time; }
  setPeriodicWave(wave) { this.wave = wave; }
}
class Context {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.destination = new Node(); this.state = 'suspended'; }
  createGain() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createOscillator() { return new Node(); }
  createBufferSource() { return new Node(); }
  createPeriodicWave(real, imag) { return {real, imag}; }
  createBuffer(channels, length, rate) { const d = new Float32Array(length); return {getChannelData: () => d, sampleRate: rate}; }
  async suspend() { this.state = 'suspended'; }
  async resume() { this.state = 'running'; }
}
const setup = () => { const c = new Context(); return {c, s: new Synth(c, D)}; };
const on = (note = 60, channel = 0) => ({type: 'on', note, channel, velocity: 100});
const cc = (controller, value, channel = 0) => ({type: 'cc', controller, value, channel});
for (const file of ['js/gxscc-exact-data.js', 'js/midi-core.js', 'js/audio-core.js', 'js/gxscc-exact-engine-v3.js']) {
  test('valid syntax: ' + file, () => new vm.Script(fs.readFileSync(path.join(root, file), 'utf8')));
}
test('all runtime scripts in index exist', () => {
  for (const m of fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/src="\.\/(.*?)"/g)) {
    assert.ok(fs.existsSync(path.join(root, m[1].split('?')[0])), m[1]);
  }
});
test('33 signed-byte waves and eight complete 128-program banks', () => {
  assert.equal(D.wavetables.length, 33); assert.equal(D.envelopes.length, 128); assert.equal(D.instrumentSets.length, 8);
  D.wavetables.forEach(w => { assert.equal(w.samples.length, 32); assert.ok(w.samples.every(n => n >= -128 && n <= 127)); });
  D.instrumentSets.forEach(s => { assert.equal(s.map.length, 128); assert.ok(s.map.every(n => n < 33)); });
});
test('header and track count parse valid format 0 without undeclared variables', () => {
  const m = parseMidi(note()); assert.equal(m.trackCount, 1); assert.equal(m.ppq, 480); assert.equal(m.events.length, 3); assert.equal(m.duration, 1.5);
});
test('running status and velocity-zero Note Off', () => {
  const m = parseMidi(smf([[...ev(0, 0x90, 60, 90), ...ev(480, 60, 0), ...ev(0, 0xff, 0x2f, 0)]]));
  assert.deepEqual(m.events.map(e => e.type), ['on', 'off']);
});
test('program changes at one tick preserve authored order', () => {
  const m = parseMidi(smf([[...ev(0, 0x90, 60, 90), ...ev(0, 0xc0, 10), ...ev(0, 0x90, 64, 90)]]));
  assert.deepEqual(m.events.map(e => e.type), ['on', 'program', 'on']);
});
test('tempo map combines parallel tracks', () => {
  const m = parseMidi(smf([[...ev(0, 0xff, 81, 3, 7, 161, 32), ...ev(480, 0xff, 81, 3, 15, 66, 64)],
    [...ev(0, 0x90, 60, 90), ...ev(960, 0x80, 60, 0)]]));
  assert.equal(m.trackCount, 2); assert.equal(m.events[1].time, 1.5);
});
test('SysEx length is read before calculating payload end', () => {
  const m = parseMidi(smf([[...ev(0, 0xf0, 3, 0x7d, 0x01, 0xf7), ...ev(0, 0x90, 60, 100)]]));
  assert.equal(m.events[1].type, 'on'); assert.deepEqual(m.events[0].data, [0x7d, 1, 0xf7]);
});
test('two MIDI ports map to independent channels', () => {
  const m = parseMidi(smf([[...ev(0, 0xff, 33, 1, 1), ...ev(0, 0x90, 60, 100)]]));
  assert.equal(m.events[0].channel, 16);
});
test('SMPTE division uses frames instead of tempo', () => {
  const m = parseMidi(smf([[...ev(1000, 0x90, 60, 100)]], 0xe728)); assert.equal(m.events[0].time, 1);
});
test('format 2 rejected instead of incorrectly mixing independent tracks', () => assert.throws(() => parseMidi(smf([[]], 480, 2)), /formats 0 and 1/));
test('zero timing division rejected', () => assert.throws(() => parseMidi(smf([[]], 0)), /division/));
test('truncated header rejected', () => assert.throws(() => parseMidi(Buffer.from('MThd')), /Truncated/));
test('truncated track rejected, never silently clamped', () => assert.throws(() => parseMidi(note().subarray(0, 28)), /Truncated/));
test('unterminated VLQ rejected', () => assert.throws(() => parseMidi(smf([[255, 255, 255, 255, 0]])), /four bytes/));
test('channel events cannot overrun their track', () => assert.throws(() => parseMidi(smf([[0, 0x90, 60], [0, 0x90, 64, 90]])), /Truncated/));
test('invalid channel data byte rejected', () => assert.throws(() => parseMidi(smf([[0, 0x90, 128, 90]])), /data byte/));
test('zero tempo rejected', () => assert.throws(() => parseMidi(smf([[0, 255, 81, 3, 0, 0, 0]])), /tempo/));
test('all 33 Fourier reconstructions match the DC-removed source samples', () => {
  for (const w of D.wavetables) {
    const {real, imag} = coefficients(w.samples), mean = w.samples.reduce((a, b) => a + b) / 32 / 128;
    for (let i = 0; i < 32; i++) {
      let value = 0; for (let k = 1; k <= 16; k++) value += real[k] * Math.cos(2 * Math.PI * k * i / 32) + imag[k] * Math.sin(2 * Math.PI * k * i / 32);
      assert.ok(Math.abs(value - (w.samples[i] / 128 - mean)) < 1e-6, w.name + ' sample ' + i);
    }
  }
});
test('CC7/11/10 automate the bus used by already sounding notes', () => {
  const {s} = setup(); s.event(on(), 0); const v = s.voices[0];
  s.event(cc(7, 0), 0.3); s.event(cc(11, 64), 0.4); s.event(cc(10, 0), 0.5);
  assert.equal(v.gain.connections[0], s.buses[0].gain);
  assert.ok(s.buses[0].gain.gain.events.some(e => e[1] === 0 && e[2] === 0.3));
  assert.equal(s.buses[0].pan.pan.value, -1);
});
test('mute affects sound bus separately from future MIDI volume changes', () => {
  const {s} = setup(); s.mute(0, true, 0.2); s.event(cc(7, 127), 1); assert.equal(s.buses[0].mute.gain.value, 0);
});
test('program change leaves existing voice waveform unchanged', () => {
  const {s} = setup(); s.event(on(), 0); const v = s.voices[0], wave = v.source.wave;
  s.event({type: 'program', channel: 0, value: 56}, 0.1); s.event(on(64), 0.2);
  assert.equal(v.program, 0); assert.equal(v.source.wave, wave); assert.equal(s.voices[1].program, 56);
});
test('release tails remain counted until their scheduled end', () => {
  const {s} = setup(); s.event(on(), 0); s.event({type: 'off', channel: 0, note: 60}, 0.1);
  assert.equal(s.active(0.125).length, 1); assert.equal(s.active(0.151).length, 0);
});
test('one Note Off does not terminate every overlapping same-pitch voice', () => {
  const {s} = setup(); s.event(on(), 0); s.event(on(), 0.1); s.event({type: 'off', channel: 0, note: 60}, 0.2);
  assert.equal(s.voices.filter(v => v.keyDown).length, 1);
});
test('Hold 1 with value 1 sustains, reset releases it', () => {
  const {s} = setup(); s.event(on(), 0); s.event(cc(64, 1), 0.1); s.event({type: 'off', channel: 0, note: 60}, 0.2);
  assert.equal(s.voices[0].held, true); s.event(cc(121, 0), 0.3); assert.equal(s.voices[0].releaseTime, 0.3);
});
test('RPN sensitivity changes active pitch bend', () => {
  const {s} = setup(); s.event(on(69), 0); s.event(cc(101, 0), 0); s.event(cc(100, 0), 0); s.event(cc(6, 12), 0);
  s.event({type: 'bend', channel: 0, value: 4096}, 0.2);
  assert.ok(Math.abs(s.voices[0].source.frequency.value - 440 * Math.SQRT2) < 1e-5);
});
test('two snare components consume two slots', () => { const {s} = setup(); s.event(on(38, 9), 0); assert.equal(s.active(0.01).length, 2); });
test('46-slot limit includes releasing voices', () => {
  const {s} = setup(); for (let i = 0; i < 50; i++) { s.event(on(40 + i), 0); s.event({type: 'off', channel: 0, note: 40 + i}, 0.01); }
  assert.ok(s.active(0.02).length <= 46);
});
test('silence also cancels future sources that allocator has pruned', () => {
  const {s} = setup(); s.event(on(), 1); const first = s.voices[0]; s.release(first, 2, true); s.event(on(70), 3);
  assert.ok(!s.voices.includes(first)); s.silence(0); assert.equal(first.source.stopTime, 0);
});
test('pause at ten seconds freezes position, resume continues', async () => {
  const {c, s} = setup(), t = new Transport(c, s, {duration: 60, events: []});
  await t.play(); c.currentTime = 10; await t.pause(); assert.equal(t.position, 10);
  assert.equal(t.state, 'paused'); await t.play(); c.currentTime = 13; assert.equal(t.position, 13);
});
test('pause does not discard sounding notes', async () => {
  const {c, s} = setup(), t = new Transport(c, s, {duration: 60, events: [{...on(), time: 0}]});
  await t.play(); c.currentTime = 1; await t.pause(); assert.equal(s.active().length, 1); await t.play(); assert.equal(s.active().length, 1);
});
test('stop resets position and kills all sources', async () => {
  const {c, s} = setup(), t = new Transport(c, s, {duration: 60, events: [{...on(), time: 0}]});
  await t.play(); c.currentTime = 4; await t.stop(); assert.equal(t.position, 0); assert.equal(s.active().length, 0);
});
test('rapid play-pause-play is serialized', async () => {
  const {c, s} = setup(), t = new Transport(c, s, {duration: 60, events: []});
  await Promise.all([t.play(), t.pause(), t.play()]); assert.equal(t.state, 'playing'); assert.equal(c.state, 'running');
});
test('seek restores program, controller and held note state', async () => {
  const {c, s} = setup();
  const m = {duration: 60, events: [{type: 'program', channel: 0, value: 56, time: 0}, {...on(), time: 0}, {...cc(7, 64), time: 1}]};
  const t = new Transport(c, s, m); await t.seek(5);
  assert.equal(t.position, 5); assert.equal(s.states[0].volume, 64 / 127); assert.equal(s.voices[0].program, 56); assert.equal(s.voices[0].note, 60);
});
test('generated WAV has correct PCM header and zero samples', () => {
  const b = {length: 100, sampleRate: 44100, numberOfChannels: 2, getChannelData: () => new Float32Array(100)};
  const out = Buffer.from(wav(b)); assert.equal(out.toString('ascii', 0, 4), 'RIFF'); assert.equal(out.length, 444);
  assert.equal(out.readUInt32LE(24), 44100); assert.equal(out.readUInt16LE(22), 2); assert.ok(out.subarray(44).every(x => x === 0));
});

test('all runtime data matches the byte-verified B236E dump digest', () => {
  const hash = require('node:crypto').createHash('sha256').update(JSON.stringify(D)).digest('hex');
  assert.equal(hash, '0d751ab90311fee90c9cb9c613c6159e9c4d08d8d554cfa270a5e6e750be7766');
});

test('B236E fifth field is key-off release, fourth is held-key decay', () => {
  const {s} = setup(); const e = s.envelope(0);
  assert.equal(e.tail, 3); assert.equal(e.r, 0.05);
  assert.equal(s.envelope(16).tail, 0); assert.equal(s.envelope(16).r, 0.04);
});
test('piano held-key stage decays linearly and naturally terminates', () => {
  const {s} = setup(); const v = s.noteOn(on(), 0);
  const t = v.env.a + v.env.d;
  assert.ok(Math.abs(s.amplitudeAt(v, t + 1.5) - v.peak * v.env.s / 2) < 1e-9);
  assert.ok(Math.abs(v.end - (3649 / 44100 + 3)) < 1e-9);
  assert.equal(s.active(3.1).length, 0);
});
test('organ zero held-key decay means sustain, not an immediate cut', () => {
  const {s} = setup(); s.states[0].program = 16; const v = s.noteOn(on(), 0);
  assert.equal(s.amplitudeAt(v, 1), s.amplitudeAt(v, 20)); assert.equal(v.end, Infinity);
});
test('key-off anchors gain before scheduling a linear release', () => {
  const {s} = setup(); const v = s.noteOn(on(), 0); const value = s.amplitudeAt(v, 2);
  s.noteOff(0, 60, 2);
  const events = v.gain.gain.events;
  assert.ok(events.some(e => e[0] === 'set' && e[2] === 2 && Math.abs(e[1] - value) < 1e-9));
  assert.deepEqual(events.at(-1), ['linear', 0, 2.05]);
  assert.ok(Math.abs(s.amplitudeAt(v, 2.025) - value / 2) < 1e-9);
});
test('early note-off during attack releases from the current level', () => {
  const {s} = setup(); s.states[0].program = 40; const v = s.noteOn(on(), 0);
  s.noteOff(0, 60, 0.02);
  assert.ok(Math.abs(v.releaseLevel / v.peak - 0.5) < 1e-9);
  assert.ok(Math.abs(v.end - 0.06) < 1e-9);
});
test('seek restores the natural-decay stage instead of a constant sustain', () => {
  const {s} = setup(); const v = s.noteOn(on(), 10, {program: 0, age: 2});
  assert.ok(Math.abs(v.end - (8 + 3649 / 44100 + 3)) < 1e-9);
  assert.ok(s.amplitudeAt(v, 10) < v.peak * v.env.s / 2);
});
test('standard kick35 and kick36 share the decoded recipe', () => {
  const {s} = setup(); assert.deepEqual(s.drumRecipes(35), s.drumRecipes(36));
  assert.deepEqual(s.drumRecipes(35)[0], ['tone', 540, 38, 1.8, -0.004, 0]);
});
test('standard toms, crash and ride use distinct decoded recipes', () => {
  const {s} = setup(); assert.equal(s.drumRecipes(41)[0][2], 50);
  assert.equal(s.drumRecipes(45)[0][2], 58); assert.equal(s.drumRecipes(50)[0][2], 66);
  assert.equal(s.drumRecipes(49)[0][1], 15000); assert.equal(s.drumRecipes(51)[0][2], 120);
});
test('all standard drum notes render finite buffers at supported sample rates', () => {
  for (const rate of [22050, 44100, 48000]) {
    const {c, s} = setup(); c.sampleRate = rate;
    for (let n = 0; n < 128; n++) {
      s.drum({...on(n, 9), velocity: 127}, n);
      for (const v of s.active(n)) assert.ok(v.source.buffer.getChannelData(0).every(Number.isFinite));
    }
  }
});
test('zero initial volume creates no invalid drum divisions or voices', () => {
  const {s} = setup(); s.states[9].volume = 0; s.drum(on(38, 9), 0);
  assert.equal(s.voices.length, 0);
});
