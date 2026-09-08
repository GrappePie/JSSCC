/* Browser integration for the audited experimental player. Historical filename kept
 * for compatibility; the visible VERSION identifies the actual implementation. */
(function () {
  'use strict';
  const D = window.GXSCC_EXACT_DATA, A = window.JSSCCAudio, P = window.JSSCCParser;
  if (!D || !A || !P) throw new Error('JSSCC: data, parser or audio module missing');
  let midi = null, context = null, synth = null, transport = null, instrumentSet = 0;
  let requestId = 0, lastUiState = 0, pending = 0, exporting = false;
  let picker, status, seekBar, controls, gainInput, versionLabel, engineSelect;
  const monitor = new window.JSSCCUIMonitor.Monitor();
  let flowLabel = null;
  let engineMode = window.JSSCC_DEFAULT_ENGINE === 'legacy' ? 'legacy' : 'pcm';
  let initializing = null, pcmDuration = null;
  const selectedAudio = () => engineMode === 'pcm' ? window.JSSCCPCMBridge : A;
  const duration = () => midi ? (engineMode === 'pcm' ? (pcmDuration ?? midi.duration) : midi.duration) : 0;
  const version = () => engineMode === 'pcm' ? JSSCCPCM.VERSION : A.VERSION;
  const muted = Array(32).fill(false);
  const getUi = () => window.ui || null;
  const stateNumber = s => ({stopped: 0, paused: 1, playing: 2}[s]);
  function message(text, bad = false) {
    if (!status) return;
    status.textContent = text; status.dataset.error = String(bad);
  }
  function setUiState(n) {
    lastUiState = n; const u = getUi(); if (u && u.song) u.song.playState = n;
  }
  async function ensureAudio() {
    if (transport) return;
    if (initializing) return initializing;
    const mode=engineMode, loaded=midi;
    initializing=(async()=>{
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Este navegador no admite Web Audio');
      if (!context) context = new AC({sampleRate: 44100});
      if (mode === 'pcm') await JSSCCPCMBridge.prepare(context);
      if (loaded !== midi || mode !== engineMode) return;
      synth = mode === 'pcm' ? new JSSCCPCMBridge.Synth(context,D,loaded,{instrumentSet,masterGain:Number(gainInput.value)}) :
        new A.Synth(context,D,{instrumentSet,masterGain:Number(gainInput.value)});
      muted.forEach((m,c)=>synth.mute(c,m));
      const EngineTransport = mode === 'pcm' ? JSSCCPCMBridge.Transport : A.Transport;
      transport = new EngineTransport(context,synth,loaded);
    })().finally(()=>{initializing=null;});
    return initializing;
  }
  async function setEngine(value) {
    if (!['pcm','legacy'].includes(value)) throw new Error('Motor inválido');
    if (value === engineMode) return;
    pending++;
    try {
      if (initializing) await initializing;
      if (transport) await transport.stop();
      if (synth) synth.dispose();
      transport=null;synth=null;engineMode=value;setUiState(0);
      engineSelect.value=value;versionLabel.textContent='Experimental · '+version()+' · UI '+JSSCCUIMonitor.VERSION+' · equivalencia completa no validada';
      if (midi) { seekBar.value=0; seekBar.dataset.last='0'; const u=getUi(); if(u&&u.song)u.song.position=0; }
      message(value==='pcm'?'PCM B236E: oscilador y mezcla enteros; reloj y controladores compatibles. Ruido y casos especiales aún experimentales.':'Motor Web Audio anterior seleccionado.');
    } finally {pending--;}
  }
  async function request(action, value) {
    if (!midi) { message('Carga primero un archivo .mid o .midi'); setUiState(0); return false; }
    pending++;
    try {
      await ensureAudio();
      if (!transport) return false;
      const u = getUi(); transport.repeat = !!(u && u.song.repeat);
      if (action === 'play') { setUiState(2); await transport.play(); }
      if (action === 'pause') { setUiState(1); await transport.pause(); }
      if (action === 'stop') { setUiState(0); await transport.stop(); }
      if (action === 'seek') await transport.seek(value);
      setUiState(stateNumber(transport.state));
      return true;
    } catch (error) {
      message(error.message, true); console.error(error); return false;
    } finally { pending--; }
  }
  async function loadFile(file) {
    const id = ++requestId;
    if (!file || !/\.(mid|midi)$/i.test(file.name)) { message('Selecciona un archivo .mid o .midi', true); return false; }
    if (file.size > 16 * 1024 * 1024) { message('El MIDI supera 16 MiB', true); return false; }
    try {
      const parsed = P.parseMidi(await file.arrayBuffer(), file.name);
      if (!parsed.events.some(e => e.type === 'on')) throw new Error('El archivo no contiene notas');
      const compiledDuration=JSSCCPCM.compile(parsed).duration;
      if (id !== requestId) return false;
      if (initializing) await initializing;
      if (transport) await transport.stop();
      if (id !== requestId) return false;
      if (synth) synth.dispose(); synth = null; transport = null;
      midi = parsed; pcmDuration = compiledDuration; setUiState(0);
      const u = getUi();
      if (u && u.song) { u.song.fileName = parsed.fileName; u.song.position = 0; }
      seekBar.value = 0; seekBar.dataset.last = '0';
      const note = parsed.warnings.length ? ' · Avisos: ' + parsed.warnings.join('; ') : '';
      message('Cargado: ' + parsed.fileName + ' · ' + parsed.trackCount + ' pistas' + note);
      return true;
    } catch (error) {
      if (id === requestId) message('No se pudo cargar: ' + error.message, true);
      return false; // Keep the previous playable MIDI intact on a bad input.
    }
  }
  async function exportWav() {
    if (!midi || exporting) return false;
    exporting = true;
    const loaded = midi, selected = instrumentSet, gain = Number(gainInput.value), renderer=selectedAudio();
    const button = document.getElementById('jsscc-export'); button.disabled = true;
    try {
      message('Generando WAV con el motor web experimental…');
      const buffer = await renderer.renderMidi(loaded, D, {sampleRate: 44100, instrumentSet: selected, masterGain: gain, muted: muted.flatMap((m, i) => m ? [i] : [])});
      const blob = new Blob([renderer.wav(buffer)], {type: 'audio/wav'}), url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = loaded.fileName.replace(/\.(mid|midi)$/i, '') + '-web.wav';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      message('WAV exportado · 44100 Hz, estéreo, PCM 16-bit · sin normalización automática');
      return true;
    } catch (error) { message('No se pudo exportar: ' + error.message, true); return false; }
    finally { exporting = false; button.disabled = false; }
  }
  function instrument(value) {
    if (!Number.isInteger(Number(value)) || value < 0 || value >= D.instrumentSets.length) throw new Error('Invalid instrument set');
    instrumentSet = Number(value);
    if (synth) synth.instrumentSet = instrumentSet;
    const select = document.getElementById('jsscc-set'); if (select) select.value = String(value);
    // A new set only affects future notes; never silence an already-playing song.
  }
  function renderUi(now = performance.now()) {
    const u = getUi(); if (!u || !u.song) return;
    if (!pending && u.song.playState !== lastUiState) {
      const requested = u.song.playState; lastUiState = requested;
      if (requested === 2) request('play');
      else if (requested === 1) request('pause');
      else if (requested === 0) request('stop');
      else if (requested === 3 && midi) request('seek', (transport ? transport.position : 0) + 10).then(() => request('play'));
    }
    if (transport) {
      transport.repeat = !!u.song.repeat;
      const external = u.song.position || 0;
      if (!pending && duration() && Math.abs(external - Number(seekBar.dataset.last || 0)) > 0.002) {
        request('seek', external * duration());
      }
      transport.tick();
      const p = Math.min(1, transport.position / Math.max(0.001, duration()));
      if (document.activeElement !== seekBar) seekBar.value = String(p);
      u.song.position = p; seekBar.dataset.last = String(p);
      if (!pending) setUiState(stateNumber(transport.state));
    }
    u.song.channels.forEach((ch, i) => {
      if (ch.mute !== muted[i]) { muted[i] = !!ch.mute; if (synth) synth.mute(i, muted[i]); }
    });
    const health=monitor.update({now,song:u.song,synth,context,transport,midi,mode:engineMode,muted,gain:Number(gainInput.value),data:D});
    if(flowLabel){
      const labels={active:'Audio activo',stopped:'Detenido',paused:'Pausado',starting:'Iniciando audio',suspended:'Audio suspendido','telemetry-stale':'Telemetría sin actualizar',underrun:'Interrupción reportada por el navegador'};
      const count=u.song.channels.reduce((n,ch)=>n+ch.poly,0);
      const text='POLY '+count+' / '+(engineMode==='pcm'?45:46)+' · '+(labels[health.status]||health.status);
      if(flowLabel.textContent!==text)flowLabel.textContent=text;
      flowLabel.dataset.state=health.status;
    }
    if (u.renderer && u.renderer.initialized) {
      try { monitor.panel.draw(u.renderer,u.song); } catch (error) { message('Error del panel: ' + error.message, true); }
    }
  }

  function setup() {
    controls = document.createElement('section'); controls.className = 'jsscc-controls'; controls.setAttribute('aria-label', 'Controles MIDI');
    const row = document.createElement('div'); row.className = 'jsscc-control-row'; controls.appendChild(row);
    function button(id, text, fn) {
      const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = text;
      b.addEventListener('click', fn); row.appendChild(b); return b;
    }
    picker = document.createElement('input'); picker.type = 'file'; picker.accept = '.mid,.midi'; picker.id = 'jsscc-file'; picker.hidden = true;
    picker.addEventListener('change', () => { loadFile(picker.files[0]); picker.value = ''; });
    controls.appendChild(picker);
    button('jsscc-load', 'Cargar MIDI', () => picker.click());
    button('jsscc-play', 'Reproducir', () => request('play'));
    button('jsscc-pause', 'Pausar', () => request('pause'));
    button('jsscc-stop', 'Detener', () => request('stop'));
    button('jsscc-export', 'Exportar WAV', exportWav);
    const select = document.createElement('select'); select.id = 'jsscc-set'; select.setAttribute('aria-label', 'Banco de instrumentos');
    D.instrumentSets.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s.name; select.appendChild(o); });
    select.onchange = () => instrument(Number(select.value)); row.appendChild(select);
    engineSelect=document.createElement('select');engineSelect.id='jsscc-engine';engineSelect.setAttribute('aria-label','Motor de audio');
    for(const [value,text] of [['pcm','PCM B236E · experimental'],['legacy','Anterior · Web Audio']]){const o=document.createElement('option');o.value=value;o.textContent=text;engineSelect.appendChild(o);}
    engineSelect.value=engineMode;engineSelect.onchange=()=>setEngine(engineSelect.value).catch(e=>message(e.message,true));row.appendChild(engineSelect);
    const label = document.createElement('label'); label.textContent = 'Nivel de salida ';
    gainInput = document.createElement('input'); gainInput.id = 'jsscc-gain'; gainInput.type = 'range';
    gainInput.min = '0'; gainInput.max = '0.5'; gainInput.step = '.01'; gainInput.value = '.25';
    gainInput.oninput = () => { if (synth) synth.master.gain.setValueAtTime(Number(gainInput.value), context.currentTime); };
    label.appendChild(gainInput); row.appendChild(label);
    seekBar = document.createElement('input'); seekBar.type = 'range'; seekBar.min = '0'; seekBar.max = '1'; seekBar.step = '.0001'; seekBar.value = '0';
    seekBar.id = 'jsscc-seek'; seekBar.setAttribute('aria-label', 'Posición de reproducción');
    seekBar.onchange = () => { if (midi) request('seek', Number(seekBar.value) * duration()); }; controls.appendChild(seekBar);
    status = document.createElement('p'); status.id = 'jsscc-status'; status.setAttribute('role', 'status'); controls.appendChild(status);
    versionLabel = document.createElement('small'); versionLabel.textContent = 'Experimental · ' + version() + ' · UI '+JSSCCUIMonitor.VERSION+' · equivalencia completa con GXSCC aún no validada'; controls.appendChild(versionLabel);
    flowLabel=document.createElement('output');flowLabel.id='jsscc-flow';
    flowLabel.title='BUFFER WEB: continuidad observada del flujo de audio, no ocupación de la cola WinMM del original. Una actualización atrasada no demuestra un corte audible. Los fallos de salida sólo se cuentan si el navegador los reporta.';
    flowLabel.textContent='POLY 0 · Detenido';controls.appendChild(flowLabel);
    const explanation=document.createElement('small');explanation.id='jsscc-buffer-help';
    explanation.textContent='BUFFER WEB = estado del flujo de audio; no es la cola de Windows del original.';
    controls.appendChild(explanation);
    document.body.appendChild(controls);
    const overlay = document.createElement('div'); overlay.id = 'jsscc-drop'; overlay.textContent = 'SUELTA EL MIDI AQUÍ'; document.body.appendChild(overlay);
    let depth = 0;
    window.addEventListener('dragenter', e => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); depth++; overlay.classList.add('visible'); }
    });
    window.addEventListener('dragover', e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) overlay.classList.remove('visible'); });
    window.addEventListener('drop', e => { e.preventDefault(); depth = 0; overlay.classList.remove('visible'); if (e.dataTransfer) loadFile(e.dataTransfer.files[0]); });
    // Do not resume the audio context on arbitrary pointer events: that breaks pause.
    const legacyScale = window.CanvasRenderer && window.CanvasRenderer.prototype;
    // Disable the inherited demo sine-wave meters; the audio engine supplies activity.
    if (legacyScale) legacyScale.renderFrame = function () {};
    if (legacyScale) legacyScale.rescale = function () {
      if (!this.initialized) return;
      const available = Math.max(160, innerHeight - controls.offsetHeight - 24);
      const scale = Math.max(0.25, Math.min((innerWidth - 24) / this.canvas.width, available / this.canvas.height));
      this.hitDetector.scale = this.scale = scale >= 1 ? Math.floor(scale) : scale;
      this.canvas.style.width = this.canvas.width * this.scale + 'px';
      this.canvas.style.height = this.canvas.height * this.scale + 'px';
      this.canvas.style.bottom = controls.offsetHeight + 'px';
    };
    window.dispatchEvent(new Event('resize'));
    // Hook the old export icon once its asynchronous asset/hit-region loading finishes.
    let attempts = 0;
    const connectExport = setInterval(() => {
      const u = getUi(); attempts++;
      if (u && u.renderer && u.renderer.hitDetector && u.renderer.hitDetector.regions.export) {
        try { u.renderer.hitDetector.regions.export.onmouseup.push(exportWav);
          u.renderer.canvas.addEventListener('mousemove',e=>{
            const x=e.offsetX/u.renderer.scale,y=e.offsetY/u.renderer.scale;
            if(x>=412&&x<=632&&y>=25&&y<=43)u.renderer.canvas.title=flowLabel.title;
            else if(x>=58&&x<634){
              const row=y>=217?1:0,localY=y-49-row*168;
              const i=row*16+Math.floor((x-58)/36),ch=u.song.channels[i];
              u.renderer.canvas.title=ch&&localY>=0&&localY<=13?'Canal '+(i+1)+' · '+ch.poly+' voces activas'+(ch.mute?' · silenciado':''):'';
            }else u.renderer.canvas.title='';
          });
          clearInterval(connectExport); }
        catch (_) { if (attempts > 200) clearInterval(connectExport); }
      } else if (attempts > 200) clearInterval(connectExport);
    }, 50);
    // One visual loop synchronized with repaint. Keep audio scheduling alive when
    // the tab is hidden: rAF must never be the only MIDI scheduler.
    const animate=now=>{renderUi(now);requestAnimationFrame(animate);};
    requestAnimationFrame(animate);
    setInterval(()=>{if(transport){transport.repeat=!!(getUi()&&getUi().song.repeat);transport.tick();}},25);
    message('Arrastra un MIDI a la página o pulsa Cargar MIDI');
  }
  window.JSSCCMidi = {
    loadFile, parseMidi: P.parseMidi, play: () => request('play'), pause: () => request('pause'),
    stop: () => request('stop'), seek: value => request('seek', value), exportWav,
    render: options => { if (!midi) throw new Error('No MIDI loaded'); return selectedAudio().renderMidi(midi, D, {instrumentSet, ...options}); },
    setEngine, get engine() {return engineMode;},
    get current() { return midi; }, get exactData() { return D; },
    get instrumentSet() { return instrumentSet; }, set instrumentSet(v) { instrument(v); },
    diagnostics: () => ({version: version(), engine: engineMode, duration: duration(), state: transport ? transport.state : 'stopped',
      position: transport ? transport.position : 0, contextState: context ? context.state : 'not-created',
      activeVoices: synth ? synth.active().length : 0, originalAudioCompared: true, originalAudioEquivalent: false,
      comparisonScope: '128 programs x 8 banks,45 pitch/velocity probes,mixer/control/clock cases; not full equivalence',
      pcmStats: synth && synth.stats || null,
      ui: monitor.diagnostics(),
      warnings: [...(midi ? midi.warnings : []), ...(synth ? synth.warnings : [])]})
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', setup, {once: true}); else setup();
})();
