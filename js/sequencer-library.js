/* Independent link library. No remote MIDI proxy, catalog scraping or OS API keys.
 * Titles/URLs are references; a linked MIDI is supplied by the user and kept in RAM.
 */
(function(root){
  'use strict';
  const ORIGIN='https://onlinesequencer.net',MAX_LINKS=40;
  function sequenceId(input){
    const text=String(input??'').trim();
    if(/^[1-9]\d{0,8}$/.test(text))return Number(text);
    if(text.length>2048)throw new Error('El enlace es demasiado largo.');
    let u;try{u=new URL(text);}catch(_){throw new Error('Pega un enlace de Online Sequencer o un ID numérico.');}
    const m=/^\/([1-9]\d{0,8})\/?$/.exec(u.pathname);
    if(!['https:','http:'].includes(u.protocol)||u.hostname!=='onlinesequencer.net'||u.port||u.username||u.password||!m)
      throw new Error('Usa https://onlinesequencer.net/ seguido del ID de la canción.');
    return Number(m[1]);
  }
  const text=(value,fallback,max)=>typeof value==='string'&&value.trim()?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):fallback;
  function record(item){
    if(!item||typeof item!=='object')throw new Error('Referencia inválida.');
    const id=sequenceId(item.id??item.url);
    let thumbnail=null;
    if(typeof item.thumbnail==='string')try{const u=new URL(item.thumbnail);if(u.origin===ORIGIN&&/^\/t\/\d+\/[\w-]+\.(?:gif|png|jpg)$/.test(u.pathname)&&!u.search&&!u.hash)thumbnail=u.href;}catch(_){}
    return {id,url:ORIGIN+'/'+id,title:text(item.title,'Secuencia #'+id,180),author:text(item.author,'Autor por confirmar',80),duration:text(item.duration,'',12),thumbnail};
  }
  function readSaved(storage){
    try{const items=JSON.parse(storage.getItem('jsscc-os-links-v1')||'[]');if(!Array.isArray(items))return [];return items.slice(0,MAX_LINKS).flatMap(x=>{try{return [record(x)];}catch(_){return [];}});}catch(_){return [];}
  }
  function save(storage,items){
    try{storage.setItem('jsscc-os-links-v1',JSON.stringify(items.slice(0,MAX_LINKS).map(record)));return true;}catch(_){return false;}
  }
  const api={ORIGIN,MAX_LINKS,sequenceId,record,readSaved,save};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.JSSCCSequenceLibrary=Object.freeze(api);
})(globalThis);
