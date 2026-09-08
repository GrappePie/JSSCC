/* Display-only state and dirty-region rendering for the original pixel-art panel.
 * Does not alter notes, the PCM kernel, exported audio, or the audio clock.
 */
(function(root){
  'use strict';
  const M=root.JSSCCMeterData, clamp=M.clamp;
  const VERSION='ui-live-20260908.2';
  // B236E bitmap 133, y650, x36+18*min(activeVoices,6). See docs/POLY_COLORS_20260908.md.
  // This is voice count, NOT volume, clipping, CPU load, or a warning scale.
  const POLY_COLORS=Object.freeze(['#5c1f09','#b50000','#ef2f00','#ff6c00','#ff9f00','#ffcc00','#ffff3c']);
  const polyToColor=(voices,palette)=>{
    const n=Number.isFinite(voices)?Math.max(0,Math.min(6,Math.floor(voices))):0;
    return n===0?palette.foreground:POLY_COLORS[n];
  };
  const meterKey=x=>Math.floor(clamp(x)*15+1e-6);
  const panKey=x=>x===null?'off':Math.round(clamp(x,-1,1)*8);
  const timeText=seconds=>{
    const ms=Math.floor(Math.max(0,seconds)*1000),s=Math.floor(ms/1000);
    return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(x=>String(x).padStart(2,'0')).join(' : ')+" '"+String(ms%1000).padStart(3,'0');
  };
  class Panel {
    constructor(){this.renderer=null;this.palette=null;this.keys=new Map();this.frames=0;this.fullRedraws=0;this.regionDraws=0;}
    draw(r,song){
      if(!r||!r.initialized||r.loadEvents!==0)return;
      if(r!==this.renderer||r.palette!==this.palette){
        this.renderer=r;this.palette=r.palette;this.keys.clear();
        r.polyToColor=n=>polyToColor(n,r.palette);
        r.redraw();this.fullRedraws++;
      }
      const group=(name,key,index)=>{
        const id=name+':'+(index??'');
        if(this.keys.get(id)===key)return;
        this.keys.set(id,key);this.regionDraws++;
        if(index===undefined)r.drawDGroup(name);else r.drawChannel(index,name);
      };
      song.channels.forEach((c,i)=>{
        group('channelMute',c.mute,i);
        // Redraw lamp after a mute icon redraw, which includes its inner frame.
        group('channelPoly',[c.polyDisplay||c.poly,c.mute].join(','),i);
        group('channelVEN',[c.volume,c.expression,c.envelope,c.output].map(meterKey).join(',')+c.mute,i);
        group('channelPitchbend',panKey(c.pitchbend),i);group('channelPanpot',panKey(c.panpot),i);
        const pc=String(c.percussion).padStart(3,'0');
        if(this.keys.get('pc:'+i)!==pc){
          this.keys.set('pc:'+i,pc);const x=58+(i%16)*36,y=49+Math.floor(i/16)*168;
          r.filledRect(x+1,y+98,31,8,r.palette.background);r.drawChannel(i,'channelPercussion');this.regionDraws++;
        }
        if(this.keys.get('cc0:'+i)!==c.cc0){
          this.keys.set('cc0:'+i,c.cc0);const x=58+(i%16)*36,y=49+Math.floor(i/16)*168;
          r.filledRect(x+1,y+109,31,8,r.palette.background);r.drawChannel(i,'channelCC0');this.regionDraws++;
        }
        group('channelHoldSoft',!!c.hold,i);
        group('channelFrequency',c.freq,i);
        if(!c.drum)group('channelWaveform',c.waveKey,i);
      });
      group('buffer',Math.round(clamp(song.buffer)*218));
      group('positionSlider',Math.round(clamp(song.position)*235));
      group('songName',song.fileName);
      group('songInfo',[song.timeText,song.bpm,song.ppq].join(','));
      this.frames++;
    }
  }
  class Monitor {
    constructor(){
      this.panel=new Panel();this.flow=new M.FlowHealth();this.lastNow=null;
      this.lastSource=null;this.lastSequence=-1;this.midi=null;this.mode=null;
      this.channels=Array.from({length:32},()=>({output:0,envelope:0,lampUntil:0,lamp:0,waveKey:null}));
      this.health={value:0,status:'stopped',source:'audio-heartbeat'};
      this.eventIndex=0;this.events=[];this.cc0=new Uint8Array(32);this.bpm=0;this.lastPosition=0;
    }
    reset(midi,mode){
      this.midi=midi;this.mode=mode;this.eventIndex=0;this.cc0.fill(0);this.lastPosition=0;this.bpm=midi?(mode==='pcm'?180:120):0;
      this.flow.reset();this.lastSequence=-1;this.lastSource=null;
      for(const c of this.channels){c.output=c.envelope=c.lampUntil=c.lamp=0;c.waveKey=null;}
      this.events=[];
      if(!midi)return;
      // Compile a separate read-only display timeline; do not send markers to audio.
      const markers=(midi.tempoEvents||[]).map(t=>({...t,type:'displayTempo',channel:0,time:t.seconds||0}));
      if(mode==='pcm'){
        this.events=root.JSSCCPCM.compile({...midi,events:[...midi.events,...markers]}).events
          .filter(e=>e.type==='displayTempo'||e.type==='cc'&&e.controller===0).map(e=>({...e,displayTime:e.frame/44100}));
      }else{
        this.events=[...midi.events.filter(e=>e.type==='cc'&&e.controller===0),...markers]
          .map(e=>({...e,displayTime:e.type==='displayTempo'?e.time:e.time}));
      }
      this.events.sort((a,b)=>a.displayTime-b.displayTime||(a.order||0)-(b.order||0));
    }
    timeline(position){
      if(position<this.lastPosition-.001){this.eventIndex=0;this.cc0.fill(0);this.bpm=this.midi?(this.mode==='pcm'?180:120):0;}
      while(this.eventIndex<this.events.length&&this.events[this.eventIndex].displayTime<=position){
        const e=this.events[this.eventIndex++];
        if(e.type==='displayTempo')this.bpm=Math.floor(60000000/e.us);
        else this.cc0[e.channel]=e.value;
      }
      this.lastPosition=position;
    }
    update({now,song,synth,context,transport,midi,mode,muted,gain,data}){
      if(this.midi!==midi||this.mode!==mode)this.reset(midi,mode);
      if(this.lastSource!==synth){this.flow.reset();this.lastSequence=-1;this.lastSource=synth;}
      const dt=this.lastNow===null?1/60:Math.min(.1,(now-this.lastNow)/1000);this.lastNow=now;
      const state=transport?transport.state:'stopped',running=state==='playing',stopped=state==='stopped';
      const position=transport?transport.position:0;this.timeline(position);
      const packet=mode==='pcm'&&synth?synth.meterPacket:null;
      const fresh=packet&&packet.sequence!==this.lastSequence;
      if(fresh){this.lastSequence=packet.sequence;this.flow.observe(packet.contextFrame,now);}
      if(mode==='legacy'&&context)this.flow.observe(context.currentTime,now);
      const voices=Array.from({length:32},()=>[]);
      if(synth&&!stopped)for(const v of synth.active())voices[v.channel].push(v);
      song.channels.forEach((c,i)=>{
        const model=this.channels[i],list=voices[i],st=synth?synth.states[i]:null;
        const current=list.reduce((a,v)=>!a||v.start>=a.start?v:a,null);
        const met=packet&&packet.channels?packet.channels[i]:null;
        const count=stopped?0:list.length;
        c.poly=count;
        if(stopped){model.output=model.envelope=model.lamp=model.lampUntil=0;}
        else if(fresh&&met&&met.peakPoly>0){model.lampUntil=now+65;model.lamp=met.peakPoly;}
        else if(mode==='legacy'&&count){model.lampUntil=now+65;model.lamp=count;}
        c.polyDisplay=muted[i]?0:Math.max(count,now<model.lampUntil?model.lamp:0);
        const active=count>0||now<model.lampUntil;
        c.volume=active&&st?st.volume:0;c.expression=active&&st?st.expression:0;
        let target=0,env=0;
        if(!stopped&&mode==='pcm'&&met){target=M.dbMeter(met.peak*gain*4);env=met.envelope;}
        else if(current&&synth){
          env=clamp(synth.amplitudeAt(current,context.currentTime)/Math.max(1e-9,current.peak));
          // Legacy has no discrete channel PCM observer; show its real envelope trajectory.
          target=clamp(env*(current.velocity/127)*(st?st.volume*st.expression:1));
        }
        if(muted[i])target=env=0;
        if(running||stopped){model.output=M.approach(model.output,target,dt);model.envelope=M.approach(model.envelope,env,dt);}
        if(stopped)model.output=model.envelope=0;
        c.output=model.output;c.envelope=model.envelope;
        c.panpot=st?st.pan:null;c.pitchbend=st?(mode==='pcm'?st.bend/8192:st.bend):null;
        c.percussion=(st?st.program:0)+1;c.cc0=this.cc0[i];c.hold=!!(st&&st.sustain);
        c.freq=stopped||!active?0:Math.round(mode==='pcm'&&met?met.frequency||0:current?440*Math.pow(2,((current.note>=0?current.note:current.drumNote)-69)/12):0);
        const wave=current&&current.wave?current.wave:st&&synth?synth.wave(st.program):data.wavetables[data.instrumentSets[0].map[0]];
        // Reuse the closure; never allocate32 waveform functions on every animation frame.
        const key=wave.name+':'+wave.samples.join(',');
        c.waveKey=key;
        if(model.waveKey!==key){model.waveKey=key;const samples=wave.samples;c.wave=x=>samples[Math.floor(((x%1+1)%1)*samples.length)]/128;}
      });
      let underruns=null;
      try{if(context&&context.playbackStats&&Number.isFinite(context.playbackStats.underrunEvents))underruns=context.playbackStats.underrunEvents;}catch(_){}
      this.health=this.flow.read({now,state,contextState:context?context.state:'not-created',underruns});
      song.buffer=this.health.value;
      song.timeText=timeText(position);song.bpm=Math.min(999,this.bpm);song.ppq=midi?Math.min(999,midi.ppq||0):0;
      return this.health;
    }
    diagnostics(){return {version:VERSION,animation:'requestAnimationFrame',frames:this.panel.frames,
      fullRedraws:this.panel.fullRedraws,regionDraws:this.panel.regionDraws,buffer:{...this.health},
      polyphony:this.channels.map(c=>c.lamp),audioKernelModified:false};}
  }
  root.JSSCCUIMonitor={VERSION,Monitor,Panel,timeText,POLY_COLORS,polyToColor};
})(window);
