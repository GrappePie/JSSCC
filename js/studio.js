/* JSSCC Studio composer/community UI. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const clone=v=>JSON.parse(JSON.stringify(v));
  const TRACKS=[
    {id:'pulse1',name:'PULSE 1',instrument:'square',volume:85,color:'red'},
    {id:'pulse2',name:'PULSE 2',instrument:'square',volume:72,color:'blue'},
    {id:'triangle',name:'TRIANGLE',instrument:'triangle',volume:82,color:'green'},
    {id:'noise',name:'NOISE',instrument:'noise',volume:68,color:'yellow'}
  ];
  const SCALES={
    'Chromatic':[0,1,2,3,4,5,6,7,8,9,10,11],
    'C Major':[0,2,4,5,7,9,11],'C Minor':[0,2,3,5,7,8,10],
    'D Minor':[2,4,5,7,9,10,0],'E Minor':[4,6,7,9,11,0,2],
    'F Major':[5,7,9,10,0,2,4],'G Major':[7,9,11,0,2,4,6],'A Minor':[9,11,0,2,4,5,7]
  };
  const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  let audioCtx=null,nodes=[],loopTimer=0,progressTimer=0,playing=false,startedAt=0,totalSeconds=0;
  let undo=[],redo=[],tool='paint',selectedTrack='pulse1',currentSongDetail=null,libraryMode='projects';
  function uuid(){return crypto.randomUUID?.()||('p-'+Date.now()+'-'+Math.random().toString(16).slice(2));}
  function emptyPattern(id='A'){return {id,name:id,notes:Object.fromEntries(TRACKS.map(t=>[t.id,[]]))};}
  function newProject(){return {version:1,id:uuid(),title:'Nueva canción',bpm:120,bars:4,scale:'Chromatic',grid:16,tracks:clone(TRACKS),patterns:{A:emptyPattern('A')},currentPattern:'A',structure:['A'],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
  let project=newProject();
  const pattern=()=>project.patterns[project.currentPattern];
  const track=()=>project.tracks.find(t=>t.id===selectedTrack)||project.tracks[0];
  const steps=()=>project.bars*16;
  const secPerStep=()=>60/project.bpm/4;
  const fmt=s=>{s=Math.max(0,Math.round(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
  function snapshot(){return JSON.stringify(project);}
  function mutate(fn){undo.push(snapshot());if(undo.length>60)undo.shift();redo.length=0;fn();project.updatedAt=new Date().toISOString();markDirty();renderComposer();}
  function markDirty(){ $('#saveState').textContent='sin guardar'; }
  function toast(message){let el=$('#studioToast');if(!el){el=document.createElement('div');el.id='studioToast';el.className='toast';document.body.append(el);}el.textContent=message;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2200);}
  function setView(name){$$('.view').forEach(v=>v.classList.toggle('active',v.id===name+'View'));$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(name==='explore')renderExplore();if(name==='library')renderLibrary();}
  function noteName(p){return NOTE_NAMES[p%12]+(Math.floor(p/12)-1);}
  function inScale(p){if(!$('#lockScale').checked)return true;return (SCALES[project.scale]||SCALES.Chromatic).includes(p%12);}
  function renderComposer(){
    $('#titleInput').value=project.title;$('#bpmInput').value=project.bpm;$('#barsInput').value=project.bars;$('#scaleSelect').value=project.scale;$('#gridSelect').value=project.grid||16;
    const t=track();$('#instrumentSelect').value=t.instrument;$('#trackVolume').value=t.volume;$('#timeLabel').textContent=`00:00 / ${fmt((project.structure.length||1)*project.bars*4*60/project.bpm)}`;
    renderTracks();renderPatterns();renderRoll();renderKeyboard();
  }
  function renderTracks(){
    $('#trackHeads').innerHTML=project.tracks.map((t,i)=>`<button class="track-card ${t.color} ${t.id===selectedTrack?'active':''}" data-track="${t.id}"><b>${i+1}</b><span><strong>${t.name}</strong><small>${t.instrument.toUpperCase()} · VOL ${t.volume}</small></span></button>`).join('');
    $$('#trackHeads [data-track]').forEach(b=>b.onclick=()=>{selectedTrack=b.dataset.track;renderComposer();});
  }
  function renderPatterns(){
    const ids=Object.keys(project.patterns);
    $('#patternTabs').innerHTML=ids.map(id=>`<button data-pattern="${id}" class="${id===project.currentPattern?'active':''}">PATRÓN ${id}</button>`).join('')+'<button id="quickAddPattern">＋</button>';
    $('#patternList').innerHTML=ids.map(id=>`<button data-pattern="${id}" class="pattern-row ${id===project.currentPattern?'active':''}"><b>${id}</b><span>${project.bars} compases</span></button>`).join('');
    $('#songStructure').innerHTML=project.structure.map((id,i)=>`<button data-structure="${i}" title="Click: editar patrón · clic derecho: quitar">${id}</button>`).join('');
    $$('[data-pattern]').forEach(b=>b.onclick=()=>{project.currentPattern=b.dataset.pattern;renderComposer();});
    $$('[data-structure]').forEach(b=>{b.onclick=()=>{project.currentPattern=project.structure[+b.dataset.structure];renderComposer();};b.oncontextmenu=e=>{e.preventDefault();if(project.structure.length>1)mutate(()=>project.structure.splice(+b.dataset.structure,1));};});
    $('#quickAddPattern')?.addEventListener('click',addPattern);
  }
  function pitchRange(){const center=(+$('#octaveInput').value||4)*12+12;const top=Math.min(96,center+11),bottom=Math.max(24,top-23);return Array.from({length:top-bottom+1},(_,i)=>top-i);}
  function renderRoll(){
    const pitches=pitchRange(),count=steps(),roll=$('#pianoRoll');
    roll.style.setProperty('--steps',count);roll.style.setProperty('--rows',pitches.length);
    let html='<div class="pitch-labels">'+pitches.map(p=>`<div class="pitch-label ${p%12===0?'root':''}">${noteName(p)}</div>`).join('')+'</div><div class="grid-layer">';
    for(let r=0;r<pitches.length;r++)for(let s=0;s<count;s++)html+=`<button class="cell ${s%16===0?'bar':''} ${!inScale(pitches[r])?'out-scale':''}" data-step="${s}" data-pitch="${pitches[r]}" style="grid-column:${s+1};grid-row:${r+1}"></button>`;
    html+='</div><div class="notes-layer">';
    const notes=pattern().notes[selectedTrack]||[];
    for(const n of notes){const r=pitches.indexOf(n.pitch);if(r<0)continue;html+=`<button class="note-block ${track().color}" data-note-step="${n.step}" data-note-pitch="${n.pitch}" title="${noteName(n.pitch)} · ${n.length||1}/16 · Alt+click cambia duración" style="grid-column:${n.step+1}/span ${Math.max(1,n.length||1)};grid-row:${r+1}"></button>`;}
    html+='</div><div id="playhead" class="playhead"></div>';roll.innerHTML=html;
    let dragging=false;
    $$('.cell').forEach(c=>{
      const action=()=>editCell(+c.dataset.step,+c.dataset.pitch);
      c.onpointerdown=e=>{e.preventDefault();dragging=true;action();};
      c.onpointerenter=e=>{if(dragging&&e.buttons)action();};
    });
    document.onpointerup=()=>dragging=false;
    $$('.note-block').forEach(n=>{n.onclick=e=>{e.stopPropagation();const step=+n.dataset.noteStep,pitch=+n.dataset.notePitch;if(tool==='erase'||e.button===2)removeNote(step,pitch);else if(e.altKey)cycleLength(step,pitch);};n.oncontextmenu=e=>{e.preventDefault();removeNote(+n.dataset.noteStep,+n.dataset.notePitch);};});
  }
  function editCell(step,pitch){if(!inScale(pitch)){toast('Esa nota está fuera de la escala seleccionada');return;}if(tool==='erase')removeNote(step,pitch);else if(tool==='paint')addNote(step,pitch);}
  function addNote(step,pitch){const list=pattern().notes[selectedTrack];if(list.some(n=>n.step===step&&n.pitch===pitch))return;mutate(()=>list.push({step,pitch,length:1,velocity:96}));previewPitch(pitch,track());}
  function removeNote(step,pitch){const list=pattern().notes[selectedTrack],i=list.findIndex(n=>n.step===step&&n.pitch===pitch);if(i<0)return;mutate(()=>list.splice(i,1));}
  function cycleLength(step,pitch){const n=pattern().notes[selectedTrack].find(n=>n.step===step&&n.pitch===pitch);if(!n)return;mutate(()=>n.length=({1:2,2:4,4:8,8:1})[n.length||1]||1);}
  function renderKeyboard(){const pitches=pitchRange().slice().reverse();$('#keyboard').innerHTML=pitches.map(p=>`<button class="key ${[1,3,6,8,10].includes(p%12)?'black':'white'}" data-key="${p}" title="${noteName(p)}"></button>`).join('');$$('[data-key]').forEach(k=>k.onpointerdown=()=>previewPitch(+k.dataset.key,track()));}
  function addPattern(){const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ',used=new Set(Object.keys(project.patterns));const id=[...letters].find(x=>!used.has(x))||String(Object.keys(project.patterns).length+1);mutate(()=>{project.patterns[id]=emptyPattern(id);project.currentPattern=id;});}
  function previewPitch(pitch,t){if(t.instrument==='noise')return noiseHit(.08,t.volume/100);const ctx=getAudio(),o=ctx.createOscillator(),g=ctx.createGain();o.type=t.instrument==='square'?'square':t.instrument==='saw'?'sawtooth':'triangle';o.frequency.value=440*Math.pow(2,(pitch-69)/12);g.gain.setValueAtTime(.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.08*(t.volume/100),ctx.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.18);o.connect(g).connect(ctx.destination);o.start();o.stop(ctx.currentTime+.2);}
  function getAudio(){audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();audioCtx.resume();return audioCtx;}
  function noiseHit(duration=.07,volume=.5,start=0){const ctx=getAudio(),len=Math.max(1,Math.floor(ctx.sampleRate*duration)),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buf;g.gain.value=.12*volume;src.connect(g).connect(ctx.destination);src.start(ctx.currentTime+start);src.stop(ctx.currentTime+start+duration);nodes.push(src);}
  function scheduleProject(p=project,doLoop=true){stopPlayback(false);const ctx=getAudio(),sps=60/p.bpm/4,patternSteps=p.bars*16,structure=p.structure?.length?p.structure:[p.currentPattern],start=ctx.currentTime+.05;nodes=[];
    structure.forEach((pid,pi)=>{const pat=p.patterns[pid];if(!pat)return;p.tracks.forEach(t=>{for(const n of pat.notes?.[t.id]||[]){const offset=(pi*patternSteps+n.step)*sps,dur=Math.max(.03,(n.length||1)*sps*.92);if(t.instrument==='noise'){noiseHit(Math.min(.12,dur),t.volume/100,offset+.05);continue;}const o=ctx.createOscillator(),g=ctx.createGain();o.type=t.instrument==='square'?'square':t.instrument==='saw'?'sawtooth':'triangle';o.frequency.value=440*Math.pow(2,(n.pitch-69)/12);const at=start+offset;g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.08*(t.volume/100)*(n.velocity||96)/127,at+.008);g.gain.exponentialRampToValueAtTime(.0001,at+dur);o.connect(g).connect(ctx.destination);o.start(at);o.stop(at+dur+.02);nodes.push(o);}});});
    totalSeconds=structure.length*patternSteps*sps;startedAt=performance.now();playing=true;$('#playBtn').textContent='❚❚';clearInterval(progressTimer);progressTimer=setInterval(updatePlayhead,50);clearTimeout(loopTimer);loopTimer=setTimeout(()=>{if(doLoop&&$('#loopBtn').classList.contains('active'))scheduleProject(p,true);else stopPlayback();},totalSeconds*1000+100);}
  function updatePlayhead(){if(!playing)return;const elapsed=(performance.now()-startedAt)/1000,patternDuration=project.bars*16*secPerStep(),local=elapsed%patternDuration,step=Math.floor(local/secPerStep());const ph=$('#playhead');if(ph){ph.style.left=`calc(54px + ${(step/steps())*100}% )`;ph.classList.add('visible');}$('#timeLabel').textContent=`${fmt(elapsed)} / ${fmt(totalSeconds)}`;}
  function stopPlayback(reset=true){playing=false;clearTimeout(loopTimer);clearInterval(progressTimer);for(const n of nodes)try{n.stop();}catch{}nodes=[];$('#playBtn').textContent='▶';$('#playhead')?.classList.remove('visible');if(reset)$('#timeLabel').textContent=`00:00 / ${fmt((project.structure.length||1)*project.bars*4*60/project.bpm)}`;}
  async function saveProject(){project.title=$('#titleInput').value.trim()||'Sin título';project=await JSSCCCommunity.saveProject(project);$('#saveState').textContent='guardado';toast('Proyecto guardado en este navegador');}
  async function publish(){await saveProject();$('#publishTitle').value=project.title;$('#publishDescription').value='';$('#publishVisibility').value='public';$('#publishTags').value='';$('#publishDialog').showModal();}
  async function confirmPublish(){const song=await JSSCCCommunity.publish(project,{title:$('#publishTitle').value,description:$('#publishDescription').value,visibility:$('#publishVisibility').value,tags:$('#publishTags').value.split(',')});$('#publishDialog').close();toast(song.visibility==='public'?'Publicada en Explorar (modo local)':'Canción guardada como '+song.visibility);renderExplore();}
  function card(song){return `<article class="song-card" data-song="${song.id}"><div class="cover">♫</div><div class="song-info"><h3>${escapeHtml(song.title)}</h3><p>por ${escapeHtml(song.authorDisplayName||song.authorUsername||'Autor')}</p><div class="tags">${(song.tags||[]).slice(0,3).map(t=>`<span>#${escapeHtml(t)}</span>`).join('')}</div><small>${song.bpm||120} BPM · ${fmt(song.durationSeconds||0)} · ▶ ${compact(song.plays||0)} · ♥ ${compact(song.likesCount||0)}</small></div><button class="card-play" data-play-song="${song.id}">▶</button></article>`;}
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const compact=n=>Intl.NumberFormat('es',{notation:'compact',maximumFractionDigits:1}).format(n);
  async function renderExplore(){const songs=await JSSCCCommunity.listSongs({sort:$('#sortSelect').value,q:$('#songSearch').value});$('#songGrid').innerHTML=songs.length?songs.map(card).join(''):'<p class="empty">No encontramos canciones.</p>';wireSongCards();}
  function wireSongCards(){$$('[data-song]').forEach(c=>c.onclick=e=>{if(e.target.closest('[data-play-song]'))return;openSong(c.dataset.song);});$$('[data-play-song]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const s=await JSSCCCommunity.getSong(b.dataset.playSong);await JSSCCCommunity.recordPlay(s.id);scheduleProject(s.project,false);});}
  async function openSong(id){const s=await JSSCCCommunity.getSong(id);currentSongDetail=s;$('#detailTitle').textContent=s.title;$('#detailAuthor').textContent='por '+(s.authorDisplayName||s.authorUsername);$('#detailDescription').textContent=s.description||'Sin descripción.';$('#detailMeta').textContent=`${s.bpm} BPM · ${s.scaleName||'Chromatic'} · ${fmt(s.durationSeconds||0)} · ▶ ${compact(s.plays||0)} · ♥ ${compact(s.likesCount||0)} · ⧉ ${compact(s.remixesCount||0)}`;$('#detailLikeBtn').textContent=s.liked?'♥ Te gusta':'♡ Like';$('#detailFavoriteBtn').textContent=s.favorited?'★ Guardada':'☆ Guardar';$('#songDialog').showModal();}
  async function renderLibrary(){let items=libraryMode==='favorites'?await JSSCCCommunity.listFavorites():await JSSCCCommunity.listProjects();if(libraryMode==='projects'){items=items.map(p=>({id:p.id,title:p.title,authorDisplayName:'Tú',bpm:p.bpm,durationSeconds:(p.structure?.length||1)*p.bars*4*60/p.bpm,tags:[p.scale||'Chromatic'],project:p,isProject:true}));}$('#libraryGrid').innerHTML=items.length?items.map(card).join(''):'<p class="empty">Todavía no hay nada aquí.</p>';if(libraryMode==='projects')$$('[data-song]').forEach(c=>c.onclick=async()=>{const projects=await JSSCCCommunity.listProjects(),p=projects.find(x=>x.id===c.dataset.song);if(p){project=clone(p);selectedTrack=project.tracks[0].id;undo=[];redo=[];setView('compose');renderComposer();}});else wireSongCards();}
  function generateBass(){const p=pattern(),target=project.tracks.find(t=>t.id==='triangle');if(!target)return;const root=(SCALES[project.scale]||[0])[0],pitch=36+root;mutate(()=>{p.notes[target.id]=[];for(let s=0;s<steps();s+=8)p.notes[target.id].push({step:s,pitch,length:6,velocity:88});});}
  function generateDrums(){const p=pattern(),target=project.tracks.find(t=>t.id==='noise');mutate(()=>{p.notes[target.id]=[];for(let s=0;s<steps();s+=4)p.notes[target.id].push({step:s,pitch:s%16===0?36:s%8===4?38:42,length:1,velocity:s%8===0?100:72});});}
  function arpeggiate(){const p=pattern(),target=project.tracks.find(t=>t.id==='pulse1'),base=60+(SCALES[project.scale]||[0])[0],ints=[0,4,7,12];mutate(()=>{for(let s=0;s<steps();s+=2)p.notes[target.id].push({step:s,pitch:base+ints[(s/2)%ints.length],length:1,velocity:88});});}
  function humanize(){mutate(()=>{for(const notes of Object.values(pattern().notes))for(const n of notes)n.velocity=Math.max(45,Math.min(127,(n.velocity||96)+Math.round((Math.random()-.5)*18)));});}
  function bind(){
    $$('.tab').forEach(b=>b.onclick=()=>setView(b.dataset.view));$$('.tool').forEach(b=>b.onclick=()=>{$$('.tool').forEach(x=>x.classList.remove('active'));b.classList.add('active');tool=b.dataset.tool;});
    $('#newProjectBtn').onclick=()=>{if(confirm('¿Crear un proyecto nuevo?')){stopPlayback();project=newProject();undo=[];redo=[];selectedTrack='pulse1';renderComposer();}};
    $('#saveProjectBtn').onclick=saveProject;$('#duplicateProjectBtn').onclick=()=>{mutate(()=>{project.id=uuid();project.title+=' copia';project.createdAt=new Date().toISOString();});toast('Copia creada');};
    $('#exportMidiBtn').onclick=()=>{project.title=$('#titleInput').value.trim()||project.title;JSSCCMidiWriter.download(project);toast('MIDI exportado');};$('#publishBtn').onclick=publish;$('#confirmPublishBtn').onclick=confirmPublish;
    $('#undoBtn').onclick=()=>{if(!undo.length)return;redo.push(snapshot());project=JSON.parse(undo.pop());renderComposer();};$('#redoBtn').onclick=()=>{if(!redo.length)return;undo.push(snapshot());project=JSON.parse(redo.pop());renderComposer();};
    $('#titleInput').oninput=e=>{project.title=e.target.value;markDirty();};$('#bpmInput').onchange=e=>mutate(()=>project.bpm=Math.max(20,Math.min(400,+e.target.value||120)));$('#barsInput').onchange=e=>mutate(()=>project.bars=Math.max(1,Math.min(32,+e.target.value||4)));$('#scaleSelect').onchange=e=>mutate(()=>project.scale=e.target.value);$('#gridSelect').onchange=e=>project.grid=+e.target.value;
    $('#instrumentSelect').onchange=e=>mutate(()=>track().instrument=e.target.value);$('#trackVolume').onchange=e=>mutate(()=>track().volume=+e.target.value);$('#octaveInput').onchange=renderRoll;
    $('#playBtn').onclick=()=>playing?stopPlayback():scheduleProject();$('#stopBtn').onclick=()=>stopPlayback();$('#loopBtn').onclick=e=>e.currentTarget.classList.toggle('active');
    $('#addPatternBtn').onclick=addPattern;$('#appendPatternBtn').onclick=()=>mutate(()=>project.structure.push(project.currentPattern));
    $('#generateBassBtn').onclick=generateBass;$('#generateDrumsBtn').onclick=generateDrums;$('#arpeggiateBtn').onclick=arpeggiate;$('#humanizeBtn').onclick=humanize;
    $('#songSearch').oninput=debounce(renderExplore,180);$('#sortSelect').onchange=renderExplore;
    $$('.lib-tab').forEach(b=>b.onclick=()=>{$$('.lib-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');libraryMode=b.dataset.library;renderLibrary();});
    $('#closeSongDialog').onclick=()=>$('#songDialog').close();$('#detailPlayBtn').onclick=async()=>{if(currentSongDetail){await JSSCCCommunity.recordPlay(currentSongDetail.id);scheduleProject(currentSongDetail.project,false);}};
    $('#detailLikeBtn').onclick=async()=>{if(!currentSongDetail)return;currentSongDetail.liked=await JSSCCCommunity.toggleLike(currentSongDetail.id);$('#detailLikeBtn').textContent=currentSongDetail.liked?'♥ Te gusta':'♡ Like';};
    $('#detailFavoriteBtn').onclick=async()=>{if(!currentSongDetail)return;currentSongDetail.favorited=await JSSCCCommunity.toggleFavorite(currentSongDetail.id);$('#detailFavoriteBtn').textContent=currentSongDetail.favorited?'★ Guardada':'☆ Guardar';};
    $('#detailRemixBtn').onclick=async()=>{if(!currentSongDetail)return;project=await JSSCCCommunity.remix(currentSongDetail.id);selectedTrack=project.tracks[0].id;undo=[];redo=[];$('#songDialog').close();setView('compose');renderComposer();toast('Remix creado con crédito al original');};
    $('#authBtn').onclick=()=>alert('La base comunitaria ya está preparada, pero el cliente sigue en modo local hasta enlazar las credenciales públicas de Supabase/Auth. Tus proyectos no se pierden: se guardan en este navegador.');
    window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('#undoBtn').click();}});
  }
  function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
  bind();renderComposer();
})();
