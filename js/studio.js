/* JSSCC Studio composer/community UI — UX tools v2. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const clone=v=>JSON.parse(JSON.stringify(v));
  const Edit=globalThis.JSSCCStudioEditing;
  if(!Edit)throw Error('JSSCC Studio editing helpers are missing');

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
  const TOOL_HINTS={
    paint:'Pintar · clic o arrastra para crear notas',
    select:'Seleccionar · caja en vacío, arrastra notas para mover',
    erase:'Borrar · clic o arrastra por encima de las notas'
  };

  let audioCtx=null,nodes=[],loopTimer=0,progressTimer=0,playing=false,startedAt=0,totalSeconds=0;
  let undo=[],redo=[],tool='paint',selectedTrack='pulse1',currentSongDetail=null,libraryMode='projects';
  let selection=new Set(),clipboard=null,pointerSession=null,lastCursorStep=0,lastCursorPitch=60,autoSaveTimer=0;

  function uuid(){return crypto.randomUUID?.()||('p-'+Date.now()+'-'+Math.random().toString(16).slice(2));}
  function noteId(){return 'n-'+uuid();}
  function emptyPattern(id='A'){return {id,name:id,notes:Object.fromEntries(TRACKS.map(t=>[t.id,[]]))};}
  function newProject(){return ensureProject({version:2,id:uuid(),title:'Nueva canción',bpm:120,bars:4,scale:'Chromatic',grid:16,tracks:clone(TRACKS),patterns:{A:emptyPattern('A')},currentPattern:'A',structure:['A'],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}
  function ensureProject(p){
    p=clone(p||{});p.version=Math.max(2,+p.version||1);p.id=p.id||uuid();p.title=p.title||'Nueva canción';p.bpm=Math.max(20,Math.min(400,+p.bpm||120));p.bars=Math.max(1,Math.min(32,+p.bars||4));p.scale=SCALES[p.scale]?p.scale:'Chromatic';p.grid=Edit.gridValue(p.grid||16);
    p.tracks=Array.isArray(p.tracks)&&p.tracks.length?p.tracks:clone(TRACKS);p.patterns=p.patterns&&typeof p.patterns==='object'?p.patterns:{A:emptyPattern('A')};
    const first=Object.keys(p.patterns)[0]||'A';p.currentPattern=p.patterns[p.currentPattern]?p.currentPattern:first;p.structure=Array.isArray(p.structure)&&p.structure.length?p.structure.filter(id=>p.patterns[id]):[p.currentPattern];if(!p.structure.length)p.structure=[p.currentPattern];
    for(const [pid,pat] of Object.entries(p.patterns)){
      pat.id=pat.id||pid;pat.name=pat.name||pid;pat.notes=pat.notes&&typeof pat.notes==='object'?pat.notes:{};
      for(const t of p.tracks){pat.notes[t.id]=Array.isArray(pat.notes[t.id])?pat.notes[t.id]:[];for(const n of pat.notes[t.id]){n.id=n.id||noteId();n.step=Math.max(0,+n.step||0);n.pitch=Math.max(0,Math.min(127,Math.round(+n.pitch||60)));n.length=Math.max(.5,+n.length||1);n.velocity=Math.max(1,Math.min(127,Math.round(+n.velocity||96)));}}
    }
    p.createdAt=p.createdAt||new Date().toISOString();p.updatedAt=p.updatedAt||p.createdAt;return p;
  }
  let project=newProject();

  const pattern=()=>project.patterns[project.currentPattern];
  const track=()=>project.tracks.find(t=>t.id===selectedTrack)||project.tracks[0];
  const currentNotes=()=>pattern()?.notes?.[selectedTrack]||[];
  const steps=()=>project.bars*16;
  const secPerStep=()=>60/project.bpm/4;
  const gridSnap=()=>Edit.snapSize(project.grid||16);
  const gridColumns=()=>project.bars*Edit.gridValue(project.grid||16);
  const fmt=s=>{s=Math.max(0,Math.round(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const compact=n=>Intl.NumberFormat('es',{notation:'compact',maximumFractionDigits:1}).format(n);
  function noteName(p){return NOTE_NAMES[((p%12)+12)%12]+(Math.floor(p/12)-1);}
  function lengthLabel(length){return ({'0.5':'1/32','1':'1/16','2':'1/8','4':'1/4','8':'1/2','16':'1 compás'})[String(length)]||`${length}/16`;}
  function snapshot(){return JSON.stringify(project);}
  function selectedNotes(){return currentNotes().filter(n=>selection.has(n.id));}
  function noteById(id){return currentNotes().find(n=>n.id===id);}
  function inScale(p){if(!$('#lockScale').checked)return true;return (SCALES[project.scale]||SCALES.Chromatic).includes(((p%12)+12)%12);}
  function pitchRange(){const center=(+$('#octaveInput').value||4)*12+12;const top=Math.min(96,center+11),bottom=Math.max(24,top-23);return Array.from({length:top-bottom+1},(_,i)=>top-i);}

  function pushUndo(before){if(!before||before===snapshot())return;undo.push(before);if(undo.length>80)undo.shift();redo.length=0;project.updatedAt=new Date().toISOString();markDirty();}
  function mutate(fn,{render=true}={}){const before=snapshot();fn();project=ensureProject(project);pushUndo(before);if(render)renderComposer();}
  function markDirty(){
    const state=$('#saveState');state.textContent='cambios pendientes';state.className='save-state dirty';clearTimeout(autoSaveTimer);autoSaveTimer=setTimeout(autoSave,900);
  }
  async function autoSave(){
    try{const state=$('#saveState');state.textContent='guardando…';state.className='save-state saving';project.title=$('#titleInput').value.trim()||'Sin título';project=ensureProject(await JSSCCCommunity.saveProject(project));state.textContent='guardado automáticamente';state.className='save-state saved';}
    catch{const state=$('#saveState');state.textContent='no se pudo guardar';state.className='save-state dirty';}
  }
  function toast(message){let el=$('#studioToast');if(!el){el=document.createElement('div');el.id='studioToast';el.className='toast';document.body.append(el);}el.textContent=message;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2100);}
  function setView(name){$$('.view').forEach(v=>v.classList.toggle('active',v.id===name+'View'));$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(name==='explore')renderExplore();if(name==='library')renderLibrary();}

  function setTool(next){
    tool=['paint','select','erase'].includes(next)?next:'paint';$$('.tool').forEach(b=>{const active=b.dataset.tool===tool;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    const roll=$('#pianoRoll');roll.classList.remove('tool-paint','tool-select','tool-erase');roll.classList.add('tool-'+tool);$('#toolHint').textContent=TOOL_HINTS[tool];
  }
  function clearSelection({render=true}={}){selection.clear();if(render){renderNotesLayer();updateSelectionUI();}}
  function setSelection(ids,{render=true}={}){selection=new Set(ids.filter(id=>noteById(id)));if(render){renderNotesLayer();updateSelectionUI();}}
  function toggleSelection(id){selection.has(id)?selection.delete(id):selection.add(id);renderNotesLayer();updateSelectionUI();}
  function updateSelectionUI(){
    const notes=selectedNotes(),count=notes.length;$('#selectionStatus').textContent=`${count} nota${count===1?'':'s'} seleccionada${count===1?'':'s'}`;$('#selectionInspector').hidden=!count;$('#selectedCountBadge').textContent=count;
    for(const id of ['copyNotesBtn','duplicateNotesBtn','deleteNotesBtn'])$('#'+id).disabled=!count;$('#pasteNotesBtn').disabled=!clipboard?.notes?.length;
    if(count){const velocities=notes.map(n=>n.velocity||96),avg=Math.round(velocities.reduce((a,b)=>a+b,0)/velocities.length);$('#selectionVelocity').value=avg;$('#selectionVelocityValue').value=avg;}
  }

  function renderComposer(){
    project=ensureProject(project);if(!project.tracks.some(t=>t.id===selectedTrack))selectedTrack=project.tracks[0].id;selection=new Set([...selection].filter(id=>noteById(id)));
    $('#titleInput').value=project.title;$('#bpmInput').value=project.bpm;$('#barsInput').value=project.bars;$('#scaleSelect').value=project.scale;$('#gridSelect').value=project.grid||16;
    const t=track();$('#instrumentSelect').value=t.instrument;$('#trackVolume').value=t.volume;$('#trackVolumeValue').value=t.volume;$('#selectedTrackName').textContent=t.name;$('#projectBreadcrumb').textContent=`Patrón ${project.currentPattern} · ${t.name}`;
    if(!playing)$('#timeLabel').textContent=`00:00 / ${fmt((project.structure.length||1)*project.bars*4*60/project.bpm)}`;
    renderTracks();renderPatterns();renderRoll();renderKeyboard();updateSelectionUI();setTool(tool);
  }
  function renderTracks(){
    $('#trackHeads').innerHTML=project.tracks.map((t,i)=>`<button class="track-card ${t.color} ${t.id===selectedTrack?'active':''}" data-track="${t.id}"><b>${i+1}</b><span><strong>${escapeHtml(t.name)}</strong><small>${escapeHtml(t.instrument.toUpperCase())} · VOL ${t.volume}</small></span></button>`).join('');
    $$('#trackHeads [data-track]').forEach(b=>b.onclick=()=>{if(selectedTrack===b.dataset.track)return;selectedTrack=b.dataset.track;selection.clear();renderComposer();});
  }
  function renderPatterns(){
    const ids=Object.keys(project.patterns);
    $('#patternTabs').innerHTML=ids.map(id=>`<button data-pattern="${id}" class="${id===project.currentPattern?'active':''}">PATRÓN ${id}</button>`).join('')+'<button id="quickAddPattern" title="Nuevo patrón">＋</button>';
    $('#patternList').innerHTML=ids.map(id=>`<button data-pattern="${id}" class="pattern-row ${id===project.currentPattern?'active':''}"><b>${id}</b><span>${project.bars} compases</span></button>`).join('');
    $('#songStructure').innerHTML=project.structure.map((id,i)=>`<button data-structure="${i}" title="Clic: editar · clic derecho: quitar">${id}</button>`).join('');
    $$('[data-pattern]').forEach(b=>b.onclick=()=>{if(project.currentPattern===b.dataset.pattern)return;project.currentPattern=b.dataset.pattern;selection.clear();renderComposer();});
    $$('[data-structure]').forEach(b=>{b.onclick=()=>{project.currentPattern=project.structure[+b.dataset.structure];selection.clear();renderComposer();};b.oncontextmenu=e=>{e.preventDefault();if(project.structure.length>1)mutate(()=>project.structure.splice(+b.dataset.structure,1));};});
    $('#quickAddPattern')?.addEventListener('click',addPattern);
  }
  function renderRoll(){
    const pitches=pitchRange(),columns=gridColumns(),roll=$('#pianoRoll');roll.style.setProperty('--columns',columns);roll.style.setProperty('--rows',pitches.length);
    let html='<div class="pitch-labels">'+pitches.map(p=>`<div class="pitch-label ${p%12===0?'root':''}">${noteName(p)}</div>`).join('')+'</div><div class="grid-layer">';
    const snap=gridSnap();
    for(let r=0;r<pitches.length;r++)for(let c=0;c<columns;c++){const step=+(c*snap).toFixed(6),bar=step%16===0,beat=step%4===0;html+=`<button tabindex="-1" class="cell ${bar?'bar':''} ${beat?'beat':''} ${!inScale(pitches[r])?'out-scale':''}" data-step="${step}" data-pitch="${pitches[r]}" style="grid-column:${c+1};grid-row:${r+1}"></button>`;}
    html+='</div><div class="notes-layer"></div><div id="playhead" class="playhead"></div>';roll.innerHTML=html;renderNotesLayer();
    $('#rollHint').classList.toggle('hidden',currentNotes().length>0);wireRollPointer();
  }
  function renderNotesLayer(){
    const layer=$('#pianoRoll .notes-layer');if(!layer)return;const pitches=pitchRange(),total=steps(),t=track();
    layer.innerHTML=currentNotes().map(n=>{const row=pitches.indexOf(n.pitch);if(row<0)return'';const left=(n.step/total)*100,width=(Math.max(.25,n.length||1)/total)*100,selected=selection.has(n.id);return `<button class="note-block ${t.color} ${selected?'selected':''}" data-note-id="${n.id}" aria-label="${noteName(n.pitch)} ${lengthLabel(n.length)} velocity ${n.velocity}" title="${noteName(n.pitch)} · ${lengthLabel(n.length)} · velocity ${n.velocity}" style="left:${left}%;width:${width}%;top:${row*23+2}px"><span class="resize-handle" data-resize-id="${n.id}"></span></button>`;}).join('');
    layer.querySelectorAll('.note-block').forEach(el=>{el.onpointerdown=onNotePointerDown;el.oncontextmenu=e=>{e.preventDefault();deleteNoteIds([el.dataset.noteId]);};});
    updateSelectionUI();
  }
  function renderKeyboard(){const pitches=pitchRange().slice().reverse();$('#keyboard').innerHTML=pitches.map(p=>`<button class="key ${[1,3,6,8,10].includes(p%12)?'black':'white'} ${!inScale(p)?'out-scale-key':''}" data-key="${p}" title="${noteName(p)}"></button>`).join('');$$('[data-key]').forEach(k=>k.onpointerdown=()=>previewPitch(+k.dataset.key,track()));}

  function rollMetrics(){const layer=$('#pianoRoll .notes-layer'),rect=layer.getBoundingClientRect(),pitches=pitchRange();return {layer,rect,pitches,total:steps(),rowHeight:23};}
  function pointToNotePosition(clientX,clientY){
    const m=rollMetrics(),x=Math.max(0,Math.min(m.rect.width-1,clientX-m.rect.left)),y=Math.max(0,Math.min(m.rect.height-1,clientY-m.rect.top));
    const raw=x/m.rect.width*m.total,step=Math.min(m.total-gridSnap(),Edit.quantize(raw,project.grid,'floor')),row=Math.max(0,Math.min(m.pitches.length-1,Math.floor(y/m.rowHeight))),pitch=m.pitches[row];return {step,pitch,m};
  }
  function noteCovering(step,pitch){return currentNotes().find(n=>n.pitch===pitch&&step>=n.step&&step<n.step+Math.max(.25,n.length||1));}
  function wireRollPointer(){
    const roll=$('#pianoRoll');roll.onpointerdown=e=>{if(e.button!==0||e.target.closest('.note-block'))return;roll.focus();if(tool==='select')startSelectionBox(e);else startStroke(e);};
    roll.onpointermove=e=>{const pos=pointToNotePosition(e.clientX,e.clientY);lastCursorStep=pos.step;lastCursorPitch=pos.pitch;$('#cursorStatus').textContent=`${noteName(pos.pitch)} · paso ${formatStep(pos.step)} · snap ${gridLabel()}`;};
    roll.onpointerleave=()=>{$('#cursorStatus').textContent='—';};
  }
  function formatStep(step){const bar=Math.floor(step/16)+1,within=step%16,beat=Math.floor(within/4)+1,sub=within%4;return `${bar}.${beat}${sub?` +${sub}`:''}`;}
  function gridLabel(){return `1/${project.grid}`;}

  function startStroke(e){
    e.preventDefault();const before=snapshot();pointerSession={type:'stroke',before,changed:false,visited:new Set(),mode:tool};applyStrokeAt(e.clientX,e.clientY);window.addEventListener('pointermove',strokeMove);window.addEventListener('pointerup',finishStroke,{once:true});
  }
  function strokeMove(e){if(pointerSession?.type==='stroke')applyStrokeAt(e.clientX,e.clientY);}
  function applyStrokeAt(x,y){
    const s=pointerSession;if(!s)return;const {step,pitch}=pointToNotePosition(x,y);const key=`${step}:${pitch}`;if(s.visited.has(key))return;s.visited.add(key);lastCursorStep=step;lastCursorPitch=pitch;
    if(s.mode==='paint'){
      if(!inScale(pitch))return;const existing=noteCovering(step,pitch);if(existing)return;const length=Math.min(steps()-step,Math.max(gridSnap(),+$('#noteLengthSelect').value||1)),velocity=+$('#noteVelocity').value||96;currentNotes().push({id:noteId(),step,pitch,length,velocity});s.changed=true;previewPitch(pitch,track());
    }else if(s.mode==='erase'){
      const existing=noteCovering(step,pitch);if(!existing)return;const i=currentNotes().findIndex(n=>n.id===existing.id);if(i>=0){selection.delete(existing.id);currentNotes().splice(i,1);s.changed=true;}
    }
    if(s.changed){renderNotesLayer();$('#rollHint').classList.add('hidden');}
  }
  function finishStroke(){const s=pointerSession;if(!s||s.type!=='stroke')return;window.removeEventListener('pointermove',strokeMove);pointerSession=null;if(s.changed){pushUndo(s.before);renderComposer();}}

  function startSelectionBox(e){
    e.preventDefault();const roll=$('#pianoRoll'),r=roll.getBoundingClientRect(),start={x:e.clientX,y:e.clientY},base=e.shiftKey?new Set(selection):new Set();if(!e.shiftKey)selection.clear();
    const box=document.createElement('div');box.className='selection-box';roll.append(box);pointerSession={type:'box',start,base,box,rollRect:r};
    const move=ev=>{if(pointerSession?.type!=='box')return;const left=Math.min(start.x,ev.clientX)-r.left,top=Math.min(start.y,ev.clientY)-r.top,width=Math.abs(ev.clientX-start.x),height=Math.abs(ev.clientY-start.y);Object.assign(box.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});};
    const up=ev=>{window.removeEventListener('pointermove',move);const x1=Math.min(start.x,ev.clientX),x2=Math.max(start.x,ev.clientX),y1=Math.min(start.y,ev.clientY),y2=Math.max(start.y,ev.clientY),ids=new Set(base);$$('#pianoRoll .note-block').forEach(n=>{const nr=n.getBoundingClientRect();if(nr.right>=x1&&nr.left<=x2&&nr.bottom>=y1&&nr.top<=y2)ids.add(n.dataset.noteId);});box.remove();pointerSession=null;setSelection([...ids]);};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});
  }

  function onNotePointerDown(e){
    e.preventDefault();e.stopPropagation();const el=e.currentTarget,id=el.dataset.noteId,note=noteById(id);if(!note)return;
    if(tool==='erase'){deleteNoteIds([id]);return;}
    if(tool==='paint'){if(e.altKey)resizeNoteToNext(note);else previewPitch(note.pitch,track());return;}
    if(e.shiftKey){toggleSelection(id);return;}
    if(!selection.has(id))setSelection([id]);
    if(e.target.closest('.resize-handle'))startResize(e,id);else startMove(e,id);
  }
  function startMove(e,id){
    const notes=selectedNotes(),before=snapshot(),m=rollMetrics(),orig=notes.map(n=>({id:n.id,step:n.step,pitch:n.pitch,length:n.length})),startX=e.clientX,startY=e.clientY;
    pointerSession={type:'move',before,orig,startX,startY,current:{step:0,pitch:0},m,changed:false};
    const move=ev=>{const s=pointerSession;if(s?.type!=='move')return;const rawStep=(ev.clientX-startX)/m.rect.width*m.total,rawPitch=-(ev.clientY-startY)/m.rowHeight,delta=Edit.clampMove(orig,rawStep,rawPitch,m.total,project.grid);s.current=delta;s.changed=delta.step!==0||delta.pitch!==0;for(const o of orig){const node=$(`[data-note-id="${o.id}"]`);if(!node)continue;node.classList.add('dragging');node.style.left=`${((o.step+delta.step)/m.total)*100}%`;const row=m.pitches.indexOf(o.pitch+delta.pitch);if(row>=0)node.style.top=(row*m.rowHeight+2)+'px';}};
    const up=()=>{window.removeEventListener('pointermove',move);const s=pointerSession;pointerSession=null;if(!s?.changed){renderNotesLayer();return;}for(const o of s.orig){const n=noteById(o.id);if(n){n.step=+(o.step+s.current.step).toFixed(6);n.pitch=o.pitch+s.current.pitch;}}pushUndo(s.before);renderComposer();};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});
  }
  function startResize(e,id){
    const n=noteById(id);if(!n)return;const before=snapshot(),m=rollMetrics(),startX=e.clientX,original=n.length;pointerSession={type:'resize',before,id,startX,original,current:original,m,changed:false};
    const move=ev=>{const s=pointerSession;if(s?.type!=='resize')return;const delta=(ev.clientX-startX)/m.rect.width*m.total,target=original+delta,next=Edit.resizedLength(n,target,project.grid,m.total);s.current=next;s.changed=Math.abs(next-original)>.0001;const node=$(`[data-note-id="${id}"]`);if(node)node.style.width=`${(next/m.total)*100}%`;$('#cursorStatus').textContent=`${noteName(n.pitch)} · duración ${lengthLabel(next)}`;};
    const up=()=>{window.removeEventListener('pointermove',move);const s=pointerSession;pointerSession=null;if(s?.changed){const target=noteById(id);if(target)target.length=s.current;pushUndo(s.before);}renderComposer();};
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});
  }
  function resizeNoteToNext(note){const values=[.5,1,2,4,8,16],idx=values.findIndex(v=>Math.abs(v-note.length)<.001),next=values[(idx+1+values.length)%values.length];mutate(()=>note.length=Math.min(steps()-note.step,next));}

  function addPattern(){const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ',used=new Set(Object.keys(project.patterns));const id=[...letters].find(x=>!used.has(x))||String(Object.keys(project.patterns).length+1);mutate(()=>{project.patterns[id]=emptyPattern(id);for(const t of project.tracks)project.patterns[id].notes[t.id]=[];project.currentPattern=id;selection.clear();});}
  function deleteNoteIds(ids){const wanted=new Set(ids);if(!wanted.size)return;mutate(()=>{pattern().notes[selectedTrack]=currentNotes().filter(n=>!wanted.has(n.id));for(const id of wanted)selection.delete(id);});}
  function deleteSelection(){deleteNoteIds([...selection]);}
  function copySelection(){const notes=selectedNotes();if(!notes.length)return;const min=Math.min(...notes.map(n=>n.step));clipboard={trackId:selectedTrack,notes:clone(notes.map(n=>({...n,step:n.step-min}))),span:Math.max(...notes.map(n=>n.step+n.length))-min};$('#pasteNotesBtn').disabled=false;toast(`${notes.length} nota${notes.length===1?'':'s'} copiada${notes.length===1?'':'s'}`);}
  function pasteClipboard(){if(!clipboard?.notes?.length)return;const anchor=Math.max(0,Math.min(steps()-gridSnap(),Edit.quantize(lastCursorStep,project.grid))),ids=[];mutate(()=>{for(const raw of clipboard.notes){const step=anchor+raw.step;if(step>=steps())continue;const n={...clone(raw),id:noteId(),step,length:Math.min(raw.length,steps()-step)};currentNotes().push(n);ids.push(n.id);}selection=new Set(ids);});toast(`${ids.length} notas pegadas`);}
  function duplicateSelection(){const notes=selectedNotes();if(!notes.length)return;const desired=gridSnap(),delta=Edit.clampMove(notes,desired,0,steps(),project.grid).step;if(delta===0){toast('No hay espacio a la derecha para duplicar');return;}const ids=[];mutate(()=>{for(const src of notes){const n={...clone(src),id:noteId(),step:+(src.step+delta).toFixed(6)};currentNotes().push(n);ids.push(n.id);}selection=new Set(ids);});}
  function quantizeSelection(){const ids=[...selection];if(!ids.length)return;mutate(()=>{for(const id of ids){const n=noteById(id);if(n)Object.assign(n,Edit.quantizeNote(n,project.grid,steps()));}});toast(`Selección ajustada a ${gridLabel()}`);}
  function applySelectionLength(value){if(value==='keep'||!selection.size)return;mutate(()=>{for(const n of selectedNotes())n.length=Edit.resizedLength(n,+value,project.grid,steps());});$('#selectionLength').value='keep';}
  function applySelectionVelocity(value){if(!selection.size)return;mutate(()=>{for(const n of selectedNotes())n.velocity=Math.max(1,Math.min(127,+value||96));});}

  function previewPitch(pitch,t){if(t.instrument==='noise')return noiseHit(.08,t.volume/100);const ctx=getAudio(),o=ctx.createOscillator(),g=ctx.createGain();o.type=t.instrument==='square'?'square':t.instrument==='saw'?'sawtooth':'triangle';o.frequency.value=440*Math.pow(2,(pitch-69)/12);g.gain.setValueAtTime(.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.08*(t.volume/100),ctx.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.18);o.connect(g).connect(ctx.destination);o.start();o.stop(ctx.currentTime+.2);}
  function getAudio(){audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();audioCtx.resume();return audioCtx;}
  function noiseHit(duration=.07,volume=.5,start=0){const ctx=getAudio(),len=Math.max(1,Math.floor(ctx.sampleRate*duration)),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;const src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buf;g.gain.value=.12*volume;src.connect(g).connect(ctx.destination);src.start(ctx.currentTime+start);src.stop(ctx.currentTime+start+duration);nodes.push(src);}
  function scheduleProject(p=project,doLoop=true){
    stopPlayback(false);const ctx=getAudio(),sps=60/p.bpm/4,patternSteps=p.bars*16,structure=p.structure?.length?p.structure:[p.currentPattern],start=ctx.currentTime+.05;nodes=[];
    structure.forEach((pid,pi)=>{const pat=p.patterns[pid];if(!pat)return;p.tracks.forEach(t=>{for(const n of pat.notes?.[t.id]||[]){const offset=(pi*patternSteps+n.step)*sps,dur=Math.max(.025,(n.length||1)*sps*.92);if(t.instrument==='noise'){noiseHit(Math.min(.12,dur),t.volume/100,offset+.05);continue;}const o=ctx.createOscillator(),g=ctx.createGain();o.type=t.instrument==='square'?'square':t.instrument==='saw'?'sawtooth':'triangle';o.frequency.value=440*Math.pow(2,(n.pitch-69)/12);const at=start+offset;g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.08*(t.volume/100)*(n.velocity||96)/127,at+.008);g.gain.exponentialRampToValueAtTime(.0001,at+dur);o.connect(g).connect(ctx.destination);o.start(at);o.stop(at+dur+.02);nodes.push(o);}});});
    totalSeconds=structure.length*patternSteps*sps;startedAt=performance.now();playing=true;$('#playBtn').textContent='❚❚';clearInterval(progressTimer);progressTimer=setInterval(updatePlayhead,40);clearTimeout(loopTimer);loopTimer=setTimeout(()=>{if(doLoop&&$('#loopBtn').classList.contains('active'))scheduleProject(p,true);else stopPlayback();},totalSeconds*1000+100);
  }
  function updatePlayhead(){if(!playing)return;const elapsed=(performance.now()-startedAt)/1000,patternDuration=project.bars*16*secPerStep(),local=elapsed%patternDuration,progress=local/patternDuration,ph=$('#playhead');if(ph){const roll=$('#pianoRoll');ph.style.left=(54+Math.max(0,roll.clientWidth-54)*progress)+'px';ph.classList.add('visible');}$('#timeLabel').textContent=`${fmt(Math.min(elapsed,totalSeconds))} / ${fmt(totalSeconds)}`;}
  function stopPlayback(reset=true){playing=false;clearTimeout(loopTimer);clearInterval(progressTimer);for(const n of nodes)try{n.stop();}catch{}nodes=[];$('#playBtn').textContent='▶';$('#playhead')?.classList.remove('visible');if(reset)$('#timeLabel').textContent=`00:00 / ${fmt((project.structure.length||1)*project.bars*4*60/project.bpm)}`;}

  async function saveProject(){project.title=$('#titleInput').value.trim()||'Sin título';project=ensureProject(await JSSCCCommunity.saveProject(project));const s=$('#saveState');s.textContent='guardado';s.className='save-state saved';toast('Proyecto guardado');}
  async function publish(){await saveProject();$('#publishTitle').value=project.title;$('#publishDescription').value='';$('#publishVisibility').value='public';$('#publishTags').value='';$('#publishDialog').showModal();}
  async function confirmPublish(){const song=await JSSCCCommunity.publish(project,{title:$('#publishTitle').value,description:$('#publishDescription').value,visibility:$('#publishVisibility').value,tags:$('#publishTags').value.split(',')});$('#publishDialog').close();toast(song.visibility==='public'?'Publicada en Explorar (modo local)':'Canción guardada como '+song.visibility);renderExplore();}
  function card(song){return `<article class="song-card" data-song="${song.id}"><div class="cover">♫</div><div class="song-info"><h3>${escapeHtml(song.title)}</h3><p>por ${escapeHtml(song.authorDisplayName||song.authorUsername||'Autor')}</p><div class="tags">${(song.tags||[]).slice(0,3).map(t=>`<span>#${escapeHtml(t)}</span>`).join('')}</div><small>${song.bpm||120} BPM · ${fmt(song.durationSeconds||0)} · ▶ ${compact(song.plays||0)} · ♥ ${compact(song.likesCount||0)}</small></div><button class="card-play" data-play-song="${song.id}">▶</button></article>`;}
  async function renderExplore(){const songs=await JSSCCCommunity.listSongs({sort:$('#sortSelect').value,q:$('#songSearch').value});$('#songGrid').innerHTML=songs.length?songs.map(card).join(''):'<p class="empty">No encontramos canciones.</p>';wireSongCards();}
  function wireSongCards(){$$('[data-song]').forEach(c=>c.onclick=e=>{if(e.target.closest('[data-play-song]'))return;openSong(c.dataset.song);});$$('[data-play-song]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const s=await JSSCCCommunity.getSong(b.dataset.playSong);await JSSCCCommunity.recordPlay(s.id);scheduleProject(ensureProject(s.project),false);});}
  async function openSong(id){const s=await JSSCCCommunity.getSong(id);currentSongDetail=s;$('#detailTitle').textContent=s.title;$('#detailAuthor').textContent='por '+(s.authorDisplayName||s.authorUsername);$('#detailDescription').textContent=s.description||'Sin descripción.';$('#detailMeta').textContent=`${s.bpm} BPM · ${s.scaleName||'Chromatic'} · ${fmt(s.durationSeconds||0)} · ▶ ${compact(s.plays||0)} · ♥ ${compact(s.likesCount||0)} · ⧉ ${compact(s.remixesCount||0)}`;$('#detailLikeBtn').textContent=s.liked?'♥ Te gusta':'♡ Like';$('#detailFavoriteBtn').textContent=s.favorited?'★ Guardada':'☆ Guardar';$('#songDialog').showModal();}
  async function renderLibrary(){let items=libraryMode==='favorites'?await JSSCCCommunity.listFavorites():await JSSCCCommunity.listProjects();if(libraryMode==='projects')items=items.map(p=>({id:p.id,title:p.title,authorDisplayName:'Tú',bpm:p.bpm,durationSeconds:(p.structure?.length||1)*p.bars*4*60/p.bpm,tags:[p.scale||'Chromatic'],project:p,isProject:true}));$('#libraryGrid').innerHTML=items.length?items.map(card).join(''):'<p class="empty">Todavía no hay nada aquí.</p>';if(libraryMode==='projects')$$('[data-song]').forEach(c=>c.onclick=async()=>{const projects=await JSSCCCommunity.listProjects(),p=projects.find(x=>x.id===c.dataset.song);if(p){project=ensureProject(p);selectedTrack=project.tracks[0].id;undo=[];redo=[];selection.clear();setView('compose');renderComposer();}});else wireSongCards();}

  function generateBass(){const p=pattern(),target=project.tracks.find(t=>t.id==='triangle');if(!target)return;const root=(SCALES[project.scale]||[0])[0],pitch=36+root;mutate(()=>{p.notes[target.id]=[];for(let s=0;s<steps();s+=8)p.notes[target.id].push({id:noteId(),step:s,pitch,length:6,velocity:88});});}
  function generateDrums(){const p=pattern(),target=project.tracks.find(t=>t.id==='noise');if(!target)return;mutate(()=>{p.notes[target.id]=[];for(let s=0;s<steps();s+=4)p.notes[target.id].push({id:noteId(),step:s,pitch:s%16===0?36:s%8===4?38:42,length:1,velocity:s%8===0?100:72});});}
  function arpeggiate(){const p=pattern(),target=project.tracks.find(t=>t.id==='pulse1'),base=60+(SCALES[project.scale]||[0])[0],ints=[0,4,7,12];mutate(()=>{for(let s=0;s<steps();s+=2)p.notes[target.id].push({id:noteId(),step:s,pitch:base+ints[(s/2)%ints.length],length:1,velocity:88});});}
  function humanize(){mutate(()=>{for(const notes of Object.values(pattern().notes))for(const n of notes)n.velocity=Math.max(45,Math.min(127,(n.velocity||96)+Math.round((Math.random()-.5)*18)));});}

  function undoAction(){if(!undo.length)return;redo.push(snapshot());project=ensureProject(JSON.parse(undo.pop()));selection.clear();renderComposer();markDirty();}
  function redoAction(){if(!redo.length)return;undo.push(snapshot());project=ensureProject(JSON.parse(redo.pop()));selection.clear();renderComposer();markDirty();}
  function changeBars(value){const bars=Math.max(1,Math.min(32,+value||4));if(bars===project.bars)return;mutate(()=>{project.bars=bars;const total=steps();for(const pat of Object.values(project.patterns))for(const tid of Object.keys(pat.notes))pat.notes[tid]=pat.notes[tid].filter(n=>n.step<total).map(n=>({...n,length:Math.min(n.length,total-n.step)}));selection.clear();});}
  function setVelocityOutput(id,value){$(id).value=Math.round(+value||0);}

  function bind(){
    $$('.tab').forEach(b=>b.onclick=()=>setView(b.dataset.view));$$('.tool').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
    $('#newProjectBtn').onclick=()=>{if(confirm('¿Crear un proyecto nuevo? El proyecto actual ya se guarda automáticamente.')){stopPlayback();project=newProject();undo=[];redo=[];selection.clear();selectedTrack='pulse1';renderComposer();markDirty();}};
    $('#saveProjectBtn').onclick=saveProject;$('#duplicateProjectBtn').onclick=()=>{mutate(()=>{project.id=uuid();project.title+=' copia';project.createdAt=new Date().toISOString();});toast('Copia creada');};
    $('#exportMidiBtn').onclick=()=>{project.title=$('#titleInput').value.trim()||project.title;JSSCCMidiWriter.download(project);toast('MIDI exportado');};$('#publishBtn').onclick=publish;$('#confirmPublishBtn').onclick=confirmPublish;
    $('#titleInput').oninput=e=>{project.title=e.target.value;markDirty();};$('#bpmInput').onchange=e=>mutate(()=>project.bpm=Math.max(20,Math.min(400,+e.target.value||120)));$('#barsInput').onchange=e=>changeBars(e.target.value);$('#scaleSelect').onchange=e=>mutate(()=>project.scale=e.target.value);$('#lockScale').onchange=renderComposer;$('#gridSelect').onchange=e=>mutate(()=>project.grid=Edit.gridValue(e.target.value));
    $('#instrumentSelect').onchange=e=>mutate(()=>track().instrument=e.target.value);$('#trackVolume').oninput=e=>setVelocityOutput('#trackVolumeValue',e.target.value);$('#trackVolume').onchange=e=>mutate(()=>track().volume=+e.target.value);$('#octaveInput').onchange=()=>{renderRoll();renderKeyboard();};
    $('#noteVelocity').oninput=e=>setVelocityOutput('#noteVelocityValue',e.target.value);$('#selectionVelocity').oninput=e=>setVelocityOutput('#selectionVelocityValue',e.target.value);$('#selectionVelocity').onchange=e=>applySelectionVelocity(e.target.value);$('#selectionLength').onchange=e=>applySelectionLength(e.target.value);
    $('#playBtn').onclick=()=>playing?stopPlayback():scheduleProject();$('#stopBtn').onclick=()=>stopPlayback();$('#loopBtn').onclick=e=>{e.currentTarget.classList.toggle('active');e.currentTarget.setAttribute('aria-pressed',String(e.currentTarget.classList.contains('active')));};
    $('#addPatternBtn').onclick=addPattern;$('#appendPatternBtn').onclick=()=>mutate(()=>project.structure.push(project.currentPattern));
    $('#copyNotesBtn').onclick=copySelection;$('#pasteNotesBtn').onclick=pasteClipboard;$('#duplicateNotesBtn').onclick=duplicateSelection;$('#deleteNotesBtn').onclick=deleteSelection;$('#quantizeBtn').onclick=quantizeSelection;$('#inspectorDuplicateBtn').onclick=duplicateSelection;$('#inspectorDeleteBtn').onclick=deleteSelection;
    $('#generateBassBtn').onclick=generateBass;$('#generateDrumsBtn').onclick=generateDrums;$('#arpeggiateBtn').onclick=arpeggiate;$('#humanizeBtn').onclick=humanize;
    $('#songSearch').oninput=debounce(renderExplore,180);$('#sortSelect').onchange=renderExplore;
    $$('.lib-tab').forEach(b=>b.onclick=()=>{$$('.lib-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');libraryMode=b.dataset.library;renderLibrary();});
    $('#closeSongDialog').onclick=()=>$('#songDialog').close();$('#detailPlayBtn').onclick=async()=>{if(currentSongDetail){await JSSCCCommunity.recordPlay(currentSongDetail.id);scheduleProject(ensureProject(currentSongDetail.project),false);}};
    $('#detailLikeBtn').onclick=async()=>{if(!currentSongDetail)return;currentSongDetail.liked=await JSSCCCommunity.toggleLike(currentSongDetail.id);$('#detailLikeBtn').textContent=currentSongDetail.liked?'♥ Te gusta':'♡ Like';};
    $('#detailFavoriteBtn').onclick=async()=>{if(!currentSongDetail)return;currentSongDetail.favorited=await JSSCCCommunity.toggleFavorite(currentSongDetail.id);$('#detailFavoriteBtn').textContent=currentSongDetail.favorited?'★ Guardada':'☆ Guardar';};
    $('#detailRemixBtn').onclick=async()=>{if(!currentSongDetail)return;project=ensureProject(await JSSCCCommunity.remix(currentSongDetail.id));selectedTrack=project.tracks[0].id;undo=[];redo=[];selection.clear();$('#songDialog').close();setView('compose');renderComposer();toast('Remix creado con crédito al original');};
    $('#authBtn').onclick=()=>alert('La base comunitaria ya está preparada, pero el cliente sigue en modo local hasta enlazar las credenciales públicas de Supabase/Auth. Tus proyectos se guardan automáticamente en este navegador.');
    $('#helpBtn').onclick=()=>$('#helpDialog').showModal();$('#closeHelpDialog').onclick=()=>$('#helpDialog').close();
    window.addEventListener('keydown',handleShortcut);window.addEventListener('beforeunload',()=>{if(autoSaveTimer){clearTimeout(autoSaveTimer);try{project.title=$('#titleInput').value.trim()||project.title;JSSCCCommunity.saveProject(project);}catch{}}});
  }
  function handleShortcut(e){
    const tag=e.target?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag)&&!(e.ctrlKey||e.metaKey))return;const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
    if(mod&&key==='s'){e.preventDefault();saveProject();return;}if(mod&&key==='z'&&!e.shiftKey){e.preventDefault();undoAction();return;}if((mod&&key==='y')||(mod&&e.shiftKey&&key==='z')){e.preventDefault();redoAction();return;}if(mod&&key==='c'){if(selection.size){e.preventDefault();copySelection();}return;}if(mod&&key==='v'){if(clipboard){e.preventDefault();pasteClipboard();}return;}if(mod&&key==='d'){if(selection.size){e.preventDefault();duplicateSelection();}return;}
    if(key==='delete'||key==='backspace'){if(selection.size){e.preventDefault();deleteSelection();}return;}if(key===' '){e.preventDefault();playing?stopPlayback():scheduleProject();return;}if(key==='p'){setTool('paint');return;}if(key==='v'){setTool('select');return;}if(key==='e'){setTool('erase');return;}if(key==='escape'){clearSelection();return;}
  }
  function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}

  bind();renderComposer();setTool('paint');updateSelectionUI();
})();
