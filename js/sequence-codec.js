/* Independent Online Sequencer protobuf -> Standard MIDI File adapter.
 * Protocol facts: onlinesequencer/SequencePlayer SequenceProto.java and NoteTypeProto.java.
 * Instrument/export conventions: OnlineSequencer's public export UI, checked 2026-09-08.
 * No third-party player code, samples, or generated protobuf runtime is bundled.
 */
(function (root) {
  'use strict';
  const VERSION = 'os-midi-20260908.1', MAX_BYTES = 4 * 1024 * 1024;
  const MAX_NOTES = 100000, MAX_MARKERS = 12000, MAX_EVENTS = 300000, PPQ = 960;
  const programs = [5,26,1,91,28,34,85,104,1,61,58,41,43,81,81,82,81,7,47,14,46,115,105,74,67,4,11,39,20,37,89,119,27,108,12,29,1,39,31,1,1,1,1,6,31,43,41,49,33,28,61,58,91,1,34,91,40,91,25,53,1,62,3,20,0];
  const drumIds = new Set([2,31,36,39,40,42,53,60,64]);
  // The following arrays encode only the non-identity MIDI drum-note correspondences.
  const drumMaps = {
    36: [24,25,26,35,36,35,39,39,38,38,37,42,46,51,41,43,48,50,56,80,32],
    39: [24,25,26,27,28,29,30,35,40,42,38,38,52],
    40: [24,25,26,27,28,29,30,35,36,40,38,40,40,41,42,42,46,41,52,43,45,49,47,59,57,53,54,55,56,57,59,53,38,57,38],
    42: [24,25,26,35,36,35,38,38,38,41,43,45,47,48,50,37,39,42,42,46,46,49,59]
  };
  const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
  const fail = message => { throw new Error('Secuencia: ' + message); };
  const finite = (n,name,min,max) => {
    if (!Number.isFinite(n) || n < min || n > max) fail(name + ' fuera de rango');
    return n;
  };
  class Reader {
    constructor(bytes) { this.bytes=bytes; this.view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.pos=0; }
    need(n) { if (!Number.isInteger(n) || n<0 || this.pos+n>this.bytes.length) fail('datos truncados'); }
    varint() {
      let n=0n;
      for(let i=0;i<10;i++) {
        this.need(1);const b=this.bytes[this.pos++];
        if(i===9 && b>1)fail('varint excesivo');
        n |= BigInt(b&127)<<BigInt(7*i);
        if(!(b&128))return n;
      }
      fail('varint sin terminar');
    }
    integer() { return Number(BigInt.asIntN(32,this.varint())); }
    float() { this.need(4);const n=this.view.getFloat32(this.pos,true);this.pos+=4;return n; }
    chunk() { const n=Number(this.varint());this.need(n);const b=this.bytes.subarray(this.pos,this.pos+n);this.pos+=n;return b; }
    skip(wire) {
      if(wire===0)this.varint();
      else if(wire===2)this.chunk();
      else if(wire===1||wire===5){const n=wire===1?8:4;this.need(n);this.pos+=n;}
      else fail('tipo protobuf no compatible');
    }
    fields(fn) {
      let count=0;
      while(this.pos<this.bytes.length) {
        if(++count>650000)fail('demasiados campos');
        const tag=Number(this.varint());
        if(!Number.isSafeInteger(tag)||tag<8||tag>0xffffffff)fail('etiqueta protobuf inválida');
        const field=Math.floor(tag/8),wire=tag&7;
        if(!fn(field,wire,this))this.skip(wire);
      }
    }
  }
  function scalars(bytes, schema, defaults) {
    const out={...defaults};
    new Reader(bytes).fields((f,w,r)=>{
      const spec=schema[f];if(!spec)return false;
      if(w!==spec[1])fail('tipo incorrecto en '+spec[0]);
      out[spec[0]]=w===5?r.float():w===0?r.integer():new TextDecoder().decode(r.chunk()).slice(0,180);
      return true;
    });return out;
  }
  function decode(input) {
    const bytes=input instanceof Uint8Array?input:input instanceof ArrayBuffer?new Uint8Array(input):null;
    if(!bytes||!bytes.length||bytes.length>MAX_BYTES)fail('tamaño inválido (máximo 4 MiB)');
    const result={notes:[],markers:[],instruments:new Map(),bpm:110,timeSignature:4,volume:1,effects:false,unknownFields:0};
    let hasSettings=false;
    new Reader(bytes).fields((f,w,r)=>{
      if(![1,2,3].includes(f)){result.unknownFields++;return false;}
      if(w!==2)fail('estructura inválida');
      const chunk=r.chunk();
      if(f===1) {
        hasSettings=true;
        new Reader(chunk).fields((sf,sw,sr)=>{
          if(sf===1||sf===2){if(sw!==0)fail('ajustes inválidos');const n=sr.integer();if(sf===1)result.bpm=n;else result.timeSignature=n||4;return true;}
          if(sf===4){if(sw!==5)fail('volumen inválido');result.volume=1-sr.float();return true;}
          if(sf!==3){result.unknownFields++;return false;}
          if(sw!==2)fail('instrumentos inválidos');
          let id=0,settings=null;
          new Reader(sr.chunk()).fields((ef,ew,er)=>{
            if(ef===1){if(ew!==0)fail('ID inválido');id=er.integer();return true;}
            if(ef===2){if(ew!==2)fail('ajustes inválidos');const raw=er.chunk();
              settings=scalars(raw,{1:['volume',5],4:['pan',5],9:['detune',5],15:['name',2]}, {volume:0,pan:0,detune:0,name:''});
              new Reader(raw).fields((ifld,iw,ir)=>{
                if([2,3,5,12,14,18,21].includes(ifld))result.effects=true;
                return false;
              });return true;}
            return false;
          });
          finite(id,'instrumento',0,0x7fffffff);
          if(result.instruments.size>=1024&&!result.instruments.has(id))fail('demasiados instrumentos');
          if(settings)result.instruments.set(id,settings);return true;
        });
      } else if(f===2) {
        if(result.notes.length>=MAX_NOTES)fail('máximo 100000 notas');
        result.notes.push(scalars(chunk,{1:['pitch',0],2:['time',5],3:['length',5],4:['instrument',0],5:['volume',5]},
          {pitch:0,time:0,length:0,instrument:0,volume:0}));
      } else {
        if(result.markers.length>=MAX_MARKERS)fail('demasiadas automatizaciones');
        result.markers.push(scalars(chunk,{1:['time',5],2:['setting',0],3:['instrument',0],4:['value',5],5:['blend',0]},
          {time:0,setting:0,instrument:0,value:0,blend:0}));
      }
      return true;
    });
    if(!hasSettings||!result.notes.length)fail('no contiene ajustes y notas compatibles');
    finite(result.bpm,'tempo',10,999);finite(result.volume,'volumen global',0,2);
    finite(result.timeSignature,'compás',1,32);
    for(const n of result.notes) {
      finite(n.pitch,'nota',0,127);finite(n.time,'inicio',0,100000);finite(n.length,'duración',0,100000);
      finite(n.instrument,'instrumento',0,0x7fffffff);finite(n.volume,'intensidad',0,4);
    }
    for(const [id,s] of result.instruments) {
      finite(s.volume,'volumen del instrumento '+id,0,4);finite(s.pan,'panorama',-1,1);finite(s.detune,'afinación',-12000,12000);
    }
    for(const m of result.markers){finite(m.time,'tiempo de automatización',0,100000);finite(m.value,'automatización',-12000,12000);}
    return result;
  }
  function curve(initial, markers, min, max) {
    const points=[{time:0,value:finite(initial,'valor inicial',min,max),blend:0}];
    const sorted=markers.map((m,i)=>({...m,order:i})).sort((a,b)=>a.time-b.time||a.order-b.order);
    for(const p of sorted) {
      finite(p.value,'valor de automatización',min,max);
      const v={time:p.time,value:p.value,blend:!!p.blend};
      if(points[points.length-1].time===p.time)points[points.length-1]=v;else points.push(v);
    }
    const at=t=>{
      let lo=0,hi=points.length-1;
      while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(points[mid].time<=t)lo=mid;else hi=mid-1;}
      const a=points[lo],b=points[lo+1];
      return b&&b.blend?a.value+(b.value-a.value)*(t-a.time)/(b.time-a.time):a.value;
    };
    return {points,at,max:points.reduce((v,p)=>Math.max(v,p.value),0)};
  }
  function samplingTimes(curves,end) {
    const times=new Set([0]);
    for(const c of curves)for(let i=0;i<c.points.length;i++) {
      const p=c.points[i];if(p.time<=end)times.add(p.time);
      const prev=c.points[i-1];
      if(prev&&p.blend&&p.value!==prev.value) {
        for(let t=prev.time+.25;t<Math.min(p.time,end);t+=.25){if(times.size>32000)fail('automatización demasiado densa');times.add(t);}
      }
    }
    return [...times].sort((a,b)=>a-b);
  }
  function encodeMidi(seq, metadata={}) {
    const warnings=new Set(),audible=seq.notes.filter(n=>n.volume>0&&n.length>0);
    if(!audible.length)fail('no contiene notas audibles');
    const end=audible.reduce((v,n)=>Math.max(v,n.time+n.length),0);
    if(end>40000)fail('la secuencia es demasiado larga');
    const by=(setting,id)=>seq.markers.filter(m=>m.setting===setting&&(id===undefined||m.instrument===id));
    const tempo=curve(seq.bpm,by(0),10,999),globalVolume=curve(seq.volume,by(8),0,4);
    const tempoTimes=samplingTimes([tempo],end),tempoPoints=tempoTimes.map(t=>({time:t,bpm:Math.round(tempo.at(t))}));
    let duration=0;
    for(let i=0;i<tempoPoints.length;i++)duration+=((tempoPoints[i+1]?.time??end)-tempoPoints[i].time)*15/tempoPoints[i].bpm;
    if(duration>600)fail('máximo 10 minutos para importación remota');
    const tracks=[],ids=[...new Set(audible.map(n=>n.instrument))],melodic=Array.from({length:32},(_,i)=>i).filter(i=>i%16!==9);
    let next=0,drums=0,eventCount=0,clipped=0,noteCount=0;
    const text=s=>Array.from(new TextEncoder().encode(String(s).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,240)));
    function vlq(n){if(!Number.isSafeInteger(n)||n<0||n>0x0fffffff)fail('tiempo MIDI fuera de rango');const v=[n&127];while(n=Math.floor(n/128))v.unshift((n&127)|128);return v;}
    const meta=(type,value)=>[255,type,...vlq(value.length),...value];
    const ticks=t=>Math.round(t*PPQ/4);
    function track(){const events=[];tracks.push(events);return (time,bytes,priority=1)=>{
      if(++eventCount>MAX_EVENTS)fail('demasiados eventos MIDI');events.push({tick:ticks(time),bytes,priority,order:eventCount});
    };}
    const conductor=track();
    conductor(0,meta(3,text(metadata.title||'Online Sequencer '+(metadata.id||''))),0);
    if(metadata.id)conductor(0,meta(1,text('Source: https://onlinesequencer.net/'+metadata.id)),0);
    conductor(0,meta(88,[seq.timeSignature,2,24,8]),0);
    let previousBpm=-1;
    for(const p of tempoPoints)if(p.bpm!==previousBpm){const us=Math.round(60000000/p.bpm);conductor(p.time,meta(81,[(us>>>16)&255,(us>>>8)&255,us&255]),0);previousBpm=p.bpm;}
    for(const id of ids) {
      const base=id%10000,drum=drumIds.has(base);
      if(drum&&drums===2)fail('más de dos kits de percusión independientes');
      if(!drum&&next===melodic.length)fail('más de 30 instrumentos melódicos independientes');
      const channel=drum?9+16*drums++:melodic[next++],c=channel%16,port=Math.floor(channel/16);
      const s=seq.instruments.get(id)||{volume:1,pan:0,detune:0,name:''};
      const vol=curve(s.volume,by(1,id),0,4),pan=curve(s.pan,by(2,id),-1,1),tuning=curve(s.detune,by(11,id),-12000,12000);
      const peakScale=Math.max(1,globalVolume.max*vol.max),add=track();
      add(0,meta(33,[port]),0);add(0,meta(3,text(s.name||'OS instrument '+id)),0);
      let program=drum?0:(programs[base]||1)-1;
      if(base>=programs.length){program=80;warnings.add('Instrumentos desconocidos se interpretaron como lead cuadrado.');}
      add(0,[192|c,program],0);add(0,[176|c,7,127],0);
      let prevExp=-1,prevPan=-1;
      for(const t of samplingTimes([vol,globalVolume,pan],end)) {
        const expr=clamp(Math.round(127*vol.at(t)*globalVolume.at(t)/peakScale),0,127),p=clamp(Math.round((pan.at(t)+1)*63.5),0,127);
        if(expr!==prevExp){add(t,[176|c,11,expr],0);prevExp=expr;}
        if(p!==prevPan){add(t,[176|c,10,p],0);prevPan=p;}
      }
      for(const n of audible)if(n.instrument===id) {
        let pitch=n.pitch;
        if(drum) {
          const mapping=drumMaps[base];
          if(mapping) { if(pitch>=24&&pitch<24+mapping.length)pitch=mapping[pitch-24]; }
          else pitch+=12; // OS default drum export uses MIDI C0=12; custom kits have their own map.
        }
        if(!drum)pitch+=Math.round(tuning.at(n.time)/100);
        if(pitch<0||pitch>127){warnings.add('Se omitieron notas fuera del rango MIDI.');continue;}
        const rawVelocity=Math.round(n.volume*50*peakScale);if(rawVelocity<=0)continue;if(rawVelocity>127)clipped++;
        const velocity=clamp(rawVelocity,1,127);
        add(n.time,[144|c,pitch,velocity],2);
        // Off-before-on at a shared timestamp; preserve sub-tick short notes.
        add(Math.max(n.time+n.length,n.time+4/PPQ),[128|c,pitch,0],1);noteCount++;
      }
      if(tuning.points.length>1||s.detune%100)warnings.add('La afinación se redondea al semitono en cada inicio de nota.');
    }
    if(!noteCount)fail('no quedan notas compatibles');
    if(clipped)warnings.add(clipped+' intensidades altas se limitaron al rango MIDI.');
    if(seq.effects||seq.unknownFields||seq.markers.some(m=>![0,1,2,8,9,10,11].includes(m.setting)))
      warnings.add('Los efectos, capas de sintetizador y automatizaciones especiales de Online Sequencer no se conservan.');
    if(seq.markers.some(m=>m.blend))warnings.add('Las transiciones se muestrean cada 1/16 de pulso, no son curvas continuas.');
    const chunks=[];let size=14;
    for(const events of tracks) {
      events.sort((a,b)=>a.tick-b.tick||a.priority-b.priority||a.order-b.order);
      const out=[];let last=0;
      for(const e of events){out.push(...vlq(e.tick-last));for(const b of e.bytes)out.push(b);last=e.tick;}
      out.push(0,255,47,0);const bytes=Uint8Array.from(out);chunks.push(bytes);size+=8+bytes.length;
    }
    if(size>16*1024*1024)fail('el MIDI convertido supera 16 MiB');
    const output=new Uint8Array(size),view=new DataView(output.buffer);
    output.set([77,84,104,100,0,0,0,6,0,1],0);view.setUint16(10,chunks.length);view.setUint16(12,PPQ);let at=14;
    for(const chunk of chunks){output.set([77,84,114,107],at);view.setUint32(at+4,chunk.length);output.set(chunk,at+8);at+=8+chunk.length;}
    return {bytes:output,report:{version:VERSION,noteCount,sourceNotes:seq.notes.length,instruments:ids.length,bpm:seq.bpm,duration,markers:seq.markers.length,warnings:[...warnings]}};
  }
  const api={VERSION,MAX_BYTES,decode,encodeMidi,convert:(bytes,metadata)=>encodeMidi(decode(bytes),metadata)};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.JSSCCSequenceCodec=Object.freeze(api);
})(globalThis);
