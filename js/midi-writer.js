/* JSSCC Studio -> Standard MIDI File writer. No dependencies. */
(function(root){
  'use strict';
  const PPQ=480;
  const PROGRAM={square:80,triangle:81,saw:81,noise:0};
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const bytes=s=>Array.from(new TextEncoder().encode(String(s).slice(0,120)));
  function vlq(value){
    let n=Math.max(0,Math.floor(value)),out=[n&127];
    while((n=Math.floor(n/128))>0)out.unshift((n&127)|128);
    return out;
  }
  function meta(type,data){return [0xff,type,...vlq(data.length),...data];}
  function u16(n){return [(n>>>8)&255,n&255];}
  function u32(n){return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];}
  function chunk(tag,data){return [...bytes(tag),...u32(data.length),...data];}
  function eventTrack(events){
    events.sort((a,b)=>a.tick-b.tick||a.priority-b.priority||a.order-b.order);
    let last=0,out=[];
    for(const e of events){out.push(...vlq(e.tick-last),...e.data);last=e.tick;}
    out.push(0,0xff,0x2f,0);
    return chunk('MTrk',out);
  }
  function normalizeProject(project){
    if(!project||!Array.isArray(project.tracks)||!project.patterns)throw Error('Proyecto inválido');
    const bpm=clamp(Math.round(+project.bpm||120),20,400);
    const bars=clamp(Math.round(+project.bars||4),1,32);
    const structure=Array.isArray(project.structure)&&project.structure.length?project.structure:[project.currentPattern||Object.keys(project.patterns)[0]];
    return {...project,bpm,bars,structure};
  }
  function build(project){
    const p=normalizeProject(project),ticksPerStep=PPQ/4,stepsPerPattern=p.bars*16;
    let serial=0;
    const conductor=[
      {tick:0,priority:0,order:serial++,data:meta(3,bytes(p.title||'JSSCC Studio'))},
      {tick:0,priority:0,order:serial++,data:meta(0x51,u32(Math.round(60000000/p.bpm)).slice(1))},
      {tick:0,priority:0,order:serial++,data:meta(0x58,[4,2,24,8])}
    ];
    const tracks=[eventTrack(conductor)];
    const melodicChannels=[0,1,2,3,4,5,6,7,8,10,11,12,13,14,15];
    let channelCursor=0;
    for(const track of p.tracks){
      const isNoise=track.instrument==='noise',channel=isNoise?9:melodicChannels[channelCursor++%melodicChannels.length];
      const ev=[
        {tick:0,priority:0,order:serial++,data:meta(3,bytes(track.name||track.instrument||'Track'))},
        {tick:0,priority:0,order:serial++,data:[0xc0|channel,PROGRAM[track.instrument]??80]},
        {tick:0,priority:0,order:serial++,data:[0xb0|channel,7,clamp(Math.round((track.volume??85)*1.27),0,127)]}
      ];
      let baseStep=0;
      for(const patternId of p.structure){
        const pattern=p.patterns[patternId];
        const notes=pattern?.notes?.[track.id]||[];
        for(const note of notes){
          const start=baseStep+clamp(Math.round(+note.step||0),0,stepsPerPattern-1);
          const len=clamp(Math.round(+note.length||1),1,stepsPerPattern);
          let pitch=clamp(Math.round(+note.pitch||60),0,127);
          if(isNoise){
            const drum=[36,38,42,46,49,41,45,51];
            pitch=drum[Math.abs(pitch)%drum.length];
          }
          const velocity=clamp(Math.round(+note.velocity||96),1,127);
          const onTick=Math.round(start*ticksPerStep),offTick=Math.round((start+len)*ticksPerStep);
          ev.push({tick:onTick,priority:2,order:serial++,data:[0x90|channel,pitch,velocity]});
          ev.push({tick:offTick,priority:1,order:serial++,data:[0x80|channel,pitch,0]});
        }
        baseStep+=stepsPerPattern;
      }
      tracks.push(eventTrack(ev));
    }
    const header=chunk('MThd',[0,1,...u16(tracks.length),...u16(PPQ)]);
    const size=header.length+tracks.reduce((n,t)=>n+t.length,0),out=new Uint8Array(size);
    let at=0;out.set(header,at);at+=header.length;for(const t of tracks){out.set(t,at);at+=t.length;}
    return out;
  }
  function safeName(name){return String(name||'jsscc-song').normalize('NFKD').replace(/[^a-zA-Z0-9 _-]+/g,'').trim().replace(/\s+/g,'-').slice(0,80)||'jsscc-song';}
  function download(project){
    const data=build(project),blob=new Blob([data],{type:'audio/midi'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=safeName(project.title)+'.mid';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    return data;
  }
  root.JSSCCMidiWriter=Object.freeze({PPQ,build,download});
})(globalThis);
