/* Browser transport for the independently written B236E PCM kernel.
 * Preparation and bounded seek replay are async; audio synthesis runs in AudioWorklet.
 */
(function(root){
  'use strict';
  const PCM=root.JSSCCPCM;
  const scriptURL=document.currentScript && document.currentScript.src;
  const moduleURL=scriptURL?new URL('./pcm-worklet.js?v=ui-live-1',scriptURL).href:null;
  const prepared=new WeakMap();
  async function prepare(context) {
    if(!context.audioWorklet||typeof AudioWorkletNode==='undefined')throw Error('AudioWorklet no está disponible; selecciona el motor Web Audio anterior.');
    if(!prepared.has(context)) {
      // Fetch on the main scope, then bundle the exact kernel and processor into
      // one module. No eval, external service or replacement audio implementation.
      const loading=(async()=>{
        const url=moduleURL || new URL('./js/pcm-worklet.js?v=ui-live-1',document.baseURI).href;
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),10000);
        let objectURL=null, moduleTimer=null, warmup=null, silence=null;
        try {
          // Start a silent native graph before module registration. Some realtime
          // contexts defer their render thread until an active source is connected.
          // OfflineAudioContext must not be resumed before startRendering.
          if (typeof context.close === 'function') {
            warmup=context.createConstantSource();silence=context.createGain();
            silence.gain.value=0;warmup.connect(silence).connect(context.destination);warmup.start();
            await context.resume();
          }
          const files=await Promise.all([new URL('./pcm-core.js?v=ui-live-1',url).href,new URL('./ui-meter-data.js?v=ui-live-1',url).href,url].map(async path=>{
            const response=await fetch(path,{signal:controller.signal});
            if(!response.ok)throw Error('No se pudo cargar el módulo PCM: '+response.status);
            return response.text();
          }));
          const importLine="import './pcm-core.js';\nimport './ui-meter-data.js';\n";
          if(!files[2].startsWith(importLine))throw Error('Formato de procesador PCM inesperado');
          objectURL=URL.createObjectURL(new Blob([files[0],'\n',files[1],'\n',files[2].slice(importLine.length)],{type:'text/javascript'}));
          await Promise.race([
            context.audioWorklet.addModule(objectURL),
            new Promise((_,reject)=>{moduleTimer=setTimeout(()=>reject(Error('No se pudo iniciar AudioWorklet; selecciona el motor anterior')),8000);})
          ]);
        } finally {
          clearTimeout(timeout);clearTimeout(moduleTimer);
          if(warmup){try{warmup.stop();}catch(_){}warmup.disconnect();silence.disconnect();}
          if(objectURL)URL.revokeObjectURL(objectURL);
        }
      })().catch(error=>{prepared.delete(context);throw error;});
      prepared.set(context,loading);
    }
    return prepared.get(context);
  }
  class Synth {
    constructor(context,data,midi,{instrumentSet=0,masterGain=.25}={}) {
      this.context=context;this.data=data;this.midi=midi;this.bank=instrumentSet;
      this.warnings=new Set();this.items=[];this.pending=new Map();this.serial=0;this.muted=Array(32).fill(false);
      this.states=Array.from({length:32},()=>({program:0,volume:100/127,expression:1,pan:0,bend:0}));
      this.master=context.createGain();this.master.gain.value=masterGain;this.master.connect(context.destination);
      this.node=new AudioWorkletNode(context,'jsscc-b236-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],
        processorOptions:{data,midi,options:{instrumentSet}}});
      this.node.connect(this.master);
      this.node.onprocessorerror=()=>{this.warnings.add('PCM processor failed');this.onError&&this.onError(Error('El procesador PCM falló'));};
      this.node.port.onmessage=({data:m})=>{
        if(m.ack&&this.pending.has(m.ack)) {
          const pending=this.pending.get(m.ack);clearTimeout(pending.timer);this.pending.delete(m.ack);
          if(m.error)pending.reject(Error(m.error));else pending.resolve(m);
        }
        if(m.telemetry) {
          this.items=m.active;this.stats=m.stats;this.warnings=new Set(m.warnings);
          this.meterPacket={sequence:m.sequence,channels:m.meters,frame:m.frame,contextFrame:m.contextFrame,receivedAt:performance.now()};
          this.states=m.states.map(s=>({...s,volume:s.volume/127,expression:s.expression/127,pan:(s.pan-64)/(s.pan<64?64:63)}));
        }
        if(m.ended&&this.onEnded)this.onEnded();
      };
    }
    command(type,fields={},ack=false) {
      if(!ack){this.node.port.postMessage({type,...fields});return Promise.resolve();}
      const id=++this.serial;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('El procesador de audio no respondió'));},5000);
        this.pending.set(id,{resolve,reject,timer});this.node.port.postMessage({type,...fields,id});
      });
    }
    get instrumentSet(){return this.bank;}
    set instrumentSet(value){this.bank=value;this.command('bank',{value});}
    wave(program){return this.data.wavetables[this.data.instrumentSets[this.bank].map[program&127]];}
    active(){return this.items;}
    mute(channel,value){this.muted[channel]=value;this.command('mute',{channel,value});}
    reset(){this.items=[];this.meterPacket=null;this.command('reset');this.muted.forEach((v,c)=>this.mute(c,v));}
    dispose(){
      this.node.disconnect();this.node.port.close();this.master.disconnect();
      for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Audio disposed'));}this.pending.clear();
    }
  }
  class Transport {
    constructor(context,synth,midi) {
      this.context=context;this.synth=synth;this.midi={...midi,duration:PCM.compile(midi).duration};this.state='stopped';this.repeat=false;
      this.offset=0;this.start=0;this.queue=Promise.resolve();this.ended=false;this.disposed=false;
      synth.onEnded=()=>{this.ended=true;};
      synth.onError=()=>{this.state='paused';};
    }
    serial(fn){const p=this.queue.then(fn);this.queue=p.catch(()=>{});return p;}
    get position(){return this.state==='playing'?Math.max(0,this.offset+this.context.currentTime-this.start):this.offset;}
    async startPlayback(){
      await this.context.resume();
      const reply=await this.synth.command('play',{},true);
      this.offset=reply.frame/44100;this.start=reply.contextFrame/this.context.sampleRate;this.state='playing';
    }
    play(){return this.serial(async()=>{
      if(this.state==='playing')return;
      if(this.offset>=this.midi.duration){this.synth.reset();this.offset=0;}
      await this.startPlayback();
    });}
    pause(){return this.serial(async()=>{
      if(this.state!=='playing')return;
      const reply=await this.synth.command('pause',{},true);
      await this.context.suspend();this.offset=reply.frame/44100;this.state='paused';
    });}
    stop(){return this.serial(async()=>{
      if(this.context.state==='running')await this.synth.command('pause',{},true);
      await this.context.suspend();this.state='stopped';this.offset=0;this.ended=false;this.synth.reset();
    });}
    seek(value){return this.serial(async()=>{
      if(!Number.isFinite(value))throw Error('Posición inválida');
      const playing=this.state==='playing',target=Math.max(0,Math.min(value,this.midi.duration));
      if(this.context.state==='running')await this.synth.command('pause',{},true);
      await this.context.suspend();this.state='paused';
      // Replay in bounded chunks to preserve phase, release tails and the RNG state.
      const engine=new PCM.Engine(this.synth.data,{instrumentSet:this.synth.bank}).load(this.midi);
      const end=Math.floor(target*44100);
      while(engine.frame<end){engine.advance(Math.min(16384,end-engine.frame));await new Promise(r=>setTimeout(r,0));}
      await this.synth.command('restore',{snapshot:engine.snapshot()});
      this.synth.muted.forEach((v,c)=>this.synth.mute(c,v));this.offset=end/44100;this.ended=false;
      if(playing)await this.startPlayback();
    });}
    tick(){
      if(!this.ended)return;
      this.ended=false;
      const operation=this.repeat?this.stop().then(()=>this.play()):this.stop();
      operation.catch(error=>this.synth.warnings.add(error.message));
    }
  }
  async function renderMidi(midi,data,{instrumentSet=0,masterGain=.25,tailSeconds=1,muted=[]}={}) {
    if(!Number.isFinite(masterGain)||masterGain<0||masterGain>2)throw Error('Ganancia inválida');
    if(!Number.isFinite(tailSeconds)||tailSeconds<0||tailSeconds>30)throw Error('Cola WAV inválida');
    const duration=PCM.compile(midi).duration;
    const length=Math.ceil((duration+tailSeconds)*44100);
    if(length>44100*600)throw Error('La exportación PCM está limitada a 10 minutos para evitar agotar la memoria');
    const engine=new PCM.Engine(data,{instrumentSet,outputGain:masterGain*4}).load(midi);
    muted.forEach(c=>engine.muted[c]=true);
    const left=new Float32Array(length),right=new Float32Array(length);
    for(let at=0;at<length;at+=16384) {
      const n=Math.min(16384,length-at);engine.render(n,left.subarray(at,at+n),right.subarray(at,at+n));
      await new Promise(r=>setTimeout(r,0));
    }
    return {sampleRate:44100,length,numberOfChannels:2,getChannelData:c=>c===0?left:right,
      pcmDiagnostics:engine.diagnostics()};
  }
  root.JSSCCPCMBridge={prepare,Synth,Transport,renderMidi,wav:b=>PCM.wav(b.getChannelData(0),b.getChannelData(1),b.sampleRate)};
})(window);
