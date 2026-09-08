/* Clean-room GXSCC B236E compatibility engine.
 * Uses exact recovered waveform / instrument-map / ADSR data from gxscc-exact-data.js.
 */
(function(){
'use strict';
const D=window.GXSCC_EXACT_DATA;if(!D){console.error('GXSCC exact data missing');return;}
const LOOK=.20,TICK=35,MAX=96,REF=D.referenceSampleRate||44100;
let ctx=null,master=null,midi=null,startCtx=0,offset=0,next=0,timer=null,lastState=null,lastPos=0,internalSeek=false,voiceId=0,currentSet=0;
const voices=new Map();
const ch=Array.from({length:16},()=>({program:0,volume:100/127,expression:1,pan:0,bend:0,sustain:false}));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ui=()=>window.ui||(typeof window.ui!=='undefined'?window.ui:null);
const freq=n=>440*Math.pow(2,(n-69)/12);
function audio(){if(!ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('Web Audio is not supported.');ctx=new AC();master=ctx.createGain();master.gain.value=.58;master.connect(ctx.destination);}return ctx;}
async function unlock(){try{const c=audio();if(c.state==='suspended')await c.resume();}catch(e){console.error(e)}}
const u16=(v,p)=>v.getUint16(p,false),u32=(v,p)=>v.getUint32(p,false);
function rv(a,s){let v=0;for(let i=0;i<4;i++){if(s.p>=a.length)throw Error('Unexpected end of MIDI file');const b=a[s.p++];v=(v<<7)|(b&127);if(!(b&128))return v;}return v;}
function order(t){return t==='off'?0:(t==='cc'||t==='program'||t==='bend'?1:2)}
function parseMidi(buf,name){
 const a=new Uint8Array(buf),v=new DataView(buf);let p=0;
 const tag=()=>{if(p+4>a.length)throw Error('Unexpected end of MIDI file');const s=String.fromCharCode(a[p],a[p+1],a[p+2],a[p+3]);p+=4;return s};
 if(tag()!=='MThd')throw Error('This is not a Standard MIDI file');
 const headerLength=u32(v,p);p+=4;if(headerLength<6)throw Error('Invalid MIDI header');
 const format=u16(v,p);p+=2;
 const numberOfTracks=u16(v,p);p+=2;
 const division=u16(v,p);p+=2;
 p+=headerLength-6;
 if(format>2)throw Error('Unsupported MIDI format: '+format);if(division&0x8000)throw Error('SMPTE-time MIDI is not supported');
 const ppq=division,raw=[],tempos=[{tick:0,us:500000}];
 for(let ti=0;ti<numberOfTracks;ti++){
   if(tag()!=='MTrk')throw Error('Invalid MIDI track chunk '+ti);
   const len=u32(v,p);p+=4;const end=Math.min(a.length,p+len),s={p};let tick=0,run=0;
   while(s.p<end){tick+=rv(a,s);if(s.p>=end)break;let st=a[s.p++];if(st<128){if(!run)throw Error('Invalid running status');s.p--;st=run}else if(st<240)run=st;
     if(st===255){const type=a[s.p++],n=rv(a,s),q=s.p;if(type===81&&n===3)tempos.push({tick,us:(a[q]<<16)|(a[q+1]<<8)|a[q+2]});s.p=Math.min(end,s.p+n);if(type===47)break;continue}
     if(st===240||st===247){s.p=Math.min(end,s.p+rv(a,s));continue}
     const kind=st&240,c=st&15,x=a[s.p++],y=(kind===192||kind===208)?0:a[s.p++];
     if(kind===144)raw.push({tick,type:y?'on':'off',channel:c,note:x,velocity:y});else if(kind===128)raw.push({tick,type:'off',channel:c,note:x,velocity:y});else if(kind===192)raw.push({tick,type:'program',channel:c,value:x});else if(kind===176)raw.push({tick,type:'cc',channel:c,controller:x,value:y});else if(kind===224)raw.push({tick,type:'bend',channel:c,value:((y<<7)|x)-8192});
   }p=end;
 }
 tempos.sort((a,b)=>a.tick-b.tick);const tc=[];for(const t of tempos){if(tc.length&&tc[tc.length-1].tick===t.tick)tc[tc.length-1]=t;else tc.push(t)}let sec=0;for(let i=0;i<tc.length;i++){if(i){const q=tc[i-1];sec+=(tc[i].tick-q.tick)*q.us/(ppq*1e6)}tc[i].sec=sec}
 function ts(t){let lo=0,hi=tc.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(tc[m].tick<=t)lo=m;else hi=m-1}const q=tc[lo];return q.sec+(t-q.tick)*q.us/(ppq*1e6)}
 raw.sort((a,b)=>a.tick-b.tick||order(a.type)-order(b.type));const events=raw.map(e=>Object.assign({},e,{time:ts(e.tick)}));const duration=events.length?events[events.length-1].time+.35:0;
 return {format,trackCount:numberOfTracks,ppq,events,duration,fileName:name||'MIDI'};
}
const cache=new Map();
function waveIndex(program){const set=D.instrumentSets[currentSet]||D.instrumentSets[0];return set.map[program&127]||0}
function waveInfo(program){return D.wavetables[waveIndex(program)]||D.wavetables[0]}
function periodic(program){const c=audio(),idx=waveIndex(program),key=currentSet+':'+idx;if(cache.has(key))return cache.get(key);const s=D.wavetables[idx].samples,N=s.length,real=new Float32Array(17),imag=new Float32Array(17);for(let k=1;k<17;k++){let re=0,im=0;for(let n=0;n<N;n++){const x=s[n]/128,ang=2*Math.PI*k*n/N;re+=x*Math.cos(ang);im-=x*Math.sin(ang)}real[k]=re/(N/2);imag[k]=im/(N/2)}const w=c.createPeriodicWave(real,imag,{disableNormalization:true});cache.set(key,w);return w}
function env(program){const e=D.envelopes[program&127];return {a:e.a/REF,d:e.d/REF,s:clamp(e.s/65535,0,1),r:e.r/REF,x:e.x}}
function waveGain(program){return clamp(waveInfo(program).gain/255,.02,1)}
function key(c,n,id){return c+':'+n+':'+id}
function stopVoice(k,when,hard){const o=voices.get(k);if(!o)return;const t=Math.max(audio().currentTime,when||audio().currentTime),r=hard?.01:Math.max(.004,o.env.r);try{o.g.gain.cancelScheduledValues(t);o.g.gain.setValueAtTime(Math.max(.0001,o.g.gain.value),t);o.g.gain.exponentialRampToValueAtTime(.0001,t+r);o.osc.stop(t+r+.01)}catch(_){}voices.delete(k)}
function stopNote(c,n,when){for(const [k,o] of Array.from(voices)){if(o.c===c&&o.n===n){if(ch[c].sustain)o.held=true;else stopVoice(k,when,false)}}}
function allOff(){if(!ctx)return;for(const k of Array.from(voices.keys()))stopVoice(k,ctx.currentTime,true);voices.clear()}
function updateDisplay(c,n,vel,program){const u=ui();if(!u||!u.song)return;const z=u.song.channels[c];if(!z)return;const st=ch[c],wi=waveInfo(program);z.volume=vel/127;z.expression=st.expression;z.output=clamp((vel/127)*st.volume*st.expression*waveGain(program),0,1);z.freq=Math.round(freq(n));z.panpot=st.pan;z.pitchbend=st.bend/8192;z.drum=c===9;z.percussion=c===9?1:0;z.poly=Array.from(voices.values()).filter(v=>v.c===c).length;z.wave=function(x){const a=wi.samples,i=Math.floor((x%1+1)%1*a.length);return a[i]/128}}
function envelopeSafe(program){const e=env(program);return {a:Math.min(8,e.a),d:Math.min(12,e.d),s:e.s,r:Math.min(12,e.r),x:e.x}}
function melodic(e,when){const c=audio(),st=ch[e.channel],program=st.program,en=envelopeSafe(program),o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner?c.createStereoPanner():null,id=++voiceId,k=key(e.channel,e.note,id);o.setPeriodicWave(periodic(program));const bend=st.bend*2/8192;o.frequency.setValueAtTime(freq(e.note)*Math.pow(2,bend/12),when);const peak=Math.max(.0001,(e.velocity/127)*st.volume*st.expression*waveGain(program)*.16);g.gain.setValueAtTime(.0001,when);if(en.a>0)g.gain.linearRampToValueAtTime(peak,when+en.a);else g.gain.setValueAtTime(peak,when);const dt=when+en.a+Math.max(.001,en.d);g.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*Math.max(.001,en.s)),dt);if(p){p.pan.setValueAtTime(st.pan,when);o.connect(g).connect(p).connect(master)}else o.connect(g).connect(master);o.start(when);voices.set(k,{osc:o,g,c:e.channel,n:e.note,env:en,program,held:false});o.onended=()=>voices.delete(k);updateDisplay(e.channel,e.note,e.velocity,program)}
function noiseBuffer(sec){const c=audio(),N=Math.max(1,Math.floor(c.sampleRate*sec)),b=c.createBuffer(1,N,c.sampleRate),d=b.getChannelData(0);let l=0x7fff;for(let i=0;i<N;i++){const bit=((l>>0)^(l>>1))&1;l=(l>>1)|(bit<<14);d[i]=(l&1)?.72:-.72}return b}
function drum(e,when){const c=audio(),g=c.createGain(),p=c.createStereoPanner?c.createStereoPanner():null,n=e.note,v=e.velocity/127;let src,dur=.08,peak=.08*v;if(n===35||n===36){src=c.createOscillator();src.type='triangle';src.frequency.setValueAtTime(n===35?108:126,when);src.frequency.exponentialRampToValueAtTime(42,when+.095);dur=.14;peak=.18*v}else if(n===38||n===40){src=c.createBufferSource();src.buffer=noiseBuffer(.12);dur=.12;peak=.12*v}else if(n>=42&&n<=46){dur=n===46?.18:.05;src=c.createBufferSource();src.buffer=noiseBuffer(dur);peak=.07*v}else if(n>=41&&n<=50){src=c.createOscillator();src.type='triangle';const f=88+(n-41)*18;src.frequency.setValueAtTime(f*1.35,when);src.frequency.exponentialRampToValueAtTime(f,when+.08);dur=.13;peak=.11*v}else{src=c.createBufferSource();src.buffer=noiseBuffer(.07)}g.gain.setValueAtTime(Math.max(.0001,peak),when);g.gain.exponentialRampToValueAtTime(.0001,when+dur);if(p){p.pan.value=ch[9].pan;src.connect(g).connect(p).connect(master)}else src.connect(g).connect(master);src.start(when);try{src.stop(when+dur+.02)}catch(_){}updateDisplay(9,n,e.velocity,0)}
function bendActive(c,when){const st=ch[c],ratio=Math.pow(2,(st.bend*2/8192)/12);for(const o of voices.values())if(o.c===c)try{o.osc.frequency.setValueAtTime(freq(o.n)*ratio,when)}catch(_){}}
function event(e,when){const st=ch[e.channel];if(e.type==='program')st.program=e.value;else if(e.type==='bend'){st.bend=e.value;bendActive(e.channel,when)}else if(e.type==='cc'){if(e.controller===7)st.volume=e.value/127;else if(e.controller===11)st.expression=e.value/127;else if(e.controller===10)st.pan=clamp((e.value-64)/63,-1,1);else if(e.controller===64){const old=st.sustain;st.sustain=e.value>=64;if(old&&!st.sustain)for(const [k,o] of Array.from(voices))if(o.c===e.channel&&o.held)stopVoice(k,when,false)}else if(e.controller===120||e.controller===123)for(const [k,o] of Array.from(voices))if(o.c===e.channel)stopVoice(k,when,true)}else if(e.type==='on'){if(e.channel===9)drum(e,when);else melodic(e,when)}else if(e.type==='off'&&e.channel!==9)stopNote(e.channel,e.note,when)}
function indexAt(t){let lo=0,hi=midi?midi.events.length:0;while(lo<hi){const m=(lo+hi)>>1;if(midi.events[m].time<t)lo=m+1;else hi=m}return lo}
function current(){if(!ctx||!midi)return offset;const u=ui();return u&&u.song&&u.song.playState===PlayState.PLAYING?Math.max(0,offset+ctx.currentTime-startCtx):offset}
function rebuild(t){for(const s of ch)Object.assign(s,{program:0,volume:100/127,expression:1,pan:0,bend:0,sustain:false});if(!midi)return;for(const e of midi.events){if(e.time>=t)break;if(e.type==='program'||e.type==='bend'||e.type==='cc')event(e,audio().currentTime)}}
function seek(t){if(!midi)return;offset=clamp(t,0,midi.duration);next=indexAt(offset);allOff();rebuild(offset);if(ctx)startCtx=ctx.currentTime}
function play(){if(!midi)return;unlock();if(offset>=midi.duration-.01)seek(0);startCtx=audio().currentTime;next=indexAt(offset);if(!timer)timer=setInterval(schedule,TICK);schedule()}
function pause(){offset=current();allOff()}
function stop(reset){allOff();if(reset)seek(0)}
function schedule(){const u=ui();if(!midi||!ctx||!u||!u.song||u.song.playState!==PlayState.PLAYING)return;const now=current(),h=now+LOOK;while(next<midi.events.length&&midi.events[next].time<=h){const e=midi.events[next++],when=ctx.currentTime+Math.max(0,e.time-now);event(e,when)}if(midi.duration){const pos=Math.min(1,now/midi.duration);internalSeek=true;u.song.position=pos;lastPos=pos;internalSeek=false}if(now>=midi.duration){if(u.song.repeat){seek(0);startCtx=ctx.currentTime}else{u.song.playState=PlayState.STOPPED;stop(true)}}}
function sync(){const u=ui();if(!u||!u.song||typeof PlayState==='undefined')return;const s=u.song.playState;if(lastState===null)lastState=s;if(s!==lastState){if(s===PlayState.PLAYING)play();else if(s===PlayState.PAUSED)pause();else if(s===PlayState.STOPPED)stop(true);else if(s===PlayState.FASTFORWARD&&midi){seek(current()+10);u.song.playState=PlayState.PLAYING;play()}lastState=u.song.playState}if(midi&&!internalSeek&&Math.abs((u.song.position||0)-lastPos)>.015){seek(clamp(u.song.position||0,0,1)*midi.duration);lastPos=u.song.position||0;if(u.song.playState===PlayState.PLAYING&&ctx)startCtx=ctx.currentTime}}
function refresh(){const u=ui();if(!u||!u.renderer||!u.renderer.initialized)return;try{for(let i=0;i<16;i++)u.renderer.drawChannel(i);u.renderer.drawDGroup('positionSlider')}catch(_){}}
let toastTimer=null;function toast(t,bad){let x=document.getElementById('midi-toast');if(!x){x=document.createElement('div');x.id='midi-toast';Object.assign(x.style,{position:'fixed',left:'50%',bottom:'18px',transform:'translateX(-50%)',zIndex:'9999',font:'14px monospace',padding:'9px 13px',border:'1px solid currentColor',background:'rgba(0,0,0,.86)',color:'#fff',pointerEvents:'none',maxWidth:'calc(100vw - 30px)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});document.body.appendChild(x)}x.textContent=t;x.style.color=bad?'#ff8b8b':'#fff';x.style.opacity='1';clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.style.opacity='0',bad?5000:3000)}
async function loadFile(f){if(!f)return;if(!/\.(mid|midi)$/i.test(f.name)){toast('Please choose a .mid/.midi file',true);return}try{const parsed=parseMidi(await f.arrayBuffer(),f.name);if(!parsed.events.some(e=>e.type==='on'))throw Error('No notes found');stop(true);midi=parsed;offset=0;next=0;const u=ui();if(u&&u.song){u.song.fileName=f.name;u.song.position=0;u.song.playState=PlayState.STOPPED}lastState=PlayState.STOPPED;lastPos=0;refresh();toast('Loaded '+f.name+' — '+parsed.trackCount+' tracks')}catch(e){console.error(e);toast('Could not load MIDI: '+e.message,true)}}
function setup(){const overlay=document.createElement('div');overlay.textContent='DROP MIDI FILE';Object.assign(overlay.style,{display:'none',position:'fixed',inset:'12px',zIndex:'9998',alignItems:'center',justifyContent:'center',border:'3px dashed currentColor',background:'rgba(0,0,0,.68)',color:'white',font:'bold 26px monospace',pointerEvents:'none'});document.body.appendChild(overlay);let depth=0;window.addEventListener('dragenter',e=>{if(e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes('Files')){e.preventDefault();depth++;overlay.style.display='flex'}});window.addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy'});window.addEventListener('dragleave',e=>{e.preventDefault();depth=Math.max(0,depth-1);if(!depth)overlay.style.display='none'});window.addEventListener('drop',e=>{e.preventDefault();depth=0;overlay.style.display='none';unlock();loadFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0])});
 const picker=document.createElement('input');picker.type='file';picker.accept='.mid,.midi,audio/midi,audio/x-midi';picker.hidden=true;picker.onchange=()=>{unlock();loadFile(picker.files&&picker.files[0]);picker.value=''};document.body.appendChild(picker);
 const box=document.createElement('div');Object.assign(box.style,{position:'fixed',right:'12px',bottom:'12px',zIndex:'9997',display:'flex',gap:'6px'});const sel=document.createElement('select');D.instrumentSets.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.name;sel.appendChild(o)});Object.assign(sel.style,{font:'bold 12px monospace',padding:'7px 8px',background:'rgba(0,0,0,.82)',color:'white'});sel.value=String(currentSet);sel.onchange=()=>{currentSet=+sel.value;cache.clear();allOff();if(midi)rebuild(current());toast('Instrument set: '+D.instrumentSets[currentSet].name)};const b=document.createElement('button');b.textContent='LOAD MIDI';Object.assign(b.style,{font:'bold 12px monospace',padding:'7px 10px',cursor:'pointer',background:'rgba(0,0,0,.82)',color:'white'});b.onclick=()=>picker.click();box.append(sel,b);document.body.appendChild(box);document.addEventListener('pointerdown',unlock,{passive:true});
}
window.JSSCCMidi={loadFile,parseMidi,get current(){return midi},get exactData(){return D},get instrumentSet(){return currentSet},set instrumentSet(v){currentSet=clamp(+v||0,0,D.instrumentSets.length-1);cache.clear()}};
window.addEventListener('DOMContentLoaded',()=>{setup();setInterval(sync,40);setInterval(refresh,100);toast('Exact GXSCC B236E tables loaded — SCC like Full-Set')});
})();
