'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const codec=require('../js/sequence-codec.js');
require('../js/midi-core.js');
const {parseMidi}=globalThis.JSSCCParser;

test('remote conversion preserves the supplied song title in the generated MIDI',()=>{
  const seq={
    bpm:120,timeSignature:4,volume:1,effects:false,unknownFields:0,markers:[],
    instruments:new Map([[0,{volume:1,pan:0,detune:0,name:'Piano'}]]),
    notes:[{pitch:60,time:0,length:1,instrument:0,volume:1}]
  };
  const title='Save & Load - Mario Paint';
  const result=codec.encodeMidi(seq,{id:45626,title});
  const midi=parseMidi(result.bytes,'fallback.mid');
  assert.equal(result.report.version,codec.VERSION);
  const text=Buffer.from(result.bytes).toString('latin1');
  assert.ok(text.includes(title), 'generated MIDI should contain the remote song title');
  assert.notEqual(midi.fileName,'Online Sequencer os45626.mid');
});
