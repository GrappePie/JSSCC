'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const codec=require('../js/sequence-codec.js');

function varint(n){const out=[];do{let b=n&127;n>>>=7;if(n)b|=128;out.push(b);}while(n);return out;}
function fieldVarint(field,n){return [(field<<3)|0,...varint(n)];}
function fieldFloat(field,n){const b=Buffer.alloc(4);b.writeFloatLE(n);return [(field<<3)|5,...b];}
function fieldChunk(field,bytes){return [(field<<3)|2,...varint(bytes.length),...bytes];}
function sequenceWithVolume(volume){
  const settings=[...fieldVarint(1,120),...fieldVarint(2,4)];
  const note=[...fieldVarint(1,60),...fieldFloat(2,0),...fieldFloat(3,4),...fieldVarint(4,0),...fieldFloat(5,volume)];
  return Uint8Array.from([...fieldChunk(1,settings),...fieldChunk(2,note)]);
}

test('legacy Online Sequencer note intensities above 4 are accepted and clamped only at MIDI velocity',()=>{
  const input=sequenceWithVolume(8);
  const decoded=codec.decode(input);
  assert.equal(decoded.notes.length,1);
  assert.equal(decoded.notes[0].volume,8);
  const result=codec.convert(input,{id:2261878,title:'legacy volume fixture'});
  assert.equal(result.report.noteCount,1);
  assert.ok(result.report.warnings.some(x=>x.includes('intensidades altas')));
  assert.equal(result.bytes[0],0x4d);
  assert.equal(result.bytes[1],0x54);
  assert.equal(result.bytes[2],0x68);
  assert.equal(result.bytes[3],0x64);
});

test('non-finite or negative note intensity remains rejected',()=>{
  assert.throws(()=>codec.decode(sequenceWithVolume(-1)),/intensidad fuera de rango/);
  assert.throws(()=>codec.decode(sequenceWithVolume(Number.NaN)),/intensidad fuera de rango/);
});
