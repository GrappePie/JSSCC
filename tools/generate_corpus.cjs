/* Original synthetic test notes, not copyrighted songs or original GXSCC audio. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {ev, smf, note} = require('../tests/fixtures.cjs');
const out = path.resolve(process.argv[2] || 'test-results/corpus');
fs.mkdirSync(out, {recursive: true});
const manifest = {version: 1, purpose: 'Paired GXSCC B236E and web renderer measurements',
  settings: {instrumentSet: 'SCC like Full-Set', sampleRate: 44100, channels: 2,
    webMasterGain: 0.12, tailSeconds: 8, normalization: false,
    originalSettings: 'Record all original preferences, including master level, filter and mono/stereo; do not assume equal mixer gain'},
  referenceStatus: 'No original GXSCC WAVs included or compared', files: []};
function save(name, data, description) {
  fs.writeFileSync(path.join(out, name), data);
  manifest.files.push({file: name, description, sha256: crypto.createHash('sha256').update(data).digest('hex')});
}
for (let program = 0; program < 128; program++) save('gm-' + String(program).padStart(3, '0') + '.mid',
  note({program, note: 60, velocity: 100, duration: 1920}), 'GM zero-based ' + program + ', MIDI note 60, velocity 100, held 2 seconds');
for (const velocity of [32, 64, 96, 127]) save('velocity-' + velocity + '.mid', note({program: 16, velocity, duration: 1920}),
  'Organ GM16, note60, velocity' + velocity + ', held2s');
for (let n = 35; n <= 81; n++) save('drum-' + n + '.mid', note({channel: 9, note: n, velocity: 100, duration: 960}),
  'Drum channel10, note' + n + ', velocity100; NoteOff at1s');
for (const [controller, name] of [[7, 'volume'], [11, 'expression'], [10, 'pan']]) save('cc-' + name + '.mid', smf([[
  ...ev(0, 0xc0, 16), ...ev(0, 0x90, 60, 100), ...ev(960, 0xb0, controller, 0),
  ...ev(960, 0xb0, controller, 127), ...ev(960, 0x80, 60, 0), ...ev(480, 0xff, 0x2f, 0)
]]), 'Held organ6s; CC' + controller + '=0 at2s and127 at4s');
save('hold-release.mid', smf([[
  ...ev(0, 0xc0, 16), ...ev(0, 0xb0, 64, 127), ...ev(0, 0x90, 60, 100),
  ...ev(960, 0x80, 60, 0), ...ev(960, 0xb0, 64, 0), ...ev(480, 0xff, 0x2f, 0)
]]), 'Hold1 on; key release at2s; pedal off at4s');
save('bend-12.mid', smf([[
  ...ev(0, 0xc0, 16), ...ev(0, 0xb0, 101, 0), ...ev(0, 0xb0, 100, 0), ...ev(0, 0xb0, 6, 12),
  ...ev(0, 0x90, 69, 100), ...ev(960, 0xe0, 127, 127), ...ev(960, 0xe0, 0, 64),
  ...ev(960, 0x80, 69, 0), ...ev(480, 0xff, 0x2f, 0)
]]), 'RPN0,0 bend12; A4, maxbend at2s, centered at4s, off at6s');
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({midiFiles: manifest.files.length, directory: out, originalWavs: 0}));
