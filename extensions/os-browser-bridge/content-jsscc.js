'use strict';
const PAGE_SOURCE='JSSCC_PAGE';
const EXT_SOURCE='JSSCC_OS_BRIDGE';
const VERSION='0.1.0';

window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin)return;
  const data=event.data;
  if(!data||data.source!==PAGE_SOURCE||typeof data.requestId!=='string')return;
  if(data.type==='PING'){
    window.postMessage({source:EXT_SOURCE,requestId:data.requestId,ok:true,payload:{version:VERSION}},location.origin);
    return;
  }
  if(data.type!=='SEARCH')return;
  chrome.runtime.sendMessage({type:'JSSCC_OS_SEARCH',payload:data.payload||{}}).then(payload=>{
    window.postMessage({source:EXT_SOURCE,requestId:data.requestId,ok:true,payload},location.origin);
  }).catch(error=>{
    window.postMessage({source:EXT_SOURCE,requestId:data.requestId,ok:false,error:error?.message||'No se pudo consultar Online Sequencer'},location.origin);
  });
});
