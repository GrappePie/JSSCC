'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');

require('../js/midi-writer.js');
const Parser=require('../js/midi-core.js');

function project(){
  return {
    version:1,id:'p1',title:'Test Song',bpm:120,bars:1,scale:'C Major',currentPattern:'A',structure:['A'],
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
