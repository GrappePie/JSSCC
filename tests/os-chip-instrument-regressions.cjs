'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const baseCodec=require('../js/sequence-codec.js');
globalThis.JSSCCSequenceCodec=baseCodec;
require('../js/os-chip-instrument-compat.js');
require('../js/midi-core.js');
const codec=globalThis.JSSCCSequenceCodec;
const {parseMidi}=globalThis.JSSCCParser;

test('remote Online Sequencer 8-bit IDs keep distinct SCC waveforms',()=>{
  const ids=[13,14,15,16];
  const seq={
    bpm:120,timeSignature:4,volume:1,effects:false,unknownFields:0,markers:[],instruments:new Map(),
    notes:ids.map((instrument,i)=>({pitch:60+i,time:i,length:1,instrument,volume:1}))
  };
  const result=codec.encodeMidi(seq,{id:123,title:'chip-map'});
  const midi=parseMidi(result.bytes,'chip-map.mid');
  const programs=midi.events.filter(e=>e.type==='program').map(e=>[e.channel,e.value]);
  assert.deepEqual(programs,[[0,71],[1,80],[2,81],[3,75]]);
  assert.equal(result.report.chipInstrumentTracks,4);
  assert.equal(result.report.chipInstrumentMapVersion,'os-chip-map-20260909.1');
  assert.ok(result.report.warnings.some(w=>/formas SCC dedicadas/.test(w)));
});

test('non-chip Online Sequencer instruments keep the base converter program',()=>{
  const seq={bpm:120,timeSignature:4,volume:1,effects:false,unknownFields:0,markers:[],instruments:new Map(),
    notes:[{pitch:60,time:0,length:1,instrument:5,volume:1}]};
  const result=codec.encodeMidi(seq,{}),midi=parseMidi(result.bytes);
  assert.equal(midi.events.find(e=>e.type==='program').value,33);
  assert.equal(result.report.chipInstrumentTracks,undefined);
});
