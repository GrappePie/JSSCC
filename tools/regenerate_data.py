"""Generate browser tables from the supplied B236E JSON; never execute the EXE.
Usage: python tools/regenerate_data.py dump.json js/gxscc-exact-data.js
"""
import base64, itertools, json, pathlib, sys
r=json.loads(pathlib.Path(sys.argv[1]).read_text())
w=r['wavetables'];s=r['instrument_sets'];e=r['program_envelopes']
assert len(w)==33 and len(s)==8 and len(e)==128
waves=base64.b64encode(bytes(n&255 for x in w for n in x['samples_s8'])).decode()
maps=base64.b64encode(bytes(n for x in s[:2] for n in x['program_to_wave'])).decode()
for x,n in zip(s[2:],[0,3,12,11,5,32]): assert x['program_to_wave']==[n]*127+[0]
assert [x['flag2'] for x in w]==[4294967295 if i==15 else 0 for i in range(33)]
unique=[];ids=[]
for x in e:
    v=[x[k] for k in ['attack_samples','decay_samples','sustain_level','release_samples','unknown5']]
    if v not in unique: unique.append(v)
    ids.append(unique.index(v))
runs=[[len(list(g)),key] for key,g in itertools.groupby(ids)]
j=lambda x:json.dumps(x,separators=(',',':'))
text="""/* Generated from the supplied, byte-verified B236E JSON by tools/regenerate_data.py.
 * Exact table bytes are not proof of exact synthesis. Envelope units remain assumed.
 */
(function (root) {
  'use strict';
"""
for name,value in [('names',[x['name'] for x in w]),('bankNames',[x['name'] for x in s]),('gains',[x['amplitude_scale'] for x in w]),('waveBytes',waves),('mapBytes',maps),('envelopeRecords',unique),('envelopeRuns',runs)]:
    text+='  const '+name+' = '+j(value)+';\n'
text+="""  const decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const waveData = decode(waveBytes), mapData = decode(mapBytes);
  if (waveData.length !== 1056 || mapData.length !== 256) throw new Error('Invalid B236E data length');
  const wavetables = names.map((name, i) => ({name, gain: gains[i], flags: i === 15 ? 4294967295 : 0,
    samples: Array.from(waveData.subarray(i * 32, i * 32 + 32), n => n > 127 ? n - 256 : n)}));
  const uniform = [0, 3, 12, 11, 5, 32];
  const instrumentSets = bankNames.map((name, i) => ({name, map: i < 2 ?
    Array.from(mapData.subarray(i * 128, i * 128 + 128)) : Array.from({length: 128}, (_, p) => p === 127 ? 0 : uniform[i - 2])}));
  const envelopes = envelopeRuns.flatMap(([count, record]) => Array.from({length: count}, () => {
    const [a, d, s, r, x] = envelopeRecords[record]; return {a, d, s, r, x};
  }));
  if (envelopes.length !== 128 || instrumentSets.some(s => s.map.some(n => n >= 33))) throw new Error('Invalid B236E indices');
  for (const wave of wavetables) { Object.freeze(wave.samples); Object.freeze(wave); }
  for (const set of instrumentSets) { Object.freeze(set.map); Object.freeze(set); }
  envelopes.forEach(Object.freeze);
  root.GXSCC_EXACT_DATA = Object.freeze({
"""
text+='    sourceSha256: '+j(r['source_sha256'])+',\n'
text+="""    referenceSampleRate: 44100, referenceSampleRateIsAssumed: true,
    wavetables: Object.freeze(wavetables), instrumentSets: Object.freeze(instrumentSets), envelopes: Object.freeze(envelopes)
  });
})(typeof window !== 'undefined' ? window : globalThis);
"""
pathlib.Path(sys.argv[2]).write_text(text)
