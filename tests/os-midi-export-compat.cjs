'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../js/midi-core.js');
require('../js/os-midi-export-compat.js');
const {parseMidi}=globalThis.JSSCCParser;
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const chunk=(tag,data)=>[...Buffer.from(tag),...u32(data.length),...data];
const end=[0,255,47,0];
const name=s=>[0,255,3,s.length,...Buffer.from(s)];
function smf(tracks){return Uint8Array.from([...chunk('MThd',[0,1,0,tracks.length,1,128]),...tracks.flatMap(t=>chunk('MTrk',t))]);}
test('legacy Online Sequencer late channel-pressure program marker gets an independent second-bank channel',()=>{
  const tracks=[];
  tracks.push([...name('Bass Guitar (Classic)'),0,0xc4,33,0,0x94,60,100,128,0,0x84,60,0,...end]);
  for(let i=1;i<16;i++)tracks.push([...end]);
  tracks.push([...name('8-Bit Sawtooth'),0,0xd4,81,0,0x94,64,100,128,0,0x84,64,0,...end]);
  const m=parseMidi(smf(tracks),'os-export.mid');
  const programs=m.events.filter(e=>e.type==='program').map(e=>[e.channel,e.value]);
  const ons=m.events.filter(e=>e.type==='on').map(e=>[e.channel,e.note]);
  assert.deepEqual(programs,[[4,33],[20,81]]);
  assert.deepEqual(ons,[[4,60],[20,64]]);
  assert.equal(m.compatibility.onlineSequencerSecondBankTracks,1);
  assert.equal(m.compatibility.onlineSequencerChipTracks,1);
});
test('8-bit Sine and Triangle names recover distinct SCC programs even when export marker collapses them',()=>{
  const tracks=[];
  for(let i=0;i<16;i++)tracks.push([...end]);
  tracks.push([...name('8-Bit Sine'),0,0xd0,80,0,0x90,60,100,128,0,0x80,60,0,...end]);
  tracks.push([...name('8-Bit Triangle'),0,0xd1,80,0,0x91,64,100,128,0,0x81,64,0,...end]);
  const m=parseMidi(smf(tracks),'os-chip-export.mid');
  assert.deepEqual(m.events.filter(e=>e.type==='program').map(e=>[e.channel,e.value]),[[16,71],[17,75]]);
  assert.equal(m.compatibility.onlineSequencerChipTracks,2);
});
test('ordinary channel pressure in a small MIDI is not reinterpreted',()=>{
  const m=parseMidi(smf([[...name('Expressive'),0,0xd0,81,0,0x90,60,100,...end]]));
  assert.equal(m.events.some(e=>e.type==='program'&&e.value===81),false);
  assert.equal(m.events.find(e=>e.type==='on').channel,0);
});
