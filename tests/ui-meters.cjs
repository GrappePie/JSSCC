'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const M=require('../js/ui-meter-data.js'),PCM=require('../js/pcm-core.js');
require('../js/gxscc-exact-data.js');const D=globalThis.GXSCC_EXACT_DATA;
const scope={window:{JSSCCMeterData:M,JSSCCPCM:PCM}};vm.runInNewContext(fs.readFileSync('js/ui-monitor.js','utf8'),scope);const UI=scope.window.JSSCCUIMonitor;
const midi={duration:.5,events:[{time:0,type:'program',channel:0,value:40},{time:0,type:'on',channel:0,note:60,velocity:100},{time:.15,type:'off',channel:0,note:60},{time:.2,type:'on',channel:9,note:38,velocity:110}]};
test('PCM observer leaves every output sample and engine snapshot unchanged',()=>{
 const a=new PCM.Engine(D).load(midi),b=new PCM.Engine(D).load(midi),m=new M.Observer(),original=b.voiceSample;
 b.voiceSample=v=>{const value=original.call(b,v);m.capture(v,value,b.frame,b.muted[v.channel]);return value;};
 for(let i=0;i<22050;i++){a.step();b.step();assert.equal(a.left,b.left);assert.equal(a.right,b.right);if(i%128===0)m.report(b);}
 assert.deepEqual(a.snapshot(),b.snapshot());
});
test('meter catches short PSG snare and counts two actual voices',()=>{
 const core=new PCM.Engine(D).load({duration:.1,events:[{time:0,type:'on',channel:9,note:38,velocity:100}]}),obs=new M.Observer(),sample=core.voiceSample;
 core.voiceSample=v=>{const y=sample.call(core,v);obs.capture(v,y,core.frame,false);return y;};
 core.advance(3000);const packet=obs.report(core);
 assert.equal(packet[9].poly,0);assert.equal(packet[9].peakPoly,2);assert.ok(packet[9].peak>0);assert.equal(packet[8].peak,0);assert.equal(packet[8].peakPoly,0);
 assert.equal(obs.report(core)[9].peak,0,'consuming packet must not invent another pulse');
});
test('muted voices consume polyphony but produce zero channel output meter',()=>{
 const core=new PCM.Engine(D).load(midi),obs=new M.Observer(),sample=core.voiceSample;core.muted[0]=true;
 core.voiceSample=v=>{const x=sample.call(core,v);obs.capture(v,x,core.frame,core.muted[v.channel]);return x;};core.advance(2048);
 const packet=obs.report(core);assert.equal(packet[0].poly,1);assert.equal(packet[0].peak,0);
});
test('buffer health is observed; pause/stop/suspended/stale are not fake queue occupancy',()=>{
 const f=new M.FlowHealth();assert.equal(f.read({now:0,state:'playing',contextState:'running'}).status,'starting');
 f.observe(128,0);f.observe(256,16);assert.equal(f.read({now:20,state:'playing',contextState:'running'}).value,1);
 assert.equal(f.read({now:1000,state:'playing',contextState:'running'}).status,'telemetry-stale');
 assert.equal(f.read({now:1000,state:'playing',contextState:'running'}).value,0);
 for(const state of ['paused','stopped'])assert.equal(f.read({now:1000,state,contextState:'suspended'}).value,0);
 f.observe(384,1100);assert.equal(f.read({now:1100,state:'playing',contextState:'running'}).value,1);
});
test('native underrun counts are optional; UI staleness never fabricates one',()=>{
 const f=new M.FlowHealth();f.observe(1,0);f.observe(2,1);
 assert.equal(f.read({now:2,state:'playing',contextState:'running'}).underruns,null);
 f.read({now:2,state:'playing',contextState:'running',underruns:0});
 assert.equal(f.read({now:3,state:'playing',contextState:'running',underruns:1}).status,'underrun');
 assert.equal(f.read({now:999,state:'playing',contextState:'running',underruns:1}).underruns,1);
});
test('meter smoothing is frame-rate independent and silent input tends to zero',()=>{
 let a=0,b=0;for(let i=0;i<60;i++)a=M.approach(a,1,1/60);for(let i=0;i<144;i++)b=M.approach(b,1,1/144);assert.ok(Math.abs(a-b)<.0005);
 for(let i=0;i<120;i++)a=M.approach(a,0,1/60);assert.equal(a,0);assert.equal(M.dbMeter(0),0);
});
test('UI JSON no longer clears the buffer after drawing it and POLY is dynamic',()=>{
 const g=JSON.parse(fs.readFileSync('assets/ui.json','utf8')).drawGroups;
 const ix=g.buffer.findIndex(x=>x[0]==='pbar');assert.ok(ix>0);assert.equal(g.buffer.slice(ix+1).some(x=>x[0]==='filledRect'),false);
 assert.ok(g.channelPoly[0][5].includes('polyToColor'));assert.ok(g.songInfo.some(x=>String(x[2]).includes('song.timeText')));
});
test('time display shows advancing milliseconds and multi-hour positions',()=>{
 assert.equal(UI.timeText(3661.123),"01 : 01 : 01 '123");assert.equal(UI.timeText(0),"00 : 00 : 00 '000");
});
test('dirty renderer never repaints static panel on every frame and responds to palette change',()=>{
 const r={initialized:true,loadEvents:0,palette:{foreground:'#111',light:'#eee',white:'#fff',background:'#222'},redraw(){},drawDGroup(){},drawChannel(){},filledRect(){}};
 const song={channels:[{poly:0,polyDisplay:0,mute:false,volume:0,expression:0,envelope:0,output:0,panpot:null,pitchbend:null,percussion:1,cc0:0,freq:0,hold:false,drum:false,waveKey:'a'}],buffer:0,position:0,timeText:'0',bpm:120,ppq:480,fileName:'test.mid'};
 const p=new UI.Panel();p.draw(r,song);let n=p.regionDraws;
 for(let i=0;i<120;i++)p.draw(r,song);assert.equal(p.fullRedraws,1);assert.equal(p.regionDraws,n);
 song.channels[0].polyDisplay=3;p.draw(r,song);assert.equal(p.regionDraws,n+1);assert.equal(r.polyToColor(0),'#111');assert.equal(r.polyToColor(1),'#eee');assert.equal(r.polyToColor(3),'#fff');
 r.palette={...r.palette,light:'#f00'};p.draw(r,song);assert.equal(p.fullRedraws,2);
});
test('primary renderer uses rAF and independent audio scheduling remains present',()=>{
 const s=fs.readFileSync('js/gxscc-exact-engine-v3.js','utf8');assert.ok(s.includes('requestAnimationFrame(animate)'));assert.ok(!s.includes('setInterval(renderUi'));assert.ok(s.includes('transport.tick();}},25)'));
});
