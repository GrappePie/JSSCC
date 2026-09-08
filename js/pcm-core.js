/* B236E PCM research kernel. No DOM, Web Audio, network, or executable code.
 * Addresses refer to SHA256 1eeeecf6ff72f34841983e05579114159748c70d0b3725d85af3301004992f7a.
 * Quantized oscillator: 401cff..401dd3. Integer envelope: 401aa1..401b60.
 * Linear pan / integer mixer / clipping: 401e03..401f9e.
 * This independently written implementation is experimental, NOT a full equivalence claim.
 */
(function (root) {
  'use strict';
  const VERSION = 'pcm-research-20260908.3';
  const RATE = 44100, FULL = 0x3fffc000;
  const f32 = Math.fround, trunc = Math.trunc, mul = Math.imul;
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const SEMITONES = [1,1.0594630241394043,1.1224620342254639,1.1892069578170776,
    1.2599209547042847,1.3348400592803955,1.414214015007019,1.4983069896697998,
    1.587401032447815,1.681792974472046,1.7817970514297485,1.8877489566802979];
  // Record DWORD +4 is an octave displacement, not generic flags (413e37,402522).
  const OCTAVES = Array(33).fill(0); OCTAVES[15] = -1;
  function pitchHz(note, cents=0, octave=0) {
    // Original interpolates between adjacent semitones, not exponential cents.
    const exact = note + cents / 100, n = Math.floor(exact), remainder = exact - n;
    const hz = k => Math.pow(2,Math.floor((k+24)/12)-7+octave) * 261.6300048828125 * SEMITONES[((k%12)+12)%12];
    return f32(hz(n)+(hz(n+1)-hz(n))*remainder);
  }
  class RandomMT {
    constructor(seed=4357) {
      this.state = new Uint32Array(624); this.index=624;
      // Original's old two-half-word initializer uses 69069*x+1, not the 2002 initializer.
      let x=seed>>>0;
      for(let i=0;i<624;i++) {
        const hi=x&0xffff0000; x=(mul(x,69069)+1)>>>0;
        this.state[i]=(hi|(x>>>16))>>>0; x=(mul(x,69069)+1)>>>0;
      }
    }
    next() {
      const s=this.state;
      if(this.index>=624) {
        for(let i=0;i<624;i++) {
          const y=((s[i]&0x80000000)|(s[(i+1)%624]&0x7fffffff))>>>0;
          s[i]=(s[(i+397)%624]^(y>>>1)^((y&1)?0x9908b0df:0))>>>0;
        }
        this.index=0;
      }
      let y=s[this.index++]; y^=y>>>11; y^=(y<<7)&0x9d2c5680; y^=(y<<15)&0xefc60000; y^=y>>>18;
      return y|0;
    }
  }
  function envCreate(record) {
    const sustain=record.s*16384;
    const a=record.a?Math.floor(FULL/record.a):0;
    const d=record.d?Math.floor((FULL-sustain)/record.d):0;
    return {stage:a?0:d?1:2,level:a?0:d?FULL:sustain,sustain,
      a,d,h:record.r?Math.floor(sustain/record.r):0,r:0,offDuration:record.x};
  }
  function envStep(e) {
    switch(e.stage) {
      case 0: e.level+=e.a; if(e.level>FULL){e.level=FULL;e.stage=1;} break;
      case 1: e.level-=e.d; if(e.level<e.sustain||!e.d){e.level=e.sustain;e.stage=2;} break;
      case 2: e.level-=e.h; if(e.level<0){e.level=0;e.stage=4;} break;
      case 3: e.level-=e.r; if(e.level<=0){e.level=0;e.stage=4;} break;
      default:e.level=0;
    }
    return e.level>>14;
  }
  function oscillator(v, wave) {
    // Integer integration on a 32 cells * 1024 substeps phase grid.
    const position=(v.phaseFrame-v.cycleStart)/v.period;
    let start=trunc(position*32768), end=trunc((v.phaseFrame-v.cycleStart+1)/v.period*32768);
    const span=end-start;
    if(span<2)return wave[(start>>10)&31];
    let sum=0,cell=start>>10;
    while(start<end) {
      const step=Math.min(end-start,((cell+1)<<10)-start);
      sum=(sum+mul(wave[cell&31],step))|0;start+=step;cell++;
    }
    return trunc(sum/span);
  }
  function recipes(note) {
    if(note===35||note===36)return [['tone',540,38,1.8,-.004,0]];
    if(note===38||note===40)return [['noise',1600,140,.5,-.005,.8],['tone',1200,63,.9,0,-.6]];
    if([42,44,54].includes(note))return [['noise',700,150,.46,-.005,0]];
    if(note===46)return [['noise',2500,167,.46,-.01,0]];
    if(note===49)return [['noise',15000,170,.65,-.005,0]];
    if([41,43,45,47,48,50].includes(note))return [['tone',1200,note<=43?50:note<=47?58:66,.9,-.005,-.6]];
    if(note===51)return [['noise',1200,120,.6,-.005,0]];
    return [['noise',500,150,.3,-.005,0]];
  }
  function compile(midi, clock='b236') {
    if (!midi || !Array.isArray(midi.events) || midi.events.length>500000 || !Number.isFinite(midi.duration) || midi.duration < 0 || midi.duration>21600) throw Error('Invalid MIDI sequence');
    for(const e of midi.events) {
      if(!Number.isFinite(e.time)||e.time<0||e.time>21600)throw Error('Invalid event time');
      if(e.type==='sysex')continue;
      if(!Number.isInteger(e.channel)||e.channel<0||e.channel>31)throw Error('Invalid MIDI channel');
      if(['on','off'].includes(e.type)&&(!Number.isInteger(e.note)||e.note<0||e.note>127))throw Error('Invalid MIDI note');
      if(e.type==='on'&&(!Number.isInteger(e.velocity)||e.velocity<0||e.velocity>127))throw Error('Invalid velocity');
      if(['program','cc'].includes(e.type)&&(!Number.isInteger(e.value)||e.value<0||e.value>127))throw Error('Invalid MIDI value');
      if(e.type==='bend'&&(!Number.isInteger(e.value)||e.value< -8192||e.value>8191))throw Error('Invalid pitch bend');
    }
    if (clock!=='b236' && clock!=='standard') throw Error('Invalid PCM clock');
    if (clock==='standard' || !midi.ppq || !Array.isArray(midi.tempoEvents)) {
      return {duration:midi.duration,events:midi.events.map((e,i)=>({...e,frame:Math.max(0,Math.round(e.time*RATE)),order:i}))};
    }
    // 40c9f0 / 40d598: integer BPM; shortest batch whose truncated duration >=100 samples.
    // 40cdc0 / 40d02c: run every batch, no fractional-frame remainder carried forward.
    let batchTick=0,frame=0,q=1,interval=100;
    const tempo=us=>{
      const bpm=Math.floor(60000000/us)&65535;
      if(!bpm)throw Error('Tempo outside the B236E integer-BPM domain; choose standard clock');
      const denominator=bpm*midi.ppq;
      q=Math.max(1,Math.ceil(100*denominator/(RATE*60)));
      interval=Math.floor(q*RATE*60/denominator);
    };
    tempo(60000000/180);
    const timeline=[...midi.events.map((e,i)=>({...e,sourceIndex:i})),
      ...midi.tempoEvents.map(e=>({...e,type:'tempo'})),
      {tick:midi.maximumTick ?? midi.events.reduce((m,e)=>Math.max(m,e.tick),0),order:1e12,type:'sequenceEnd'}];
    timeline.sort((a,b)=>a.tick-b.tick||a.order-b.order);
    const out=[];let duration=0;
    for(let i=0;i<timeline.length;) {
      const tick=timeline[i].tick;
      if(!Number.isInteger(tick)||tick<0)throw Error('Invalid MIDI tick');
      if(tick>=batchTick+q){const batches=Math.floor((tick-batchTick)/q);batchTick+=batches*q;frame+=batches*interval;}
      let next=i;
      while(next<timeline.length&&timeline[next].tick===tick){
        const e=timeline[next++];
        if(e.type==='tempo')tempo(e.us);
        else if(e.type==='sequenceEnd')duration=frame/RATE;
        else out.push({...e,frame,order:e.sourceIndex});
      }
      if(tick-batchTick+1>=q){batchTick=tick+1;frame+=interval;}
      i=next;
    }
    return {duration,events:out};
  }
  const state = () => ({program:0,volume:100,expression:127,pan:64,bend:0,bendRange:2,bendCents:0,
    sustain:false,rpnMSB:127,rpnLSB:127});
  class Engine {
    constructor(data, options={}) {
      if(!data||data.wavetables.length!==33||data.envelopes.length!==128)throw Error('Invalid B236E data');
      this.data=data;this.options={instrumentSet:0,outputGain:1,seed:4357,stagger:true,clock:'b236',...options};
      if(!Number.isFinite(this.options.outputGain)||this.options.outputGain<0||this.options.outputGain>8)throw Error('Invalid PCM gain');
      if(!Number.isInteger(this.options.instrumentSet)||!data.instrumentSets[this.options.instrumentSet])throw Error('Invalid bank');
      this.tables=data.wavetables.map(w=>Int32Array.from(w.samples,x=>x*w.gain));
      this.square=Int32Array.from({length:32},(_,i)=>i<16?32000:-32000);
      this.reset();
    }
    reset() {
      this.frame=0;this.index=0;this.events=[];this.states=Array.from({length:32},state);
      this.slots=Array(45).fill(null);this.random=new RandomMT(this.options.seed);this.stagger=0;
      this.masterVolume=127;this.mode='GM';this.muted=Array(32).fill(false);
      this.stats={started:0,dropped:0,clippedFrames:0};this.warnings=new Set();this.left=0;this.right=0;
    }
    load(midi) {
      this.reset();const compiled=compile(midi,this.options.clock);this.duration=compiled.duration;
      this.events=compiled.events;
      this.events.sort((a,b)=>a.frame-b.frame||a.order-b.order);
      return this;
    }
    allocate() {
      // 413c0c..413cc5 searches 45 slots; when all are occupied it returns without a note.
      // Slot reclamation is simplified to completed/released envelopes; no invented oldest-note stealing.
      for(let i=44;i>=0;i--)if(!this.slots[i]||!this.slots[i].alive)return i;
      this.stats.dropped++;return -1;
    }
    makeVoice(channel,note,velocity,program,recipe=null) {
      const slot=this.allocate();if(slot<0)return null;
      const s=this.states[channel], wi=this.data.instrumentSets[this.options.instrumentSet].map[program];
      const isDrum=!!recipe;
      if(!isDrum&&[122,123,126,127].includes(program))this.warnings.add('GM122/123/126/127 remain noise/state-dependent compatibility gaps');
      const v={slot,channel,note,program,velocity,waveIndex:wi,kind:'wave',alive:true,owner:channel,keyDown:true,
        frame:0,phaseFrame:0,cycleStart:0,cycleEnd:0,period:1,pitch:note,cents:s.bendCents,pendingPitch:false,
        volume:trunc(s.volume*f32(1/127)*velocity)*65536,slope:0,expression:s.expression,pan:s.pan,
        pendingExpression:null,pendingPan:null,heldFlag:s.sustain,
        env:isDrum?null:envCreate(this.data.envelopes[program]),life:0,pitchStep:0,noise:0,
        delay:!isDrum&&this.options.stagger?this.stagger:0,stopping:false,startFrame:this.frame};
      if(!isDrum&&this.options.stagger)this.stagger=(this.stagger+20)>250?0:this.stagger+20;
      if(recipe) {
        v.kind=recipe[0];v.life=recipe[1];v.pitch=recipe[2];
        v.volume=trunc(s.volume*f32(1/127)*velocity*f32(recipe[3]))*65536;
        v.slope=trunc(f32(recipe[4])*65536);v.cents=0;v.pitchStep=f32(recipe[5]);
        v.keyDown=false;v.note=-1;v.drumNote=note;v.pan=64;
      } else {
        if(program===122||program===126){v.kind='noise';v.pitch=trunc(note*1.6)&255;}
        if(program===118){v.pitchStep=f32(-.6);v.life=1600;}
      }
      this.resetPitch(v);this.slots[slot]=v;this.stats.started++;return v;
    }
    resetPitch(v) {
      v.frequency=pitchHz(v.pitch,v.cents,v.kind==='wave'?OCTAVES[v.waveIndex]:0);
      v.period=f32(RATE/v.frequency);v.phaseFrame=0;v.cycleStart=0;v.cycleEnd=v.period;
      v.pendingPitch=false;
    }
    release(v,hard=false) {
      if(!v||!v.alive)return;
      if(hard){v.alive=false;return;}
      if(v.env&&v.owner!==null) {
        const e=v.env;e.stage=3;
        // The original Hold1 flag selects a slow 25000-frame key-off; it is not an infinite pedal latch.
        const length=v.heldFlag?25000:e.offDuration;
        if(!length)e.stage=4;else e.r=Math.floor(e.level/length);
      } else v.stopping=true;
      v.owner=null;v.keyDown=false;
    }
    event(e) {
      if(e.type==='sysex'){this.sysex(e);return;}
      const s=this.states[e.channel];if(!s)return;
      const own=this.slots.filter(v=>v&&v.alive&&v.owner===e.channel);
      if(e.type==='program')s.program=e.value;
      else if(e.type==='on') {
        if(e.channel%16===9) {
          // 41417a..4141f7: PC50 divides at note60, with no parity rule.
          const mapped=s.program===50?(e.note<60?35:38):e.note;
          for(const r of recipes(mapped))this.makeVoice(e.channel,e.note,e.velocity,0,r);
        } else this.makeVoice(e.channel,e.note,e.velocity,s.program);
      } else if(e.type==='off'&&e.channel%16!==9) {
        // 413a38..413af1 releases ALL matching owner/pitch voices, unlike generic FIFO MIDI.
        own.filter(v=>v.note===e.note).forEach(v=>this.release(v));
      } else if(e.type==='bend') {
        s.bend=e.value;s.bendCents=trunc(s.bendRange*100*e.value/8192);
        own.forEach(v=>{if(v.note>=0){v.cents=s.bendCents;v.pendingPitch=true;}});
      } else if(e.type==='cc') {
        const n=e.controller,x=e.value;
        if(n===7)s.volume=x; // 414d6a only sets channel state: existing voice level is unchanged.
        else if(n===11){s.expression=x;own.forEach(v=>v.pendingExpression=x);}
        else if(n===10){s.pan=x;own.forEach(v=>v.pendingPan=x);}
        else if(n===64){s.sustain=x!==0;own.forEach(v=>v.heldFlag=s.sustain);}
        else if(n===101)s.rpnMSB=x;
        else if(n===100)s.rpnLSB=x;
        else if(n===6&&s.rpnMSB===0&&s.rpnLSB===0&&x<=24)s.bendRange=x;
        else if(n===121){s.bend=0;s.bendCents=0;s.expression=127;own.forEach(v=>{v.pendingExpression=127;v.cents=0;v.pendingPitch=true;});}
        else if(n===120)own.forEach(v=>this.release(v,true)); // Safety extension, not verified native support.
        else if(n===123)own.filter(v=>v.note>=0).forEach(v=>this.release(v));
        else if(![0,32,38,98,99].includes(n))this.warnings.add('Unimplemented controller '+n);
      }
    }
    sysex(e) {
      const b=Array.from(e.data||e.bytes||[]);if(b[0]===240)b.shift();if(b[b.length-1]===247)b.pop();
      if(b.length===4&&b[0]===126&&b[2]===9&&b[3]===1){this.mode='GM';return;}
      if(b.length===9&&b[0]===65&&b[1]===16&&b[2]===66&&b[3]===18) {
        if(((b.slice(4).reduce((a,x)=>a+x,0))&127)!==0)this.warnings.add('Roland checksum mismatch accepted for B236E compatibility');
        if(b[4]===64&&b[5]===0&&b[6]===127&&b[7]===0){this.mode='GS';return;}
        if(b[4]===64&&b[5]===0&&b[6]===4){this.masterVolume=b[7];return;}
      }
      this.warnings.add('Unsupported SysEx');
    }
    voiceSample(v) {
      if(v.delay){v.delay--;return 0;}
      const level=v.env?envStep(v.env):65535;
      if(v.env&&v.env.stage===4)v.stopping=true;
      v.volume=(v.volume+v.slope)|0;
      if(v.volume<0){v.volume=0;if(v.slope)v.stopping=true;}
      if(v.pitchStep){v.cents=f32(v.cents+v.pitchStep);v.pendingPitch=true;}
      if(v.life&&--v.life<1)v.stopping=true;
      if(v.phaseFrame===0||v.phaseFrame>=v.cycleEnd) {
        if(v.stopping){v.alive=false;return 0;}
        if(v.pendingExpression!==null){v.expression=v.pendingExpression;v.pendingExpression=null;}
        if(v.pendingPan!==null){v.pan=v.pendingPan;v.pendingPan=null;}
        if(v.pendingPitch)this.resetPitch(v);
        else if(v.phaseFrame){v.cycleStart=v.cycleEnd;v.cycleEnd=f32(v.cycleEnd+v.period);}
        if(v.kind==='noise')v.noise=(this.random.next()%65535)-32768;
      }
      const raw=v.kind==='noise'?v.noise:v.frequency>22050?0:oscillator(v,v.kind==='tone'?this.square:this.tables[v.waveIndex]);
      let value=mul(v.volume>>16,raw)>>7;
      value=mul(value,v.expression)>>7;
      if(v.env)value=mul(value,level)>>16;
      v.phaseFrame++;v.frame++;
      return value;
    }
    step() {
      while(this.index<this.events.length&&this.events[this.index].frame<=this.frame)this.event(this.events[this.index++]);
      let left=0,right=0;
      for(let i=44;i>=0;i--) {
        const v=this.slots[i];if(!v||!v.alive)continue;
        const value=this.voiceSample(v);if(this.muted[v.channel])continue;
        left=(left+(mul(value,127-v.pan)>>7))|0;right=(right+(mul(value,v.pan)>>7))|0;
      }
      left=mul(trunc(left/3),this.masterVolume)>>7;right=mul(trunc(right/3),this.masterVolume)>>7;
      if(Math.abs(left)>32767||Math.abs(right)>32767)this.stats.clippedFrames++;
      this.left=clamp(left,-32767,32767)/32768*this.options.outputGain;
      this.right=clamp(right,-32767,32767)/32768*this.options.outputGain;
      this.frame++;
    }
    render(frames,left=new Float32Array(frames),right=new Float32Array(frames)) {
      for(let i=0;i<frames;i++){this.step();left[i]=this.left;right[i]=this.right;}
      return {left,right};
    }
    advance(frames) {for(let i=0;i<frames;i++)this.step();}
    snapshot() {
      return {version:VERSION,frame:this.frame,index:this.index,states:this.states.map(s=>({...s})),slots:this.slots.map(v=>v?({...v,env:v.env?{...v.env}:null}):null),
        randomState:Array.from(this.random.state),randomIndex:this.random.index,stagger:this.stagger,
        masterVolume:this.masterVolume,mode:this.mode,stats:{...this.stats},warnings:[...this.warnings]};
    }
    restore(s) {
      if(s.version!==VERSION||!Number.isInteger(s.frame)||s.frame<0||s.slots.length!==45||s.states.length!==32||s.randomState.length!==624)
        throw Error('Invalid PCM snapshot');
      this.frame=s.frame;this.index=s.index;this.states=s.states;this.slots=s.slots;
      this.random.state=Uint32Array.from(s.randomState);this.random.index=s.randomIndex;
      this.stagger=s.stagger;this.masterVolume=s.masterVolume;this.mode=s.mode;this.stats=s.stats;this.warnings=new Set(s.warnings);
    }
    active() {return this.slots.filter(v=>v&&v.alive).map(v=>({channel:v.channel,note:v.note,drumNote:v.drumNote,
      program:v.program,velocity:v.velocity,start:v.startFrame/RATE,wave:this.data.wavetables[v.waveIndex]}));}
    diagnostics() {return {version:VERSION,frame:this.frame,position:this.frame/RATE,stats:{...this.stats},warnings:[...this.warnings],activeVoices:this.active().length};}
  }
  function wav(left,right,rate=RATE) {
    if(left.length!==right.length)throw Error('Channel lengths differ');
    const buffer=new ArrayBuffer(44+left.length*4),v=new DataView(buffer);
    const text=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
    text(0,'RIFF');v.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);
    v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);
    text(36,'data');v.setUint32(40,left.length*4,true);
    for(let i=0;i<left.length;i++){v.setInt16(44+4*i,clamp(Math.round(left[i]*32768),-32767,32767),true);v.setInt16(46+4*i,clamp(Math.round(right[i]*32768),-32767,32767),true);}
    return buffer;
  }
  const api={VERSION,RATE,Engine,RandomMT,pitchHz,oscillator,envCreate,envStep,recipes,compile,wav};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.JSSCCPCM=api;
})(typeof globalThis==='undefined'?this:globalThis);
