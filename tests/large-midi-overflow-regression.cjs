'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {smf, ev} = require('./fixtures.cjs');
const {parseMidi} = require('../js/midi-core.js');

test('large Format-1 silent overflow tracks cannot cut audible channels', () => {
  const tracks = Array.from({length: 33}, () => []);
  tracks[0] = [
    ...ev(0, 0xc0, 10),
    ...ev(0, 0x90, 60, 100),
    ...ev(480, 0x80, 60, 0),
    ...ev(0, 0xff, 0x2f, 0)
  ];
  // A late track with no audible Note On reuses channel 0 and sends what a
  // standards-compliant player would treat as Note Offs. In large exports this
  // can otherwise terminate notes from the real audible track.
  tracks[16] = [
    ...ev(0, 0xff, 0x03, 5, 70, 108, 117, 116, 101),
    ...ev(0, 0xd0, 73),
    ...ev(0, 0x90, 60, 0),
    ...ev(0, 0x90, 60, 0),
    ...ev(0, 0xff, 0x2f, 0)
  ];
  // Online Sequencer-style third-bank marker: E0 plus one program-like byte;
  // the following high-bit byte is the next VLQ delta, not pitch-bend data.
  tracks[32] = [
    ...ev(0, 0xff, 0x03, 8, 84, 114, 105, 97, 110, 103, 108, 101),
    0, 0xe0, 80,
    0x81, 0x00, 0xb0, 45, 0,
    0, 0xa0, 45, 0,
    0, 0xff, 0x2f, 0
  ];
  const midi = parseMidi(smf(tracks));
  assert.deepEqual(midi.events.map(e => e.type), ['program', 'on', 'off']);
  assert.equal(midi.events[1].velocity, 100);
  assert.equal(midi.compatibility.ignoredSilentOverflowTracks, 2);
  assert.ok(midi.warnings.some(w => /silent overflow track/i.test(w)));
});
