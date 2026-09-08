/* Read-only metering. This observer never writes to a voice or changes PCM samples. */
(function(root){
  'use strict';
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
  class Observer {
    constructor(){this.reset();}
    reset(){
      this.stamp=new Float64Array(32).fill(-1);this.left=new Int32Array(32);this.right=new Int32Array(32);
      this.count=new Uint8Array(32);this.peakPoly=new Uint8Array(32);this.peaks=new Float32Array(32);
      this.env=new Float32Array(32);this.last=Array.from({length:32},()=>({frequency:0,waveIndex:0,program:0}));
    }
    flush(c){
      if(this.stamp[c]<0)return;
      this.peaks[c]=Math.max(this.peaks[c],Math.abs(this.left[c]),Math.abs(this.right[c]));
      this.peakPoly[c]=Math.max(this.peakPoly[c],this.count[c]);
    }
    capture(v,value,frame,muted){
      const c=v.channel;
      if(this.stamp[c]!==frame){this.flush(c);this.stamp[c]=frame;this.left[c]=this.right[c]=this.count[c]=0;}
      if(!v.alive)return;
      this.count[c]++;
      // Observe the very same integer, per-voice panning terms as the PCM mixer.
      if(!muted){this.left[c]=(this.left[c]+(Math.imul(value,127-v.pan)>>7))|0;this.right[c]=(this.right[c]+(Math.imul(value,v.pan)>>7))|0;}
      const level=v.env?clamp(v.env.level/(65535*16384)):clamp((v.volume>>16)/127);
      this.env[c]=Math.max(this.env[c],level);
      this.last[c].frequency=v.frequency;this.last[c].waveIndex=v.waveIndex;this.last[c].program=v.program;
    }
    report(core){
      const poly=new Uint8Array(32);
      for(const v of core.slots)if(v&&v.alive)poly[v.channel]++;
      const channels=[];
      for(let c=0;c<32;c++){
        this.flush(c);
        channels.push({poly:poly[c],peakPoly:this.peakPoly[c],envelope:this.env[c],
          // Per-channel pre-global-clipping peak, before the user's output slider.
          peak:this.peaks[c]/(3*32768)*(core.masterVolume/128),...this.last[c]});
        this.stamp[c]=-1;this.left[c]=this.right[c]=this.count[c]=this.peakPoly[c]=this.peaks[c]=this.env[c]=0;
      }
      return channels;
    }
  }
  const dbMeter=x=>x>0?clamp((20*Math.log10(x)+48)/48):0;
  const approach=(from,to,dt)=>Math.abs(from-to)<.0005?to:from+(to-from)*(1-Math.exp(-clamp(dt,0,.1)/(to>from?.012:.12)));
  /* Flow health is deliberately NOT presented as WinMM queue occupancy or CPU load.
     A fresh advancing audio heartbeat is healthy; stale telemetry is 'unknown',
     not proof of a physical underrun. Optional native underrun counts are separate. */
  class FlowHealth {
    constructor(){this.reset();}
    reset(){this.lastFrame=null;this.lastAt=null;this.advanced=false;this.underruns=null;this.glitchAt=-Infinity;}
    observe(frame,now){
      if(!Number.isFinite(frame))return;
      if(this.lastFrame===null||frame!==this.lastFrame){this.advanced=this.lastFrame!==null;this.lastFrame=frame;this.lastAt=now;}
    }
    read({now,state,contextState,underruns=null}){
      if(Number.isFinite(underruns)){
        if(this.underruns!==null&&underruns>this.underruns)this.glitchAt=now;
        this.underruns=underruns;
      }
      if(state!=='playing')return {value:0,status:state,source:'audio-heartbeat',underruns:this.underruns};
      if(contextState!=='running')return {value:0,status:'suspended',source:'audio-heartbeat',underruns:this.underruns};
      if(!this.advanced||this.lastAt===null)return {value:0,status:'starting',source:'audio-heartbeat',underruns:this.underruns};
      const age=Math.max(0,now-this.lastAt),value=clamp(1-(age-150)/600);
      return {value:now-this.glitchAt<1000?Math.min(value,.2):value,
        status:now-this.glitchAt<1000?'underrun':age>150?'telemetry-stale':'active',
        source:'audio-heartbeat',telemetryAgeMs:age,underruns:this.underruns};
    }
  }
  const api={Observer,dbMeter,approach,FlowHealth,clamp};
  root.JSSCCMeterData=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='undefined'?this:globalThis);
