'use strict';
const C=require('../js/sequence-codec.js');
const u=n=>{n=BigInt.asUintN(64,BigInt(n));const b=[];do{let v=Number(n&127n);n>>=7n;b.push(v|(n?128:0));}while(n);return b;};
const int=(f,n)=>[...u(f*8),...u(n)];
const float=(f,n)=>{const b=Buffer.alloc(4);b.writeFloatLE(n);return [...u(f*8+5),...b];};
const chunk=(f,b)=>[...u(f*8+2),...u(b.length),...b];
function fixture({bpm=120,notes=[{pitch:60,time:0,length:24,instrument:8,volume:1}],markers=[],instruments=[],extra=[]}={}){
 const settings=[...int(1,bpm),...int(2,4)];
 for(const [id,s] of instruments){const v=[...float(1,s.volume??1),...float(4,s.pan??0),...float(9,s.detune??0)];settings.push(...chunk(3,[...int(1,id),...chunk(2,v)]));}
 const bytes=[...chunk(1,settings)];
 for(const n of notes)bytes.push(...chunk(2,[...int(1,n.pitch),...float(2,n.time??0),...float(3,n.length??4),...int(4,n.instrument??0),...float(5,n.volume??1)]));
 for(const m of markers)bytes.push(...chunk(3,[...float(1,m.time),...int(2,m.setting),...int(3,m.instrument??0),...float(4,m.value),...int(5,m.blend?1:0)]));
 return Uint8Array.from([...bytes,...extra]);
}
module.exports={fixture,int,float,chunk,u};
if(require.main===module) process.stdout.write(Buffer.from(fixture()));
