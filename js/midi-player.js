/* JSSCC browser MIDI loader/player for static hosting.
 * Dependency-free Standard MIDI File parser + lightweight Web Audio chiptune synth.
 */
(function () {
  "use strict";

  const LOOKAHEAD = 0.18;
  const SCHEDULER_MS = 40;
  const MAX_POLYPHONY = 96;

  let audioCtx = null;
  let midi = null;
  let playbackStartCtx = 0;
  let playbackOffset = 0;
  let nextEventIndex = 0;
  let scheduler = null;
  let activeVoices = new Map();
  let lastPlayState = null;
  let lastUiPosition = 0;
  let seekingInternally = false;

  function getUi() {
    return window.ui || (typeof ui !== "undefined" ? ui : null);
  }

  function getAudioContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio is not supported by this browser.");
      audioCtx = new AC();
    }
    return audioCtx;
  }

  async function unlockAudio() {
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") await ctx.resume();
    } catch (err) {
      console.error(err);
    }
  }

  function readU16(view, pos) {
    return view.getUint16(pos, false);
  }

  function readU32(view, pos) {
    return view.getUint32(pos, false);
  }

  function readVar(data, state) {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      if (state.pos >= data.length) throw new Error("Unexpected end of MIDI file.");
      const b = data[state.pos++];
      value = (value << 7) | (b & 0x7f);
      if (!(b & 0x80)) return value;
    }
    return value;
  }

  function bytesToText(bytes) {
    try { return new TextDecoder("latin1").decode(bytes); }
    catch (_) {
      let out = "";
      for (const b of bytes) out += String.fromCharCode(b);
      return out;
    }
  }

  function parseMidi(arrayBuffer, fileName) {
    const data = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    let p = 0;

    function tag() {
      const s = String.fromCharCode(data[p], data[p + 1], data[p + 2], data[p + 3]);
      p += 4;
      return s;
    }

    if (tag() !== "MThd") throw new Error("This is not a Standard MIDI file (missing MThd header).");
    const headerLen = readU32(view, p); p += 4;
    if (headerLen < 6) throw new Error("Invalid MIDI header.");
    const format = readU16(view, p); p += 2;
    const trackCount = readU16(view, p); p += 2;
    const division = readU16(view, p); p += 2;
    p += headerLen - 6;

    if (division & 0x8000) throw new Error("SMPTE-time MIDI files are not supported yet.");
    if (format > 2) throw new Error("Unsupported MIDI format: " + format);

    const ppq = division;
    const rawEvents = [];
    const tempos = [{ tick: 0, usPerBeat: 500000 }];
    let title = fileName.replace(/\.(mid|midi)$/i, "");

    for (let t = 0; t < trackCount; t++) {
      if (p + 8 > data.length || tag() !== "MTrk") throw new Error("Invalid MIDI track chunk.");
      const len = readU32(view, p); p += 4;
      const end = Math.min(p + len, data.length);
      const state = { pos: p };
      let tick = 0;
      let running = 0;

      while (state.pos < end) {
        tick += readVar(data, state);
        if (state.pos >= end) break;

        let status = data[state.pos++];
        if (status < 0x80) {
          if (!running) throw new Error("Invalid MIDI running status.");
          state.pos--;
          status = running;
        } else if (status < 0xf0) {
          running = status;
        }

        if (status === 0xff) {
          const type = data[state.pos++];
          const metaLen = readVar(data, state);
          const start = state.pos;
          const stop = Math.min(start + metaLen, end);
          if (type === 0x51 && metaLen === 3) {
            const tempo = (data[start] << 16) | (data[start + 1] << 8) | data[start + 2];
            tempos.push({ tick, usPerBeat: tempo });
          } else if ((type === 0x03 || type === 0x01) && !title && metaLen) {
            title = bytesToText(data.slice(start, stop));
          }
          state.pos = stop;
          if (type === 0x2f) break;
          continue;
        }

        if (status === 0xf0 || status === 0xf7) {
          const sysexLen = readVar(data, state);
          state.pos = Math.min(state.pos + sysexLen, end);
          continue;
        }

        const kind = status & 0xf0;
        const channel = status & 0x0f;
        const a = data[state.pos++];
        const b = (kind === 0xc0 || kind === 0xd0) ? 0 : data[state.pos++];

        if (kind === 0x90) {
          rawEvents.push({ tick, type: b === 0 ? "off" : "on", channel, note: a, velocity: b });
        } else if (kind === 0x80) {
          rawEvents.push({ tick, type: "off", channel, note: a, velocity: b });
        } else if (kind === 0xc0) {
          rawEvents.push({ tick, type: "program", channel, value: a });
        } else if (kind === 0xb0) {
          rawEvents.push({ tick, type: "cc", channel, controller: a, value: b });
        } else if (kind === 0xe0) {
          rawEvents.push({ tick, type: "bend", channel, value: ((b << 7) | a) - 8192 });
        }
      }
      p = end;
    }

    tempos.sort((a, b) => a.tick - b.tick);
    const compactTempos = [];
    for (const tp of tempos) {
      if (compactTempos.length && compactTempos[compactTempos.length - 1].tick === tp.tick) {
        compactTempos[compactTempos.length - 1] = tp;
      } else compactTempos.push(tp);
    }

    let tempoSeconds = 0;
    for (let i = 0; i < compactTempos.length; i++) {
      const tp = compactTempos[i];
      if (i > 0) {
        const prev = compactTempos[i - 1];
        tempoSeconds += ((tp.tick - prev.tick) * prev.usPerBeat) / (ppq * 1000000);
      }
      tp.seconds = tempoSeconds;
    }

    function tickToSeconds(tick) {
      let lo = 0, hi = compactTempos.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (compactTempos[mid].tick <= tick) lo = mid; else hi = mid - 1;
      }
      const tp = compactTempos[lo];
      return tp.seconds + ((tick - tp.tick) * tp.usPerBeat) / (ppq * 1000000);
    }

    rawEvents.sort((a, b) => a.tick - b.tick || eventOrder(a.type) - eventOrder(b.type));
    const events = rawEvents.map(e => Object.assign({}, e, { time: tickToSeconds(e.tick) }));
    const duration = events.length ? events[events.length - 1].time + 0.5 : 0;

    return { format, ppq, trackCount, events, duration, title, fileName };
  }

  function eventOrder(type) {
    if (type === "off") return 0;
    if (type === "cc" || type === "program" || type === "bend") return 1;
    return 2;
  }

  function midiFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  const channelState = Array.from({ length: 16 }, () => ({
    program: 0, volume: 100 / 127, expression: 1, pan: 0, bend: 0
  }));

  function waveformFor(channel, program) {
    if (channel === 9) return "square";
    const group = Math.floor(program / 8);
    if (group === 4 || group === 5) return "sawtooth";
    if (group === 9 || group === 10) return "triangle";
    if (group === 11 || group === 12) return "square";
    return program % 3 === 0 ? "square" : (program % 3 === 1 ? "triangle" : "sawtooth");
  }

  function waveFunction(type) {
    if (typeof Waveform === "undefined") return null;
    if (type === "triangle") return Waveform.triangle;
    if (type === "sawtooth") return function (x) { return ((x % 1) * 2) - 1; };
    return Waveform.square;
  }

  function voiceKey(channel, note) {
    return channel + ":" + note;
  }

  function stopVoice(key, when) {
    const voice = activeVoices.get(key);
    if (!voice) return;
    const t = Math.max(getAudioContext().currentTime, when || getAudioContext().currentTime);
    try {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), t);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      voice.osc.stop(t + 0.035);
    } catch (_) {}
    activeVoices.delete(key);
  }

  function allNotesOff() {
    const ctx = audioCtx;
    if (!ctx) return;
    for (const key of Array.from(activeVoices.keys())) stopVoice(key, ctx.currentTime);
    activeVoices.clear();
    const u = getUi();
    if (u && u.song) {
      for (const ch of u.song.channels) {
        ch.volume = 0;
        ch.expression = 0;
        ch.output = 0;
        ch.poly = 0;
      }
    }
  }

  function noteOn(e, when) {
    const ctx = getAudioContext();
    if (activeVoices.size >= MAX_POLYPHONY) {
      const oldest = activeVoices.keys().next().value;
      if (oldest) stopVoice(oldest, when);
    }
    const key = voiceKey(e.channel, e.note);
    stopVoice(key, when);

    const st = channelState[e.channel];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const type = waveformFor(e.channel, st.program);
    osc.type = type;
    const bendSemitones = st.bend * 2 / 8192;
    osc.frequency.setValueAtTime(midiFreq(e.note) * Math.pow(2, bendSemitones / 12), when);

    const velocity = e.velocity / 127;
    const amp = Math.max(0.0001, velocity * st.volume * st.expression * (e.channel === 9 ? 0.08 : 0.11));
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(amp, when + 0.006);

    if (panner) {
      panner.pan.setValueAtTime(st.pan, when);
      osc.connect(gain).connect(panner).connect(ctx.destination);
    } else {
      osc.connect(gain).connect(ctx.destination);
    }
    osc.start(when);
    activeVoices.set(key, { osc, gain, panner, channel: e.channel, note: e.note, velocity: e.velocity });
    osc.onended = () => activeVoices.delete(key);

    updateUiChannel(e.channel, e.note, e.velocity, type);
  }

  function updateUiChannel(channel, note, velocity, waveType) {
    const u = getUi();
    if (!u || !u.song) return;
    const displayIndex = channel;
    const ch = u.song.channels[displayIndex];
    if (!ch) return;
    const st = channelState[channel];
    ch.volume = velocity / 127;
    ch.expression = st.expression;
    ch.output = Math.max(0, Math.min(1, (velocity / 127) * st.volume * st.expression));
    ch.freq = Math.round(midiFreq(note));
    ch.panpot = st.pan;
    ch.pitchbend = st.bend / 8192;
    ch.percussion = channel === 9 ? 1 : 0;
    ch.drum = channel === 9;
    ch.wave = waveFunction(waveType);
    ch.poly = Array.from(activeVoices.values()).filter(v => v.channel === channel).length;
  }

  function applyEvent(e, when) {
    const st = channelState[e.channel];
    if (e.type === "program") {
      st.program = e.value;
    } else if (e.type === "cc") {
      if (e.controller === 7) st.volume = e.value / 127;
      else if (e.controller === 11) st.expression = e.value / 127;
      else if (e.controller === 10) st.pan = Math.max(-1, Math.min(1, (e.value - 64) / 63));
      else if (e.controller === 120 || e.controller === 123) {
        for (const [key, voice] of Array.from(activeVoices.entries())) {
          if (voice.channel === e.channel) stopVoice(key, when);
        }
      }
    } else if (e.type === "bend") {
      st.bend = e.value;
    } else if (e.type === "on") {
      noteOn(e, when);
    } else if (e.type === "off") {
      stopVoice(voiceKey(e.channel, e.note), when);
    }
  }

  function eventIndexAt(seconds) {
    if (!midi) return 0;
    let lo = 0, hi = midi.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (midi.events[mid].time < seconds) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  function currentPlaybackSeconds() {
    if (!audioCtx || !midi) return playbackOffset;
    const u = getUi();
    if (u && u.song && u.song.playState === PlayState.PLAYING) {
      return Math.max(0, playbackOffset + audioCtx.currentTime - playbackStartCtx);
    }
    return playbackOffset;
  }

  function setPosition(seconds) {
    if (!midi) return;
    playbackOffset = Math.max(0, Math.min(midi.duration, seconds));
    nextEventIndex = eventIndexAt(playbackOffset);
    allNotesOff();
    if (audioCtx) playbackStartCtx = audioCtx.currentTime;
  }

  function startPlayback() {
    if (!midi) return;
    unlockAudio();
    if (playbackOffset >= midi.duration - 0.01) setPosition(0);
    const ctx = getAudioContext();
    playbackStartCtx = ctx.currentTime;
    nextEventIndex = eventIndexAt(playbackOffset);
    if (!scheduler) scheduler = setInterval(scheduleAhead, SCHEDULER_MS);
    scheduleAhead();
  }

  function pausePlayback() {
    playbackOffset = currentPlaybackSeconds();
    allNotesOff();
  }

  function stopPlayback(reset) {
    allNotesOff();
    if (reset) setPosition(0);
  }

  function scheduleAhead() {
    const u = getUi();
    if (!midi || !audioCtx || !u || !u.song || u.song.playState !== PlayState.PLAYING) return;
    const nowSong = currentPlaybackSeconds();
    const horizon = nowSong + LOOKAHEAD;

    while (nextEventIndex < midi.events.length && midi.events[nextEventIndex].time <= horizon) {
      const e = midi.events[nextEventIndex++];
      const when = audioCtx.currentTime + Math.max(0, e.time - nowSong);
      applyEvent(e, when);
    }

    if (midi.duration > 0) {
      const pos = Math.min(1, nowSong / midi.duration);
      seekingInternally = true;
      u.song.position = pos;
      lastUiPosition = pos;
      seekingInternally = false;
    }

    if (nowSong >= midi.duration) {
      if (u.song.repeat) {
        setPosition(0);
        playbackStartCtx = audioCtx.currentTime;
      } else {
        u.song.playState = PlayState.STOPPED;
        stopPlayback(true);
      }
    }
  }

  function syncWithExistingUi() {
    const u = getUi();
    if (!u || !u.song || typeof PlayState === "undefined") return;
    const state = u.song.playState;
    if (lastPlayState === null) lastPlayState = state;

    if (state !== lastPlayState) {
      if (state === PlayState.PLAYING) startPlayback();
      else if (state === PlayState.PAUSED) pausePlayback();
      else if (state === PlayState.STOPPED) stopPlayback(true);
      else if (state === PlayState.FASTFORWARD && midi) {
        setPosition(currentPlaybackSeconds() + 10);
        u.song.playState = PlayState.PLAYING;
        startPlayback();
      }
      lastPlayState = u.song.playState;
    }

    if (midi && !seekingInternally && Math.abs((u.song.position || 0) - lastUiPosition) > 0.015) {
      const target = Math.max(0, Math.min(1, u.song.position || 0)) * midi.duration;
      setPosition(target);
      lastUiPosition = u.song.position || 0;
      if (u.song.playState === PlayState.PLAYING && audioCtx) playbackStartCtx = audioCtx.currentTime;
    }
  }

  function refreshRenderer() {
    const u = getUi();
    if (!u || !u.renderer || !u.renderer.initialized) return;
    try {
      for (let i = 0; i < 16; i++) u.renderer.drawChannel(i);
      u.renderer.drawDGroup("positionSlider");
    } catch (_) {}
  }

  async function loadFile(file) {
    if (!file) return;
    if (!/\.(mid|midi)$/i.test(file.name)) {
      showToast("Please drop a .mid or .midi file", true);
      return;
    }
    try {
      showToast("Loading " + file.name + "…");
      const buffer = await file.arrayBuffer();
      const parsed = parseMidi(buffer, file.name);
      if (!parsed.events.some(e => e.type === "on")) throw new Error("No note events were found in this MIDI.");

      stopPlayback(true);
      midi = parsed;
      playbackOffset = 0;
      nextEventIndex = 0;
      for (const st of channelState) Object.assign(st, { program: 0, volume: 100 / 127, expression: 1, pan: 0, bend: 0 });

      const u = getUi();
      if (u && u.song) {
        u.song.fileName = parsed.fileName;
        u.song.position = 0;
        u.song.playState = PlayState.STOPPED;
      }
      lastPlayState = PlayState.STOPPED;
      lastUiPosition = 0;
      refreshRenderer();
      showToast("Loaded: " + parsed.fileName + " — " + formatTime(parsed.duration));
    } catch (err) {
      console.error(err);
      showToast("Could not load MIDI: " + (err && err.message ? err.message : err), true);
    }
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }

  let toastTimer = null;
  function showToast(text, error) {
    let el = document.getElementById("midi-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "midi-toast";
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)",
        zIndex: "9999", font: "14px monospace", padding: "9px 13px", border: "1px solid currentColor",
        background: "rgba(0,0,0,.86)", color: "#fff", pointerEvents: "none",
        maxWidth: "calc(100vw - 30px)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
      });
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.color = error ? "#ff8b8b" : "#fff";
    el.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = "0"; }, error ? 5000 : 3000);
  }

  function makeDropOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "midi-drop-overlay";
    overlay.textContent = "DROP MIDI FILE";
    Object.assign(overlay.style, {
      display: "none", position: "fixed", inset: "12px", zIndex: "9998",
      alignItems: "center", justifyContent: "center", border: "3px dashed currentColor",
      background: "rgba(0,0,0,.68)", color: "white", font: "bold 26px monospace",
      pointerEvents: "none"
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function initInput() {
    const overlay = makeDropOverlay();
    let dragDepth = 0;

    window.addEventListener("dragenter", e => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) {
        e.preventDefault();
        dragDepth++;
        overlay.style.display = "flex";
      }
    });
    window.addEventListener("dragover", e => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
    window.addEventListener("dragleave", e => {
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) overlay.style.display = "none";
    });
    window.addEventListener("drop", e => {
      e.preventDefault();
      dragDepth = 0;
      overlay.style.display = "none";
      unlockAudio();
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      loadFile(file);
    });

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".mid,.midi,audio/midi,audio/x-midi";
    picker.hidden = true;
    picker.addEventListener("change", () => {
      unlockAudio();
      loadFile(picker.files && picker.files[0]);
      picker.value = "";
    });
    document.body.appendChild(picker);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "LOAD MIDI";
    button.title = "Load a MIDI file (you can also drag and drop it anywhere)";
    Object.assign(button.style, {
      position: "fixed", right: "12px", bottom: "12px", zIndex: "9997",
      font: "bold 12px monospace", padding: "7px 10px", cursor: "pointer",
      border: "1px solid currentColor", background: "rgba(0,0,0,.72)", color: "white"
    });
    button.addEventListener("click", () => picker.click());
    document.body.appendChild(button);

    document.addEventListener("pointerdown", unlockAudio, { passive: true });
  }

  window.JSSCCMidi = { loadFile, parseMidi, get current() { return midi; } };

  window.addEventListener("DOMContentLoaded", () => {
    initInput();
    setInterval(syncWithExistingUi, 40);
    setInterval(refreshRenderer, 100);
    showToast("Drop a .mid/.midi file anywhere, or click LOAD MIDI");
  });
})();
