'use strict';

function clean(text){return String(text||'').replace(/\s+/g,' ').trim();}
function candidateContainer(anchor){
  let node=anchor.parentElement,best=node||anchor;
  for(let i=0;i<7&&node;i++,node=node.parentElement){
    const text=clean(node.innerText);
    if(text.length<20||text.length>700)continue;
    best=node;
    if(/\bby\b/i.test(text)&&/\b\d{1,2}:\d{2}\b/.test(text))return node;
  }
  return best;
}
function safeThumbnail(value){
  if(!value)return '';
  try{
    const u=new URL(String(value).trim(),location.href);
    if(u.protocol!=='https:'||u.origin!=='https://onlinesequencer.net'||u.search||u.hash)return '';
    if(!/^\/t\/\d+\/[\w.-]+\.(?:gif|png|jpe?g|webp)$/i.test(u.pathname))return '';
    return u.href;
  }catch(_){return '';}
}
function srcsetUrls(value){
  return String(value||'').split(',').map(x=>x.trim().split(/\s+/)[0]).filter(Boolean);
}
function cssUrls(value){
  const out=[];const re=/url\((['"]?)(.*?)\1\)/gi;let m;
  while((m=re.exec(String(value||''))))out.push(m[2]);
  return out;
}
function findThumbnail(box){
  const nodes=[box,...box.querySelectorAll('img,source,[style],[data-src],[data-original],[data-lazy-src],[data-background-image]')];
  for(const node of nodes.slice(0,80)){
    const candidates=[];
    if(node.currentSrc)candidates.push(node.currentSrc);
    if(node.src)candidates.push(node.src);
    for(const attr of ['src','data-src','data-original','data-lazy-src','data-background-image']){
      const value=node.getAttribute?.(attr);if(value)candidates.push(value);
    }
    for(const value of srcsetUrls(node.getAttribute?.('srcset')))candidates.push(value);
    for(const value of cssUrls(node.getAttribute?.('style')))candidates.push(value);
    try{for(const value of cssUrls(getComputedStyle(node).backgroundImage))candidates.push(value);}catch(_){}
    for(const value of candidates){const safe=safeThumbnail(value);if(safe)return safe;}
  }
  return '';
}
function parseCard(anchor,id){
  const box=candidateContainer(anchor);
  const text=clean(box.innerText);
  const rawTitle=clean(anchor.textContent);
  const title=rawTitle&&rawTitle!==id?rawTitle:('Sequence '+id);
  const authorMatch=text.match(/\bby\s+(.{1,80}?)(?=\s+\d{4}-\d{2}-\d{2}|\s+\d{1,2}:\d{2}|$)/i);
  const durationMatch=text.match(/(?:^|\s)(\d{1,2}:\d{2})(?:\s|$)/);
  return {
    id,
    title:title.slice(0,180),
    author:authorMatch?clean(authorMatch[1]).slice(0,100):'',
    duration:durationMatch?durationMatch[1]:'',
    info:text.slice(0,240),
    thumbnail:findThumbnail(box),
    url:'https://onlinesequencer.net/'+id
  };
}
function scrape(){
  const body=clean(document.body?.innerText);
  if(/just a moment|checking your browser|verify you are human|cloudflare|turnstile/i.test(body)){
    const error=new Error('Online Sequencer necesita verificar este navegador. Completa la verificación en la pestaña abierta y vuelve a buscar.');
    error.code='challenge';
    throw error;
  }
  const byId=new Map();
  for(const a of document.querySelectorAll('a[href]')){
    let u;try{u=new URL(a.href,location.href);}catch(_){continue;}
    if(u.hostname!=='onlinesequencer.net')continue;
    const match=u.pathname.match(/^\/(\d{1,9})\/?$/);if(!match)continue;
    const id=match[1],card=parseCard(a,id),old=byId.get(id);
    const score=x=>(/^Sequence \d+$/.test(x.title)?0:1000)+x.title.length+(x.author?200:0)+(x.duration?100:0)+(x.thumbnail?50:0);
    if(!old||score(card)>score(old))byId.set(id,card);
  }
  const results=[...byId.values()].filter(x=>x.title&&!/^Sequence \d+$/.test(x.title)).slice(0,60);
  if(!results.length)throw new Error('No se pudieron leer resultados del catálogo cargado.');
  return {results,count:results.length,pageTitle:document.title};
}

chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if(message?.type!=='JSSCC_OS_SCRAPE')return;
  try{sendResponse({ok:true,payload:scrape()});}
  catch(error){sendResponse({ok:false,code:error?.code||'scrape_error',error:error?.message||'No se pudo leer el catálogo'});}
});
