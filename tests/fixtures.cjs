'use strict';
const u16 = n => [n >> 8 & 255, n & 255];
const u32 = n => [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255];
function vlq(n) { const a = [n & 127]; while ((n = Math.floor(n / 128)) > 0) a.unshift((n & 127) | 128); return a; }
const ev = (dt, ...bytes) => [...vlq(dt), ...bytes];
function smf(tracks, division = 480, format = tracks.length > 1 ? 1 : 0) {
  return Buffer.from([...Buffer.from('MThd'), ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(division),
    ...tracks.flatMap(t => [...Buffer.from('MTrk'), ...u32(t.length), ...t])]);
}
function note({program = 0, note = 60, velocity = 100, duration = 960, channel = 0} = {}) {
  return smf([[...ev(0, 0xc0 | channel, program), ...ev(0, 0x90 | channel, note, velocity),
    ...ev(duration, 0x80 | channel, note, 0), ...ev(480, 0xff, 0x2f, 0)]]);
}
module.exports = {u16, u32, vlq, ev, smf, note};
