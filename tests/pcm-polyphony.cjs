// State-conditioned native reference, not a calibration of the default player.
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
require('../js/gxscc-exact-data.js');const C=require('../js/pcm-core.js'),P=require('../js/midi-core.js');
const f=JSON.parse(fs.readFileSync(__dirname+'/pcm-polyphony-fixtures.json'));
test('nine native chord prefixes match under one independently inferred initial stagger state',()=>{
 const midi=require('node:zlib').inflateRawSync(Buffer.from(f.midiDeflateBase64,'base64'),{maxOutputLength:16384});
 assert.equal(crypto.createHash('sha256').update(midi).digest('hex'),f.provenance.midiSha256);
 const parsed=P.parseMidi(midi),e=new C.Engine(GXSCC_EXACT_DATA).load(parsed);e.stagger=f.initialStagger;
 const a=e.render(Math.ceil((e.duration+.2)*44100)),pcm=Buffer.from(C.wav(a.left,a.right)).subarray(44);
 const events=C.compile(parsed).events;
 for(const c of f.cases){
  const event=events.find(x=>x.type==='on'&&x.tick===c.tick);assert.ok(event,c.name);
  let start=event.frame;
  while(start<event.frame+2000&&Math.abs(pcm.readInt16LE(start*4))<=3&&Math.abs(pcm.readInt16LE(start*4+2))<=3)start++;
  const hash=crypto.createHash('sha256').update(pcm.subarray(start*4,(start+c.frames)*4)).digest('hex');
  assert.equal(hash,c.nativeSha256,c.name);
 }
});
