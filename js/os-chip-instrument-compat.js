/* Online Sequencer chip-instrument compatibility for remote protobuf playback.
 * OS instrument IDs 13..16 are distinct infinite 8-bit waveforms. Standard MIDI
 * collapses several of them to the same GM lead, but the SCC-like GXSCC bank
 * already contains matching PURE SIN, SQUARE 50%, RIGHT-DOWN SAW and TRIANGLE
 * wavetables. Patch only the generated Program Change bytes, keeping the original
 * protobuf decoder, timing, controllers and note conversion untouched.
 */
(function(root){
  'use strict';
  const codec=root.JSSCCSequenceCodec;
  if(!codec||typeof codec.encodeMidi!=='function'||typeof codec.decode!=='function')return;
  const VERSION='os-chip-map-20260909.1';
  // GXSCC SCC-like Full-Set program indices chosen for sustained envelopes and
  // the exact named wavetable in gxscc-exact-data.js:
  // 13 Sine -> program 71 -> PURE SIN
  // 14 Square -> program 80 -> SQUARE 50%
  // 15 Sawtooth -> program 81 -> RIGHT-DOWN SAW
  // 16 Triangle -> program 75 -> TRIANGLE
  const CHIP_PROGRAMS=Object.freeze({13:71,14:80,15:81,16:75});
  const u32=(b,p)=>(b[p]*0x1000000+b[p+1]*0x10000+b[p+2]*0x100+b[p+3])>>>0;
  function vlqAt(b,p,end){let value=0;for(let i=0;i<4&&p<end;i++){const x=b[p++];value=value*128+(x&127);if(!(x&128))return{value,end:p};}return null;}
  function patchProgram(track,program){
    let p=0,running=0;
    while(p<track.length){
      const d=vlqAt(track,p,track.length);if(!d)return false;p=d.end;
      if(p>=track.length)return false;
      let status=track[p++];
      if(status<128){if(!running)return false;p--;status=running;}else if(status<240)running=status;
      if(status===255){if(p>=track.length)return false;const type=track[p++],len=vlqAt(track,p,track.length);if(!len)return false;p=len.end+len.value;if(p>track.length)return false;if(type===47)return false;continue;}
      if(status===240||status===247){running=0;const len=vlqAt(track,p,track.length);if(!len)return false;p=len.end+len.value;if(p>track.length)return false;continue;}
      if(status>=240)return false;
      const type=status&240,need=type===192||type===208?1:2;
      if(p+need>track.length)return false;
      if(type===192){track[p]=program;return true;}
      p+=need;
    }
    return false;
  }
  function patch(bytes,seq){
    const b=bytes instanceof Uint8Array?bytes:null;if(!b||b.length<14)return 0;
    const audible=seq.notes.filter(n=>n.volume>0&&n.length>0),ids=[...new Set(audible.map(n=>n.instrument))];
    let p=14,trackIndex=0,patched=0;
    while(p+8<=b.length){
      if(String.fromCharCode(...b.subarray(p,p+4))!=='MTrk')break;
      const size=u32(b,p+4),start=p+8,end=start+size;if(end>b.length)break;
      if(trackIndex>0){const id=ids[trackIndex-1],program=CHIP_PROGRAMS[id%10000];if(program!==undefined&&patchProgram(b.subarray(start,end),program))patched++;}
      trackIndex++;p=end;
    }
    return patched;
  }
  const originalEncode=codec.encodeMidi.bind(codec);
  function encodeMidi(seq,metadata={}){
    const result=originalEncode(seq,metadata),patched=patch(result.bytes,seq);
    if(patched){
      result.report={...result.report,chipInstrumentMapVersion:VERSION,chipInstrumentTracks:patched,
        warnings:[...(result.report.warnings||[]),'Los instrumentos 8-bit de Online Sequencer usan formas SCC dedicadas (seno, cuadrada, diente de sierra y triángulo).']};
    }
    return result;
  }
  const wrapped=Object.freeze({...codec,encodeMidi,convert:(bytes,metadata)=>encodeMidi(codec.decode(bytes),metadata)});
  root.JSSCCSequenceCodec=wrapped;
  root.JSSCCOSChipInstrumentCompat=Object.freeze({VERSION,CHIP_PROGRAMS,patch});
})(typeof self!=='undefined'?self:globalThis);
