'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
require('../js/gxscc-exact-data.js');const D=globalThis.GXSCC_EXACT_DATA,PCM=require('../js/pcm-core.js');
const {parseMidi}=require('../js/midi-core.js');const {ev,smf}=require('./fixtures.cjs');
const on=(note=60,channel=0,velocity=100,time=0)=>({type:'on',note,channel,velocity,time});
const cc=(controller,value,channel=0,time=0)=>({type:'cc',channel,controller,value,time});
const song=events=>({duration:3,events});const engine=events=>new PCM.Engine(D).load(song(events));
const peak=x=>x.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
const rms=x=>Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length);
const F=JSON.parse(fs.readFileSync(__dirname+'/pcm-reference-fixtures.json'));
for(let bank=0;bank<8;bank++)test('native reference prefixes: 124 deterministic programs in bank '+bank,()=>{
 const expected=F.banks[bank],hash=crypto.createHash('sha256');
 for(let program=0;program<128;program++){
  if(F.excludedPrograms.includes(program))continue;
  const f={bank,program,frames:expected.lengthOverrides[program]||F.framesPerPrefix};
  const c=new PCM.Engine(D,{instrumentSet:bank});c.event({type:'program',channel:0,value:f.program});c.event(on());
  const a=c.render(20000),bytes=Buffer.from(PCM.wav(a.left,a.right)).subarray(44);let start=0;
  while(start<20000&&Math.abs(bytes.readInt16LE(start*4))<=3&&Math.abs(bytes.readInt16LE(start*4+2))<=3)start++;
  assert.ok(start+f.frames<=20000,'probe range '+f.program);
  hash.update(bytes.subarray(start*4,(start+f.frames)*4));
 }
 assert.equal(hash.digest('hex'),expected.concatenatedSha256);
});
test('native clock uses q3/137 frames at 120BPM and 480PPQ, not a fitted speed',()=>{
 const m=parseMidi(smf([[...ev(0,255,81,3,7,161,32),...ev(960,144,60,100),...ev(0,255,47,0)]]));
 const c=PCM.compile(m);assert.equal(c.events[0].frame,43840);assert.equal(c.duration,43840/44100);
});
test('native default tempo is180, standard parser tempo stays120',()=>{
 const m=parseMidi(smf([[...ev(480,144,60,100)]]));assert.equal(m.events[0].time,.5);
 assert.equal(PCM.compile(m).events[0].frame,14640);assert.equal(PCM.compile(m,'standard').events[0].frame,22050);
});
test('sample-rate-independent kernel explicitly uses 44100Hz',()=>assert.equal(PCM.RATE,44100));
test('native C4 and octave-shifted waveform15 are not A440/Fourier guesses',()=>{
 assert.equal(PCM.pitchHz(60),261.6300048828125);
 const c=engine([]);const v=c.makeVoice(0,60,100,0);assert.equal(v.period,Math.fround(44100/PCM.pitchHz(60)));
});
test('integer linear pan: endpoints silent on opposite channel; centre is63/64',()=>{
 for(const pan of [0,64,127]){
  const c=engine([cc(10,pan),{type:'program',channel:0,value:16,time:0},on()]);const a=c.render(10000);
  if(pan===0)assert.equal(peak(a.right),0);if(pan===127)assert.equal(peak(a.left),0);
  if(pan===64)assert.ok(rms(a.right)>rms(a.left));
 }
});
test('captured CC7 volume follows native behavior; live expression and mute still silence',()=>{
 const base=[{type:'program',channel:0,value:16,time:0},on()];
 const a=engine(base).render(30000),b=engine([...base,cc(7,0,0,.2)]).render(30000);
 assert.deepEqual(a,b);
 const e=engine([...base,cc(11,0,0,.2)]).render(30000);assert.equal(peak(e.left.subarray(10000)),0);
 const c=engine(base);c.muted[0]=true;assert.equal(peak(c.render(1000).right),0);
});
test('phase, tails, noise and controllers survive snapshot replay',()=>{
 const events=[on(),on(38,9,100,.02),cc(11,88,0,.04),{type:'off',channel:0,note:60,time:.05}];
 const a=engine(events);a.advance(2500);const snap=structuredClone(a.snapshot());const b=engine(events);b.restore(snap);
 assert.deepEqual(a.render(12000),b.render(12000));
});
test('future NoteOff cannot retroactively change an earlier PCM prefix',()=>{
 const a=engine([on(),{type:'off',channel:0,note:60,time:.4}]).render(10000);
 const b=engine([on(),{type:'off',channel:0,note:60,time:2}]).render(10000);assert.deepEqual(a,b);
});
test('native Hold1 chooses a finite25000-frame release',()=>{
 const c=engine([cc(64,127),{type:'program',channel:0,value:16,time:0},on(),{type:'off',channel:0,note:60,time:.1}]);
 c.advance(4500);assert.ok(c.active().length===1);c.advance(26000);assert.equal(c.active().length,0);
});
test('matching overlapping pitches release together in the inspected native route',()=>{
 const c=engine([]);c.event(on());c.event(on());c.advance(1000);c.event({type:'off',channel:0,note:60});
 assert.ok(c.slots.filter(Boolean).every(v=>v.owner===null));
});
test('PC50 uses pitch threshold60, not parity',()=>{
 const make=n=>engine([{type:'program',channel:9,value:50,time:0},on(n,9)]).render(3000);
 assert.deepEqual(make(0),make(1));assert.deepEqual(make(35),make(40));assert.notDeepEqual(make(59),make(60));
});
test('45-slot route refuses overflow instead of stealing oldest',()=>{
 const c=engine([]);for(let i=0;i<46;i++)c.event(on(40+i));assert.equal(c.active().length,45);assert.equal(c.stats.dropped,1);
});
test('MIDI master volume scales both channels and native loose checksum is surfaced',()=>{
 const c=engine([on()]);c.event({type:'sysex',data:[65,16,66,18,64,0,4,64,60,247]});
 assert.equal(c.masterVolume,64);assert.equal(c.warnings.size,1);
 c.event({type:'sysex',data:[65,16,66,18,64,0,4,127,61,247]});assert.equal(c.masterVolume,127);
});
test('GM and GS mode messages are recognized without inventing a blanket reset',()=>{
 const c=engine([]);c.event({type:'program',channel:0,value:40});c.event({type:'sysex',data:[65,16,66,18,64,0,127,0,65,247]});
 assert.equal(c.mode,'GS');assert.equal(c.states[0].program,40);
 c.event({type:'sysex',data:[126,127,9,1,247]});assert.equal(c.mode,'GM');
});
test('seeded MT noise is deterministic but not claimed equal to original runtime state',()=>{
 const a=new PCM.RandomMT(4357),b=new PCM.RandomMT(4357);for(let i=0;i<2000;i++)assert.equal(a.next(),b.next());
});
test('all melodic and percussion notes render finitePCM; overfull mixes saturate safely',()=>{
 const c=engine([]);for(let i=0;i<128;i++){c.event(on(i,9,127));const a=c.render(256);assert.ok(a.left.every(Number.isFinite));}
 const d=new PCM.Engine(D,{stagger:false}).load(song([]));d.event({type:'program',channel:0,value:16});d.event(cc(7,127));
 for(let i=0;i<45;i++)d.event(on(60,0,127));const a=d.render(5000);assert.ok(peak(a.left)<1);assert.ok(d.stats.clippedFrames>0);
});
test('invalid sequence, clock, banks and snapshots fail explicitly',()=>{
 assert.throws(()=>new PCM.Engine(D,{instrumentSet:8}));assert.throws(()=>engine([{...on(),time:NaN}]));
 assert.throws(()=>PCM.compile(song([]),'wrong'));assert.throws(()=>engine([]).restore({version:'wrong'}));
});
