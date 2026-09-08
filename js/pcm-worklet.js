import './pcm-core.js';
/* Same integer PCM kernel as offline exports. The browser only delivers its samples. */
class B236PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const p=options.processorOptions;
    this.core=new globalThis.JSSCCPCM.Engine(p.data,{...p.options,outputGain:4}).load(p.midi);
    this.midi=p.midi;this.playing=!!p.autoplay;this.blocks=0;
    this.port.onmessage=({data:m})=>{
      try {
        if(m.type==='play')this.playing=true;
        else if(m.type==='pause')this.playing=false;
        else if(m.type==='reset'){this.core.load(this.midi);this.playing=false;this.primed=false;}
        else if(m.type==='restore'){this.core.restore(m.snapshot);this.primed=false;}
        else if(m.type==='bank')this.core.options.instrumentSet=m.value;
        else if(m.type==='mute')this.core.muted[m.channel]=m.value;
        if(m.id)this.port.postMessage({ack:m.id,frame:this.core.frame,contextFrame:currentFrame});
        this.report();
      } catch(error){this.port.postMessage({error:error.message,ack:m.id});this.playing=false;}
    };
  }
  report() {
    this.port.postMessage({telemetry:true,playing:this.playing,frame:this.core.frame,contextFrame:currentFrame,
      states:this.core.states,active:this.core.active(),stats:this.core.stats,warnings:[...this.core.warnings]});
  }
  process(inputs,outputs) {
    const out=outputs[0];if(!out||out.length<2)return true;
    if(this.playing) {
      const ratio=44100/sampleRate;
      for(let i=0;i<out[0].length;i++) {
        if(sampleRate===44100) {
          this.core.step();out[0][i]=this.core.left;out[1][i]=this.core.right;
        } else {
          // Explicit final resampling only when hardware refuses a 44100-Hz context.
          if(!this.primed){this.core.step();this.a=[this.core.left,this.core.right];this.core.step();this.b=[this.core.left,this.core.right];this.phase=0;this.primed=true;}
          out[0][i]=this.a[0]+(this.b[0]-this.a[0])*this.phase;
          out[1][i]=this.a[1]+(this.b[1]-this.a[1])*this.phase;
          this.phase+=ratio;
          while(this.phase>=1){this.a[0]=this.b[0];this.a[1]=this.b[1];this.core.step();this.b[0]=this.core.left;this.b[1]=this.core.right;this.phase-=1;}
        }
      }
      if(this.core.frame>=Math.ceil((this.core.duration+8)*44100)||
        (this.core.frame>=Math.ceil(this.core.duration*44100)&&this.core.index===this.core.events.length&&!this.core.slots.some(v=>v&&v.alive))) {
        this.playing=false;this.port.postMessage({ended:true});this.report();
      }
    }
    if(++this.blocks%16===0)this.report();
    return true;
  }
}
registerProcessor('jsscc-b236-pcm',B236PCMProcessor);
