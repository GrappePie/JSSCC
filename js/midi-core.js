/* Standard MIDI File parser. No audio, DOM, network, or third-party dependencies. */
(function (root) {
  'use strict';
  function parseMidi(input, fileName = 'MIDI') {
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) :
      ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
    if (!bytes) throw new TypeError('Expected an ArrayBuffer or typed array');
    if (bytes.length > 16 * 1024 * 1024) throw new Error('MIDI exceeds the 16 MiB limit');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 0, limit = bytes.length, serial = 0, maximumTick = 0;
    const need = n => { if (n < 0 || p + n > limit) throw new Error('Truncated MIDI at byte ' + p); };
    const byte = () => { need(1); return bytes[p++]; };
    const u16 = () => { need(2); const n = view.getUint16(p); p += 2; return n; };
    const u32 = () => { need(4); const n = view.getUint32(p); p += 4; return n; };
    const tag = () => String.fromCharCode(byte(), byte(), byte(), byte());
    const vlq = () => {
      let value = 0;
      for (let i = 0; i < 4; i++) {
        const b = byte(); value = value * 128 + (b & 127);
        if (!(b & 128)) return value;
      }
      throw new Error('MIDI variable-length value exceeds four bytes');
    };
    const dataByte = () => { const n = byte(); if (n & 128) throw new Error('Invalid MIDI data byte'); return n; };
    if (tag() !== 'MThd') throw new Error('Not a Standard MIDI File (MThd missing)');
    const headerLength = u32();
    if (headerLength < 6) throw new Error('Invalid MIDI header length');
    need(headerLength);
    const format = u16();
    const numberOfTracks = u16();
    const division = u16();
    p += headerLength - 6;
    if (format > 1) throw new Error('Only synchronous MIDI formats 0 and 1 are supported; format 2 is independent sequences');
    if (!numberOfTracks || (format === 0 && numberOfTracks !== 1)) throw new Error('Invalid MIDI track count');
    if (!division) throw new Error('MIDI timing division cannot be zero');
    let ticksPerSecond = 0;
    if (division & 0x8000) {
      const frames = 256 - (division >> 8), ticks = division & 255;
      if (![24, 25, 29, 30].includes(frames) || !ticks) throw new Error('Invalid SMPTE timing');
      ticksPerSecond = (frames === 29 ? 30000 / 1001 : frames) * ticks;
    }
    const raw = [], tempos = [{tick: 0, us: 500000, order: -1}], warnings = new Set();
    const push = e => {
      if (serial >= 500000) throw new Error('MIDI exceeds the 500000-event limit');
      raw.push({...e, order: serial++});
    };
    for (let track = 0; track < numberOfTracks; track++) {
      limit = bytes.length;
      // Unknown chunks may be skipped, but never read beyond their declared bounds.
      let kind = tag(), size = u32(); need(size);
      while (kind !== 'MTrk') {
        p += size; kind = tag(); size = u32(); need(size);
        warnings.add('Unknown MIDI chunk skipped');
      }
      const end = p + size;
      limit = end;
      let tick = 0, running = 0, port = 0;
      while (p < end) {
        tick += vlq(); maximumTick = Math.max(maximumTick, tick);
        let status = byte();
        if (status < 128) {
          if (!running) throw new Error('Running status without a channel status');
          p--; status = running;
        } else if (status < 240) running = status;
        if (status === 255) {
          const type = byte(), length = vlq(); need(length);
          if (type === 81) {
            if (length !== 3) throw new Error('Invalid MIDI tempo length');
            const us = bytes[p] * 65536 + bytes[p + 1] * 256 + bytes[p + 2];
            if (!us) throw new Error('MIDI tempo cannot be zero');
            tempos.push({tick, us, order: serial++});
          } else if (type === 33) {
            if (length !== 1) throw new Error('Invalid MIDI port metadata');
            port = bytes[p];
            if (port > 1) warnings.add('Ports above 1 are ignored (32-channel player)');
          }
          p += length;
          if (type === 47) {
            if (length !== 0) throw new Error('Invalid end-of-track length');
            break;
          }
          continue;
        }
        if (status === 240 || status === 247) {
          running = 0;
          const length = vlq(); // Read first: computing p + vlq() uses the old p.
          need(length);
          push({tick, type: 'sysex', data: Array.from(bytes.subarray(p, p + length)), status, port});
          p += length;
          warnings.add('SysEx is preserved; support depends on the selected audio engine');
          continue;
        }
        if (status >= 240) throw new Error('Unsupported MIDI system status ' + status);
        const type = status & 240, channel = port * 16 + (status & 15);
        const x = dataByte(), y = type === 192 || type === 208 ? 0 : dataByte();
        if (port > 1) continue;
        if (type === 144 || type === 128) push({tick, type: type === 128 || y === 0 ? 'off' : 'on', channel, note: x, velocity: y});
        else if (type === 192) push({tick, type: 'program', channel, value: x});
        else if (type === 176) push({tick, type: 'cc', channel, controller: x, value: y});
        else if (type === 224) push({tick, type: 'bend', channel, value: (y * 128 + x) - 8192});
        else warnings.add('Aftertouch is not synthesized');
      }
      p = end;
    }
    tempos.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const map = [];
    for (const t of tempos) {
      if (map.length && map[map.length - 1].tick === t.tick) map[map.length - 1] = t;
      else map.push(t);
    }
    let seconds = 0;
    for (let i = 0; i < map.length; i++) {
      if (i) seconds += (map[i].tick - map[i - 1].tick) * map[i - 1].us / (division * 1e6);
      map[i].seconds = seconds;
    }
    function toSeconds(tick) {
      if (ticksPerSecond) return tick / ticksPerSecond;
      let lo = 0, hi = map.length - 1;
      while (lo < hi) {
        const m = Math.ceil((lo + hi) / 2);
        if (map[m].tick <= tick) lo = m; else hi = m - 1;
      }
      return map[lo].seconds + (tick - map[lo].tick) * map[lo].us / (division * 1e6);
    }
    // Preserve the sequence within a track at the same tick: do not move a future
    // program/CC ahead of a Note On merely because its event type sorts first.
    raw.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const events = raw.map(e => ({...e, time: toSeconds(e.tick)}));
    const duration = toSeconds(maximumTick);
    if (!Number.isFinite(duration) || duration > 21600) throw new Error('MIDI duration exceeds six hours');
    return {format, trackCount: numberOfTracks, ppq: ticksPerSecond ? null : division,
      division, duration, events, tempoEvents: tempos.filter(t => t.order >= 0).map(t => ({...t})), maximumTick, warnings: [...warnings], fileName};
  }
  root.JSSCCParser = {parseMidi};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.JSSCCParser;
})(typeof window !== 'undefined' ? window : globalThis);
