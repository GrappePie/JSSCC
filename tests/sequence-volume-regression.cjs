'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const codec=require('../js/sequence-codec.js');

function varint(n){const out=[];do{let b=n&127;n>>>=7;if(n)b|=128;out.push(b);}while(n);return out;}
function fieldVarint(field,n){return [(field<<3)|0,...varint(n)];}
function fieldFloat(field,n){const b=Buffer.alloc(4);b.writeFloatLE(n);return [(field<<3)|5,...b];}
function fieldChunk(field,bytes){return [(field<<3)|2,...varint(bytes.length),...bytes];}
function sequenceWithVolume(volume,{time=0,length=4,bpm=120}={}){
  const settings=[...fieldVarint(1,bpm),...fieldVarint(2,4)];
  const note=[...fieldVarint(1,60),...fieldFloat(2,time),...fieldFloat(3,length),...fieldVarint(4,0),...fieldFloat(5,volume)];
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

test('remote sequences longer than 10 minutes are accepted up to the 60 minute safety cap',()=>{
  const result=codec.convert(sequenceWithVolume(1,{length:5200}),{id:999,title:'long fixture'});
  assert.ok(result.report.duration>600);
  assert.ok(result.report.duration<codec.MAX_REMOTE_DURATION);
  assert.ok(result.report.warnings.some(x=>x.includes('más de 10 minutos')));
});

test('high-tempo remote sequence units above the legacy 100000 cap are accepted when wall-clock duration is under 60 minutes',()=>{
  assert.ok(codec.MAX_SEQUENCE_UNITS>100000);
  const input=sequenceWithVolume(1,{length:150000,bpm:999});
  const decoded=codec.decode(input);
  assert.equal(decoded.notes[0].length,150000);
  const result=codec.convert(input,{id:1000,title:'high tempo long units'});
  assert.ok(result.report.duration>600);
  assert.ok(result.report.duration<codec.MAX_REMOTE_DURATION);
});

test('remote sequences beyond 60 minutes still reject explicitly',()=>{
  assert.throws(()=>codec.convert(sequenceWithVolume(1,{length:30000})),/máximo 60 minutos/);
});
