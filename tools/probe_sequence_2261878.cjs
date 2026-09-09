'use strict';
const fs=require('node:fs');
const codec=require('../js/sequence-codec.js');
const id='2261878';
const endpoint='https://jsscc-sequence-bridge.lovable.app/api/public/sequence-bridge?id='+id;
(async()=>{
  const started=Date.now();
  const res=await fetch(endpoint,{headers:{Origin:'https://grappepie.github.io',Accept:'application/octet-stream'}});
  const body=new Uint8Array(await res.arrayBuffer());
  const result={id,status:res.status,contentType:res.headers.get('content-type'),length:body.length,xSequenceId:res.headers.get('x-sequence-id'),elapsedMs:Date.now()-started};
  if(!res.ok){result.errorText=new TextDecoder().decode(body).slice(0,2000);console.log(JSON.stringify(result,null,2));process.exitCode=1;return;}
  try{
    const decoded=codec.decode(body);
    result.decode={notes:decoded.notes.length,markers:decoded.markers.length,instruments:decoded.instruments.size,bpm:decoded.bpm,timeSignature:decoded.timeSignature,unknownFields:decoded.unknownFields,effects:decoded.effects};
    const converted=codec.encodeMidi(decoded,{id:Number(id),title:'Cocoa Cave - Kirby Super Star'});
    result.convert={bytes:converted.bytes.length,report:converted.report};
    fs.writeFileSync('test-results/2261878.mid',converted.bytes);
  }catch(e){result.convertError=e && e.stack ? e.stack : String(e);process.exitCode=2;}
  fs.writeFileSync('test-results/sequence-2261878-probe.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=3;});
