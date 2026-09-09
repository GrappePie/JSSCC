/* Compatibility adapter for legacy Online Sequencer MIDI exports.
 * Some >16-track exports encode a second melodic bank by starting a late named
 * track with Channel Pressure (Dn pp) at tick 0, where pp is actually the GM
 * program for that track. The track then reuses channel n. A normal MIDI parser
 * treats the pressure as aftertouch and the notes inherit the first-bank program.
 * We rewrite only that narrow signature to MIDI Port 1 + Program Change so the
 * existing 32-channel JSSCC parser/synth can keep both instruments independent.
 */
(function(root){
  'use strict';
  const P=root.JSSCCParser;
  if(!P||typeof P.parseMidi!=='function')return;
  const original=P.parseMidi.bind(P);
  const ascii=(b,p,s)=>String.fromCharCode(...b.subarray(p,p+s));
  const u32=(b,p)=>(b[p]*0x1000000+b[p+1]*0x10000+b[p+2]*0x100+b[p+3])>>>0;
  const be32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
  const chipPrograms=Object.freeze({
    '8-bit sine':71,
    '8-bit square':80,
    '8-bit sawtooth':81,
    '8-bit triangle':75
  });
  const chipProgram=name=>chipPrograms[String(name||'').trim().toLowerCase()];
  function vlqAt(b,p,end){let value=0,start=p;for(let i=0;i<4&&p<end;i++){const x=b[p++];value=value*128+(x&127);if(!(x&128))return{value,start,end:p};}return null;}
  function inspectTrack(t,trackIndex,trackCount){
    if(trackCount<=16||trackCount>32||trackIndex<16)return null;
    let p=0,tick=0,running=0,name='',hasPort=false;
    while(p<t.length){
      const d=vlqAt(t,p,t.length);if(!d)return null;p=d.end;tick+=d.value;
      const deltaStart=d.start,deltaEnd=d.end;
      if(p>=t.length)return null;
      let status=t[p++],statusIndex=p-1;
      if(status<128){if(!running)return null;p--;status=running;statusIndex=p;}
      else if(status<240)running=status;
      if(status===255){
        if(p>=t.length)return null;const type=t[p++],len=vlqAt(t,p,t.length);if(!len)return null;p=len.end;if(p+len.value>t.length)return null;
        if(type===3)name=ascii(t,p,Math.min(len.value,160));
        if(type===33)hasPort=true;
        p+=len.value;if(type===47)break;continue;
      }
      if(status===240||status===247){running=0;const len=vlqAt(t,p,t.length);if(!len)return null;p=len.end+len.value;if(p>t.length)return null;continue;}
      if(status>=240)return null;
      const type=status&240;
      const need=type===192||type===208?1:2;
      if(p+need>t.length)return null;
      const x=t[p],eventEnd=p+need;
      // First channel event of a late named track, at tick zero, must be Dn pp.
      // Requiring a name and no explicit port keeps ordinary aftertouch untouched.
      if(type===208&&tick===0&&name&&!hasPort){
        const channel=status&15,delta=Array.from(t.subarray(deltaStart,deltaEnd));
        // Online Sequencer's MIDI export collapses Sine/Square/Triangle onto the
        // same GM lead. Track names let us recover the distinct SCC waveforms.
        const program=chipProgram(name);
        return{start:deltaStart,end:eventEnd,replacement:[...delta,255,33,1,1,0,192|channel,program===undefined?x:program],chip:program!==undefined};
      }
      return null;
    }
    return null;
  }
  function patch(input){
    const b=input instanceof ArrayBuffer?new Uint8Array(input):ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):null;
    if(!b||b.length<14||ascii(b,0,4)!=='MThd')return null;
    const h=u32(b,4);if(h<6||8+h>b.length)return null;
    const format=(b[8]<<8)|b[9],tracks=(b[10]<<8)|b[11];if(format!==1||tracks<=16||tracks>32)return null;
    const chunks=[Array.from(b.subarray(0,8+h))];let p=8+h,ti=0,patched=0,chipPatched=0;
    while(p+8<=b.length){const kind=ascii(b,p,4),size=u32(b,p+4),dataStart=p+8,dataEnd=dataStart+size;if(dataEnd>b.length)return null;
      let data=Array.from(b.subarray(dataStart,dataEnd));
      if(kind==='MTrk'){
        const hit=inspectTrack(b.subarray(dataStart,dataEnd),ti,tracks);
        if(hit){data=[...data.slice(0,hit.start),...hit.replacement,...data.slice(hit.end)];patched++;if(hit.chip)chipPatched++;}
        ti++;
      }
      chunks.push([...Array.from(b.subarray(p,p+4)),...be32(data.length),...data]);p=dataEnd;
    }
    if(!patched)return null;
    const length=chunks.reduce((n,c)=>n+c.length,0),out=new Uint8Array(length);let o=0;for(const c of chunks){out.set(c,o);o+=c.length;}
    return{bytes:out,patched,chipPatched};
  }
  P.parseMidi=function(input,fileName='MIDI'){
    const result=patch(input);const midi=original(result?result.bytes:input,fileName);
    if(result){
      midi.warnings=[...(midi.warnings||[]),'Online Sequencer second-bank instruments mapped to independent MIDI Port 1 channels'];
      if(result.chipPatched)midi.warnings.push('Online Sequencer 8-bit track names mapped to dedicated SCC sine/square/saw/triangle waveforms');
      midi.compatibility={...(midi.compatibility||{}),onlineSequencerSecondBankTracks:result.patched,onlineSequencerChipTracks:result.chipPatched};
    }
    return midi;
  };
  root.JSSCCOnlineSequencerMidiCompat={patch,chipPrograms};
})(typeof window!=='undefined'?window:globalThis);
