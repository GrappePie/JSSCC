/* Generated from the supplied, byte-verified B236E JSON by tools/regenerate_data.py.
 * Exact table bytes are not proof of exact synthesis. Envelope units remain assumed.
 */
(function (root) {
  'use strict';
  const names = ["SQUARE 50%","SQUARE 25%","SQUARE 12%","TRIANGLE","TRIANGLE HIGH","PURE SIN","X6 SQUARE","RANDOM SQUARE","RIGHT-DOWN SAW","HENSOKU SQUARE","HENSOKU SIN","CHURCH SIN","METAL SIN","ROUNDED SAW","SCRATCH SIN","BIG SAWED SQUARE","SIN OR 2X","TRIANGLE OR 2X","SIN AND TRIANGLE 2X","LINNER SQUARE 25","DISTORTION 1","SIN AND 2X SAW","ROUNDED SQUARE 50%","TOGE SIN","TOGE AND BIG SIN","TOGETOGE AND BIG SIN","DISTORTION TRIANGLE","ELGUIZA","OSAKANA","HARMONICA","DISTORTION 2","SLAP","PULSE SQUARE 50%"];
  const bankNames = ["SCC like Full-Set","Famicom like Set","All Square Set","All Triangle Set","All Steel Set","All HyperSin Set","All Sin Set","All PulsedSquare Set"];
  const gains = [98,103,109,255,255,230,100,100,130,80,120,140,160,140,128,100,240,230,100,100,100,140,140,110,160,150,130,130,90,100,110,250,196];
  const waveBytes = "cHBwcHBwcHBwcHBwcHBwcICAgICAgICAgICAgICAgIBwcHBwcHBwcICAgICAgICAgICAgICAgICAgICAgICAgHBwcHCAgICAgICAgICAgICAgICAgICAgICAgICAgICAABAgMEBQYHB/cGBQQDAgEADw4NDAsKCQgJCgsMDQ4PAAIEBgf2BAIADgwKCAoMDgACBAYH9gQCAA4MCggKDA4AAZMUdaanV9f311alpHMRkA58+5ppaLg4CDi5amuc/nAAAAAABwcAAAgICAAAAAAHBwcACAgAAAAABwcAAAgIAAAACAAHBwcAAAAIAAAACAgICAAICAAAAAAICAgACAgICAkJCgoLCwwMDQ0ODg8PAAABAQICAwMEBAUFBgYHBwYGBgYGBgYGCAgICAgICAgGBgYICAgGBgYGBggICAgIAAMFBgcGBQMADQsKCQoLDQAEBgcGBAAMCgkKDAAHAAkABwUCBQcDAAUH9gEDBAALAQYADg8ACwkMAQ4KDA8MCgMFBQMAAAEEBgcGAw8ODgACAgEMCgkKDAAADQsLDQAACgkJCQoKCwsMDA0NDg4PDwAAAQECAgMDBAQFBQYGBgUPAAIDDwUFDwYPBQUPAwIBDw0PCw8JDwgPCA8JDwsPDQcHBggJCQgIBAQDCAkJCAgCAgEICQkICAAADwgJCQgIAQIDBAUFBgYGBQUEAwIBAQ0LCQgICQsNAQMFBgYFAwEAAQIDBAUGBwf3BgUEAwIBAA4MCggKDA4AAgQGB/YEAgABkxR1pqdX1/fXVqWkcxGQDgwKCAoMDgACBAYH9gQCAA8ODQwLCgkICAgICAgICAgICAgICAgIB/cGBQQDAgEICwwBAaKiwaAODQ4CJTcHVwMeqAiIqMjgB/dXNiAMCQABkxR1pqdX1/fXVqWkcxGYCQoLDA0ODwABAgMEBQYHAATmJtdXp9fn9+fXp1bWJOALGdkoqFgoGAgYKFipKdsYDIIH8wyICQqMDgACA4UGBweHx/fHhwYFA4IADgwKiQAEB/QBAB6tbDua+knJWPioaDgYOGio+VnKSvucPW6v8AQH9AAMD/wAXr1sO5r6SclY+JhIGEiY+VnKSvucPW6oDEwMAG5DAacDpAQPwWwJDEwMAE6DAYcDxAQP4T4KCQAEB/QAHAgcABQH9AAcABQAHgASAB8AEQAf////9AQEAAMPAwQFBgYHB5cHhAAAAOcINgUAAAACZ0goRlZOSThIAAAABwcAAAgICAAAAAAHBwcIB/gIDAACA0QDQgAMCAAEB/QAHAgcABQH9AAcABQAHgASAB8AAAAAB/f39/f39weHBkUEAg2pCEkKrA4PAEIATw3MCsjoGQ2iBAUGRweH9/f39/f39/f39/f39/f38AAAAAAAAAAAAAAAAAAAAA";
  const mapBytes = "BQMDAQoKBgcCAwMDAwECAgwMDAsAAh0CFhUWAgMeHgQQHxERHx8SEBMTDRIIBQMDCBkTGBYVFgEJFxwcCRcXGRgZGRccFwEFFgUFAwEBAwUACAEAAgIAAwIAAAACAgABAgECAAACAwIHAgYGAgIDAwEAAwMDAwUbGhsdBAYNGwoDAwMBAQECAgIDAwMDAQICAwMDAAACAAIDAwECAwICAwMDAwMDAwMDAAAAAAAAAwMAAAAAAwMBAQICAgIBAQEBAQEBAgMBAQMDAwMDAQEDBQAAAQACAgADAgAAAAICAAECAQIAAAIDAgICAgICAgMDAQADAwMDAwAAAgEAAwICAg==";
  const envelopeRecords = [[0,3649,40647,132300,2205],[0,3649,44647,88200,1764],[0,3649,44647,176400,1764],[0,3649,44647,132300,2646],[0,4410,24647,110250,1764],[882,4410,65535,0,1764],[0,4649,34647,88200,1985],[0,0,65535,22050,1985],[0,1323,54647,264600,882],[0,4649,54647,441000,882],[0,4649,64647,441000,1323],[0,3649,44647,441000,1323],[0,2649,44647,441000,1323],[0,5649,44647,441000,1323],[0,1649,34647,441000,1323],[0,4649,64647,0,1985],[1764,0,65535,0,1764],[0,4410,30000,441000,882],[0,4410,20000,13230,882],[1764,0,65535,0,882],[2646,0,65535,0,882],[1764,0,65535,0,1323],[2205,0,65535,44100,441],[441,4649,54647,0,1985],[1323,4649,54647,0,1985],[441,4649,64647,0,1985],[0,0,65535,0,1985],[0,0,8647,0,12985]];
  const envelopeRuns = [[6,0],[1,1],[2,2],[1,3],[6,4],[8,5],[4,6],[1,7],[2,8],[1,9],[1,10],[1,11],[1,12],[1,13],[2,14],[2,15],[5,16],[1,17],[2,18],[1,19],[1,20],[4,21],[1,15],[1,22],[1,23],[1,24],[2,23],[1,24],[3,25],[16,15],[2,26],[40,15],[1,27],[3,15],[1,27],[1,15]];
  const decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
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
    sourceSha256: "1eeeecf6ff72f34841983e05579114159748c70d0b3725d85af3301004992f7a",
    referenceSampleRate: 44100, referenceSampleRateIsAssumed: true,
    wavetables: Object.freeze(wavetables), instrumentSets: Object.freeze(instrumentSets), envelopes: Object.freeze(envelopes)
  });
})(typeof window !== 'undefined' ? window : globalThis);
