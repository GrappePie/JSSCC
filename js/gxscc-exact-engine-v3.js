/* Clean-room GXSCC B236E compatibility engine v3.
 * Exact recovered wavetables/maps/ADSR + verified SCC voice behavior.
 * Drum timbres remain clean-room approximations where the original routine is not yet fully decoded.
 */
(function(){
'use strict';
const D=window.GXSCC_EXACT_DATA;
if(!D){console.error('GXSCC exact data missing');return;}
const REF=D.referenceSampleRate||44100, LOOK=.20, TICK=35, MAX_VOICES=46;
let ctx=null, master=null, midi=null, startCtx=0, offset=0, next=0, timer=null;
let lastState=null, lastPos=0, internalSeek=false, voiceId=0, currentSet=0, voiceCost=0;
const voices=new Map();
const ch=Array.from({length:16},()=>({program:0,pendingProgram:null,volume:100/127,expression:1,pan:0,bend:0,bendRange:2,sustain:false,rpnMSB:127,rpnLSB:127}));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ui=()=>window.ui||(typeof window.ui!=='undefined'?window.ui:null);
const freq=n=>440*Math.pow(2,(n-69)/12);
function audio(){if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('Web Audio is not supported.');ctx=new AC();master=ctx.createGain();master.gain.value=.30;master.connect(ctx.destination);}return ctx;}
async function unlock(){try{const c=audio();if(c.state==='suspended')await c.resume();}catch(e){console.error(e)}}
const u16=(v,p)=>v.getUint16(p,false),u32=(v,p)=>v.getUint32(p,false);
function rv(a,s){let v=0;for(let i=0;i<4;i++){if(s.p>=a.length)throw Error('Unexpected end of MIDI file');const b=a[s.p++];v=(v<<7)|(b&127);if(!(b&128))return v;}return v;}
function order(t){return t==='off'?0:(t==='cc'||t==='program'||t==='bend'?1:2)}
function parseMidi(buf,name){
 const a=new Uint8Array(buf),v=new DataView(buf);let p=0;
 const tag=()=>{if(p+4>a.length)throw Error('Unexpected end of MIDI file');const s=String.fromCharCode(a[p],a[p+1],a[p+2],a[p+3]);p+=4;return s};
 if(tag()!=='MThd')throw Error('This is not a Standard MIDI file');
 const headerLength=u32(v,p);p+=4;if(headerLength<6)throw Error('Invalid MIDI header');
 const format=u16(v,p);p+=2, numberOfTracks=u16(v,p);p+=2, division=u16(v,p);p+=2;p+=headerLength-6;
 if(format>2)throw Error('Unsupported MIDI format: '+format);if(division&0x8000)throw Error('SMPTE-time MIDI is not supported');
 const ppq=division,raw=[],tempos=[{tick:0,us:500000}];
 for(let ti=0;ti<numberOfTracks;ti++){
  if(tag()!=='MTrk')throw Error('Invalid MIDI track chunk '+ti);
  const len=u32(v,p);p+=4,end=Math.min(a.length,p+len),s={p};let tick=0,run=0;
  while(s.p<end){tick+=rv(a,s);if(s.p>=end)break;let st=a[s.p++];if(st<128){if(!run)throw Error('Invalid running status');s.p--;st=run}else if(st<240)run=st;
   if(st===255){const type=a[s.p++],n=rv(a,s),q=s.p;if(type===81&&n===3)tempos.push({tick,us:(a[q]<<16)|(a[q+1]<<8)|a[q+2]});s.p=Math.min(end,s.p+n);if(type===47)break;continue}
   if(st===240||st===247){s.p=Math.min(end,s.p+rv(a,s));continue}
   const kind=st&240,c=st&15,x=a[s.p++],y=(kind===192||kind===208)?0:a[s.p++];
   if(kind===144)raw.push({tick,type:y?'on':'off',channel:c,note:x,velocity:y});else if(kind===128)raw.push({tick,type:'off',channel:c,note:x,velocity:y});else if(kind===192)raw.push({tick,type:'program',channel:c,value:x});else if(kind===176)raw.push({tick,type:'cc',channel:c,controller:x,value:y});else if(kind===224)raw.push({tick,type:'bend',channel:c,value:((y<<7)|x)-8192});
  } p=end;
 }
 tempos.sort((a,b)=>a.tick-b.tick);const tc=[];for(const t of tempos){if(tc.length&&tc[tc.length-1].tick===t.tick)tc[tc.length-1]=t;else tc.push(t)}let sec=0;
 for(let i=0;i<tc.length;i++){if(i){const q=tc[i-1];sec+=(tc[i].tick-q.tick)*q.us/(ppq*1e6)}tc[i].sec=sec}
 function ts(t){let lo=0,hi=tc.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(tc[m].tick<=t)lo=m;else hi=m-1}const q=tc[lo];return q.sec+(t-q.tick)*q.us/(ppq*1e6)}
 raw.sort((a,b)=>a.tick-b.tick||order(a.type)-order(b.type));const events=raw.map(e=>Object.assign({},e,{time:ts(e.tick)}));
 return {format,trackCount:numberOfTracks,ppq,events,duration:events.length?events[events.length-1].time+.35:0,fileName:name||'MIDI'};
}
const cache=new Map();
function waveIndex(program){const set=D.instrumentSets[currentSet]||D.instrumentSets[0];return set.map[program&127]||0}
function waveInfo(program){return D.wavetables[waveIndex(program)]||D.wavetables[0]}
function periodic(program){const c=audio(),idx=waveIndex(program),key=currentSet+':'+idx;if(cache.has(key))return cache.get(key);const s=D.wavetables[idx].samples,N=s.length,real=new Float32Array(17),imag=new Float32Array(17);for(let k=1;k<17;k++){let re=0,im=0;for(let n=0;n<N;n++){const x=s[n]/128,ang=2*Math.PI*k*n/N;re+=x*Math.cos(ang);im-=x*Math.sin(ang)}real[k]=re/(N/2);imag[k]=im/(N/2)}const w=c.createPeriodicWave(real,imag,{disableNormalization:true});cache.set(key,w);return w}
function env(program){const e=D.envelopes[program&127];return {a:Math.min(8,e.a/REF),d:Math.min(12,e.d/REF),s:clamp(e.s/65535,0,1),r:Math.min(12,e.r/REF)}}
function waveGain(program){return clamp(waveInfo(program).gain/255,.02,1)}
function allocCost(cost){while(voiceCost+cost>MAX_VOICES&&voices.size){const k=voices.keys().next().value;stopVoice(k,audio().currentTime,true)}voiceCost+=cost}
function stopVoice(k,when,hard){const o=voices.get(k);if(!o)return;const t=Math.max(audio().currentTime,when||audio().currentTime),r=hard?.01:Math.max(.004,o.env.r);try{o.g.gain.cancelScheduledValues(t);o.g.gain.setValueAtTime(Math.max(.0001,o.g.gain.value),t);o.g.gain.exponentialRampToValueAtTime(.0001,t+r);o.src.stop(t+r+.01)}catch(_){}voiceCost=Math.max(0,voiceCost-(o.cost||1));voices.delete(k)}
function stopNote(c,n,when){for(const[k,o]of Array.from(voices)){if(o.c===c&&o.n===n){if(ch[c].sustain)o.held=true;else stopVoice(k,when,false)}}}
function allOff(){if(!ctx)return;for(const k of Array.from(voices.keys()))stopVoice(k,ctx.currentTime,true);voices.clear();voiceCost=0}
function updateDisplay(c,n,vel,program){const u=ui();if(!u||!u.song)return;const z=u.song.channels[c];if(!z)return;const st=ch[c],wi=waveInfo(program);z.volume=vel/127;z.expression=st.expression;z.output=clamp((vel/127)*st.volume*st.expression*waveGain(program),0,1);z.freq=Math.round(freq(n));z.panpot=st.pan;z.pitchbend=st.bend/8192;z.drum=c===9;z.percussion=c===9?1:0;z.poly=Array.from(voices.values()).filter(v=>v.c===c).reduce((a,v)=>a+(v.cost||1),0);z.wave=function(x){const a=wi.samples,i=Math.floor((x%1+1)%1*a.length);return a[i]/128}}
function noteAmplitude(e,program){return Math.max(.0001,(e.velocity/127)*ch[e.channel].volume*ch[e.channel].expression*waveGain(program)*.90)}
function melodic(e,when){const st=ch[e.channel];if(st.pendingProgram!==null){st.program=st.pendingProgram;st.pendingProgram=null}allocCost(1);const c=audio(),program=st.program,en=env(program),o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner?c.createStereoPanner():null,id='m'+(++voiceId);o.setPeriodicWave(periodic(program));const bend=st.bend*st.bendRange/8192;o.frequency.setValueAtTime(freq(e.note)*Math.pow(2,bend/12),when);const peak=noteAmplitude(e,program);g.gain.setValueAtTime(.0001,when);if(en.a>0)g.gain.linearRampToValueAtTime(peak,when+en.a);else g.gain.setValueAtTime(peak,when);g.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*Math.max(.001,en.s)),when+en.a+Math.max(.001,en.d));if(p){p.pan.setValueAtTime(st.pan,when);o.connect(g).connect(p).connect(master)}else o.connect(g).connect(master);o.start(when);voices.set(id,{src:o,g,c:e.channel,n:e.note,env:en,program,held:false,cost:1});o.onended=()=>{const q=voices.get(id);if(q){voiceCost=Math.max(0,voiceCost-(q.cost||1));voices.delete(id)}};updateDisplay(e.channel,e.note,e.velocity,program)}
function noiseBuffer(sec){const c=audio(),N=Math.max(1,Math.floor(c.sampleRate*sec)),b=c.createBuffer(1,N,c.sampleRate),d=b.getChannelData(0);let l=0x7fff;for(let i=0;i<N;i++){const bit=((l>>0)^(l>>1))&1;l=(l>>1)|(bit<<14);d[i]=(l&1)?.78:-.78}return b}
function drumNode(src,when,dur,peak,pan,cost,label){allocCost(cost);const a=audio(),g=a.createGain(),p=a.createStereoPanner?a.createStereoPanner():null,id='d'+(++voiceId);g.gain.setValueAtTime(Math.max(.0001,peak),when);g.gain.exponentialRampToValueAtTime(.0001,when+dur);if(p){p.pan.value=pan;src.connect(g).connect(p).connect(master)}else src.connect(g).connect(master);src.start(when);try{src.stop(when+dur+.02)}catch(_){}voices.set(id,{src,g,c:9,n:-1,env:{r:.01},program:0,cost,label});src.onended=()=>{if(voices.has(id)){voiceCost=Math.max(0,voiceCost-cost);voices.delete(id)}}}
function standardDrum(e,when){const c=audio(),n=e.note,v=e.velocity/127,pan=ch[9].pan,base=v*ch[9].volume*ch[9].expression;
 if(n===35||n===36){const o=c.createOscillator();o.type='square';o.frequency.setValueAtTime(n===35?92:110,when);o.frequency.exponentialRampToValueAtTime(43,when+.10);drumNode(o,when,.14,base*.55,pan,1,'kick')}
 else if(n===38||n===40){const noise=c.createBufferSource();noise.buffer=noiseBuffer(.10);drumNode(noise,when,.10,base*.38,pan,1,'snare-noise');const tone=c.createOscillator();tone.type='square';tone.frequency.setValueAtTime(n===38?185:205,when);tone.frequency.exponentialRampToValueAtTime(105,when+.075);drumNode(tone,when,.085,base*.22,pan,1,'snare-tone')}
 else if(n===42||n===44){const s=c.createBufferSource();s.buffer=noiseBuffer(.045);drumNode(s,when,.045,base*.20,pan,1,'closed-hat')}
 else if(n===46){const s=c.createBufferSource();s.buffer=noiseBuffer(.17);drumNode(s,when,.17,base*.18,pan,1,'open-hat')}
 else if(n===49||n===57){const s=c.createBufferSource();s.buffer=noiseBuffer(.28);drumNode(s,when,.28,base*.22,pan,1,'cymbal')}
 else if(n>=41&&n<=50){const o=c.createOscillator();o.type='square';const f=72+(n-41)*17;o.frequency.setValueAtTime(f*1.28,when);o.frequency.exponentialRampToValueAtTime(f,when+.075);drumNode(o,when,.13,base*.32,pan,1,'tom')}
 else {const s=c.createBufferSource();s.buffer=noiseBuffer(.065);drumNode(s,when,.065,base*.18,pan,1,'misc')}
 updateDisplay(9,n,e.velocity,0);
}
function kickSnareProgram(e,when){const n=e.note;if(n<60){standardDrum({channel:9,note:(n&1)?38:36,velocity:e.velocity},when)}else{standardDrum({channel:9,note:(n&1)?40:35,velocity:e.velocity},when)}}
function drum(e,when){if(ch[9].program===50)kickSnareProgram(e,when);else standardDrum(e,when)}
function bendActive(c,when){const st=ch[c],ratio=Math.pow(2,(st.bend*st.bendRange/8192)/12);for(const o of voices.values())if(o.c===c&&o.n>=0)try{o.src.frequency.setValueAtTime(freq(o.n)*ratio,when)}catch(_){}}
function resetControllers(st){st.bend=0;st.bendRange=2;st.sustain=false;st.expression=1;st.rpnMSB=127;st.rpnLSB=127}
function event(e,when){const st=ch[e.channel];
 if(e.type==='program'){if(e.channel===9)st.program=(e.value===50?50:0);else st.pendingProgram=e.value}
 else if(e.type==='bend'){st.bend=e.value;bendActive(e.channel,when)}
 else if(e.type==='cc'){
  if(e.controller===7)st.volume=e.value/127;else if(e.controller===11)st.expression=e.value/127;else if(e.controller===10)st.pan=clamp((e.value-64)/63,-1,1);else if(e.controller===64){const old=st.sustain;st.sustain=e.value>0;if(old&&!st.sustain)for(const[k,o]of Array.from(voices))if(o.c===e.channel&&o.held)stopVoice(k,when,false)}
  else if(e.controller===101)st.rpnMSB=e.value;else if(e.controller===100)st.rpnLSB=e.value;else if(e.controller===6&&st.rpnMSB===0&&st.rpnLSB===0){st.bendRange=clamp(e.value,0,24);bendActive(e.channel,when)}
  else if(e.controller===121){resetControllers(st);bendActive(e.channel,when)}else if(e.controller===120||e.controller===123)for(const[k,o]of Array.from(voices))if(o.c===e.channel)stopVoice(k,when,true)
 }
 else if(e.type==='on'){if(e.channel===9)drum(e,when);else melodic(e,when)}
 else if(e.type==='off'&&e.channel!==9)stopNote(e.channel,e.note,when);
}
function indexAt(t){let lo=0,hi=midi?midi.events.length:0;while(lo<hi){const m=(lo+hi)>>1;if(midi.events[m].time<t)lo=m+1;else hi=m}return lo}
function current(){if(!ctx||!midi)return offset;const u=ui();return u&&u.song&&u.song.playState===PlayState.PLAYING?Math.max(0,offset+ctx.currentTime-startCtx):offset}
function resetChannels(){for(const s of ch)Object.assign(s,{program:0,pendingProgram:null,volume:100/127,expression:1,pan:0,bend:0,bendRange:2,sustain:false,rpnMSB:127,rpnLSB:127})}
function rebuild(t){resetChannels();if(!midi)return;for(const e of midi.events){if(e.time>=t)break;if(e.type==='program'||e.type==='bend'||e.type==='cc')event(e,audio().currentTime)}}
function seek(t){if(!midi)return;offset=clamp(t,0,midi.duration);next=indexAt(offset);allOff();rebuild(offset);if(ctx)startCtx=ctx.currentTime}
function play(){if(!midi)return;unlock();if(offset>=midi.duration-.01)seek(0);startCtx=audio().currentTime;next=indexAt(offset);if(!timer)timer=setInterval(schedule,TICK);schedule()}
function pause(){offset=current();allOff()}
function stop(reset){allOff();if(reset)seek(0)}
function schedule(){const u=ui();if(!midi||!ctx||!u||!u.song||u.song.playState!==PlayState.PLAYING)return;const now=current(),h=now+LOOK;while(next<midi.events.length&&midi.events[next].time<=h){const e=midi.events[next++],when=ctx.currentTime+Math.max(0,e.time-now);event(e,when)}if(midi.duration){const pos=Math.min(1,now/midi.duration);internalSeek=true;u.song.position=pos;lastPos=pos;internalSeek=false}if(now>=midi.duration){if(u.song.repeat){seek(0);startCtx=ctx.currentTime}else{u.song.playState=PlayState.STOPPED;stop(true)}}}
function sync(){const u=ui();if(!u||!u.song||typeof PlayState==='undefined')return;const s=u.song.playState;if(lastState===null)lastState=s;if(s!==lastState){if(s===PlayState.PLAYING)play();else if(s===PlayState.PAUSED)pause();else if(s===PlayState.STOPPED)stop(true);else if(s===PlayState.FASTFORWARD&&midi){seek(current()+10);u.song.playState=PlayState.PLAYING;play()}lastState=u.song.playState}if(midi&&!internalSeek&&Math.abs((u.song.position||0)-lastPos)>.015){seek(clamp(u.song.position||0,0,1)*midi.duration);lastPos=u.song.position||0;if(u.song.playState===PlayState.PLAYING&&ctx)startCtx=ctx.currentTime}}
function refresh(){const u=ui();if(!u||!u.renderer||!u.renderer.initialized)return;try{for(let i=0;i<16;i++)u.renderer.drawChannel(i);u.renderer.drawDGroup('positionSlider')}catch(_){}}
let toastTimer=null;function toast(t,bad){let x=document.getElementById('midi-toast');if(!x){x=document.createElement('div');x.id='midi-toast';Object.assign(x.style,{position:'fixed',left:'50%',bottom:'18px',transform:'translateX(-50%)',zIndex:'9999',font:'14px monospace',padding:'9px 13px',border:'1px solid currentColor',background:'rgba(0,0,0,.86)',color:'#fff',pointerEvents:'none',maxWidth:'calc(100vw - 30px)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});document.body.appendChild(x)}x.textContent=t;x.style.color=bad?'#ff8b8b':'#fff';x.style.opacity='1';clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.style.opacity='0',bad?5000:3000)}
async function loadFile(f){if(!f)return;if(!/\.(mid|midi)$/i.test(f.name)){toast('Please choose a .mid/.midi file',true);return}try{const parsed=parseMidi(await f.arrayBuffer(),f.name);if(!parsed.events.some(e=>e.type==='on'))throw Error('No notes found');stop(true);midi=parsed;offset=0;next=0;resetChannels();const u=ui();if(u&&u.song){u.song.fileName=f.name;u.song.position=0;u.song.playState=PlayState.STOPPED}lastState=PlayState.STOPPED;lastPos=0;refresh();toast('Loaded '+f.name+' — '+parsed.trackCount+' tracks')}catch(e){console.error(e);toast('Could not load MIDI: '+e.message,true)}}
function setup(){const overlay=document.createElement('div');overlay.textContent='DROP MIDI FILE';Object.assign(overlay.style,{display:'none',position:'fixed',inset:'12px',zIndex:'9998',alignItems:'center',justifyContent:'center',border:'3px dashed currentColor',background:'rgba(0,0,0,.68)',color:'white',font:'bold 26px monospace',pointerEvents:'none'});document.body.appendChild(overlay);let depth=0;window.addEventListener('dragenter',e=>{if(e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes('Files')){e.preventDefault();depth++;overlay.style.display='flex'}});window.addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy'});window.addEventListener('dragleave',e=>{e.preventDefault();depth=Math.max(0,depth-1);if(!depth)overlay.style.display='none'});window.addEventListener('drop',e=>{e.preventDefault();depth=0;overlay.style.display='none';unlock();loadFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0])});
 const picker=document.createElement('input');picker.type='file';picker.accept='.mid,.midi,audio/midi,audio/x-midi';picker.hidden=true;picker.onchange=()=>{unlock();loadFile(picker.files&&picker.files[0]);picker.value=''};document.body.appendChild(picker);
 const box=document.createElement('div');Object.assign(box.style,{position:'fixed',right:'12px',bottom:'12px',zIndex:'9997',display:'flex',gap:'6px'});const sel=document.createElement('select');D.instrumentSets.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.name;sel.appendChild(o)});Object.assign(sel.style,{font:'bold 12px monospace',padding:'7px 8px',background:'rgba(0,0,0,.82)',color:'white'});sel.value=String(currentSet);sel.onchange=()=>{currentSet=+sel.value;cache.clear();allOff();if(midi)rebuild(current());toast('Instrument set: '+D.instrumentSets[currentSet].name)};const b=document.createElement('button');b.textContent='LOAD MIDI';Object.assign(b.style,{font:'bold 12px monospace',padding:'7px 10px',cursor:'pointer',background:'rgba(0,0,0,.82)',color:'white'});b.onclick=()=>picker.click();box.append(sel,b);document.body.appendChild(box);document.addEventListener('pointerdown',unlock,{passive:true});}
window.JSSCCMidi={loadFile,parseMidi,get current(){return midi},get exactData(){return D},get instrumentSet(){return currentSet},set instrumentSet(v){currentSet=clamp(+v||0,0,D.instrumentSets.length-1);cache.clear()}};
window.addEventListener('DOMContentLoaded',()=>{setup();setInterval(sync,40);setInterval(refresh,100);toast('GXSCC B236E compatibility v3 — exact tones + refined drum behavior')});
})();