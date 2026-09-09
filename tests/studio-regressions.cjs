'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');

const Editing=require('../js/studio-editing.js');
require('../js/midi-writer.js');
const Parser=require('../js/midi-core.js');

function project(){
  return {
    version:2,id:'p1',title:'Test Song',bpm:120,bars:1,scale:'C Major',grid:16,currentPattern:'A',structure:['A'],
    tracks:[
      {id:'pulse1',name:'Pulse 1',instrument:'square',volume:85},
      {id:'triangle',name:'Triangle',instrument:'triangle',volume:80},
      {id:'noise',name:'Noise',instrument:'noise',volume:70}
    ],
    patterns:{A:{id:'A',name:'A',notes:{pulse1:[{step:0,pitch:60,length:4,velocity:100},{step:8,pitch:64,length:2,velocity:90}],triangle:[{step:0,pitch:36,length:8,velocity:80}],noise:[{step:0,pitch:36,length:1,velocity:90}]}}}
  };
}

test('Studio MIDI writer creates a valid format-1 MIDI with audible notes',()=>{
  const bytes=globalThis.JSSCCMidiWriter.build(project());
  assert.equal(String.fromCharCode(...bytes.slice(0,4)),'MThd');
  const parsed=Parser.parseMidi(bytes.buffer,'studio.mid');
  assert.equal(parsed.format,1);
  assert.ok(parsed.events.some(e=>e.type==='on'&&e.note===60));
  assert.ok(parsed.events.some(e=>e.type==='on'&&e.channel===9));
  assert.ok(parsed.duration>0);
});

test('Studio MIDI tempo matches project BPM',()=>{
  const p=project();p.bpm=150;
  const parsed=Parser.parseMidi(globalThis.JSSCCMidiWriter.build(p).buffer,'tempo.mid');
  assert.ok(parsed.tempoEvents.length>=1);
  assert.ok(Math.abs(parsed.tempoEvents[0].us-400000)<=1);
});

test('1/32 Studio notes keep fractional start and duration in MIDI',()=>{
  const p=project();p.grid=32;p.patterns.A.notes.pulse1=[{step:.5,pitch:72,length:.5,velocity:100}];p.patterns.A.notes.triangle=[];p.patterns.A.notes.noise=[];
  const parsed=Parser.parseMidi(globalThis.JSSCCMidiWriter.build(p).buffer,'thirty-second.mid');
  const on=parsed.events.find(e=>e.type==='on'&&e.note===72),off=parsed.events.find(e=>e.type==='off'&&e.note===72);
  assert.ok(on);assert.ok(off);
  assert.ok(Math.abs(on.time-.0625)<.002,`unexpected note-on ${on.time}`);
  assert.ok(Math.abs((off.time-on.time)-.0625)<.002,`unexpected note length ${off.time-on.time}`);
});

test('editing snap is real from quarter notes through 1/32',()=>{
  assert.equal(Editing.snapSize(4),4);assert.equal(Editing.snapSize(8),2);assert.equal(Editing.snapSize(16),1);assert.equal(Editing.snapSize(32),.5);
  assert.equal(Editing.quantize(.74,32),.5);assert.equal(Editing.quantize(.76,32),1);assert.equal(Editing.quantize(3.2,8),4);
});

test('default paint duration follows grid changes without overriding intentional longer notes',()=>{
  assert.equal(Editing.syncedNoteLength(1,16,32),.5);
  assert.equal(Editing.syncedNoteLength(.5,32,16),1);
  assert.equal(Editing.syncedNoteLength(1,16,8),2);
  assert.equal(Editing.syncedNoteLength(4,16,32),4);
  assert.equal(Editing.syncedNoteLength(2,8,32),.5);
});

test('group move clamps all selected notes as one unit',()=>{
  const notes=[{step:1,pitch:60,length:2},{step:12,pitch:72,length:3}];
  assert.deepEqual(Editing.clampMove(notes,-5,3,16,16),{step:-1,pitch:3});
  assert.deepEqual(Editing.clampMove(notes,10,-100,16,16),{step:1,pitch:-60});
});

test('resize and quantize respect active snap and pattern boundary',()=>{
  assert.equal(Editing.resizedLength({step:15.5,length:.5},8,32,16),.5);
  const n=Editing.quantizeNote({step:3.7,pitch:60,length:2.4},8,16);
  assert.equal(n.step,4);assert.equal(n.length,2);
});

test('Local community publish preserves editable project and supports remix/favorite',async()=>{
  const memory=new Map();
  globalThis.localStorage={getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
  delete require.cache[require.resolve('../js/community-adapter.js')];
  require('../js/community-adapter.js');
  const C=globalThis.JSSCCCommunity,p=project();
  const saved=await C.saveProject(p);
  const song=await C.publish(saved,{title:'Published Test',visibility:'public',tags:['Test','test','boss']});
  const projects=await C.listProjects();
  assert.ok(projects.some(x=>x.id===saved.id));
  assert.equal(song.visibility,'public');
  assert.deepEqual(song.tags,['test','boss']);
  assert.ok((await C.listSongs({q:'Published'})).some(x=>x.id===song.id));
  assert.equal(await C.toggleFavorite(song.id),true);
  assert.ok((await C.listFavorites()).some(x=>x.id===song.id));
  const remix=await C.remix(song.id);
  assert.equal(remix.remixOf,song.id);
  assert.equal(remix.remixCredit.title,song.title);
});
