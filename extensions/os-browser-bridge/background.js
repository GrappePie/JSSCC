'use strict';
const JSSCC_PREFIX='https://grappepie.github.io/JSSCC/';

function officialSearchUrl(query,{page=1,sort='newest',range='all',scope='all'}={}){
  const u=new URL('https://onlinesequencer.net/sequences');
  u.searchParams.set('search',String(query||'').slice(0,120));
  // Verified against the live Online Sequencer catalog links on 2026-09-08.
  // sort: 1 newest, 2 popular, 3 most notes, 4 oldest, 5 longest.
  // date: 1 today, 2 this week, 3 this month, 4 all time.
  const sortMap={newest:'1',popular:'2',notes:'3',oldest:'4',longest:'5'};
  const dateMap={today:'1',week:'2',month:'3',all:'4'};
  u.searchParams.set('sort',sortMap[sort]||'1');
  u.searchParams.set('date',dateMap[range]||'4');
  u.searchParams.set('type',scope==='featured'?'1':scope==='registered'?'2':'3');
  if(page>1)u.searchParams.set('page',String(Math.min(20,page)));
  return u.href;
}
function waitForComplete(tabId,timeout=15000){
  return new Promise((resolve,reject)=>{
    let done=false;
    const timer=setTimeout(()=>finish(new Error('Online Sequencer tardó demasiado en cargar')),timeout);
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);chrome.tabs.onUpdated.removeListener(onUpdated);error?reject(error):resolve();};
    const onUpdated=(id,change)=>{if(id===tabId&&change.status==='complete')finish();};
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then(tab=>{if(tab.status==='complete')finish();}).catch(finish);
  });
}
async function scrape(tabId){
  let lastError;
  for(let i=0;i<6;i++){
    try{
      const response=await chrome.tabs.sendMessage(tabId,{type:'JSSCC_OS_SCRAPE'});
      if(response?.ok)return response.payload;
      if(response?.error)throw new Error(response.error);
    }catch(error){lastError=error;}
    await new Promise(r=>setTimeout(r,250));
  }
  throw lastError||new Error('No se pudo leer el catálogo de Online Sequencer');
}
async function search(payload){
  const q=String(payload?.q||'').trim();
  if(q.length<2)throw new Error('Escribe al menos dos caracteres');
  const url=officialSearchUrl(q,payload||{});
  const tab=await chrome.tabs.create({url,active:false});
  try{
    await waitForComplete(tab.id);
    const result=await scrape(tab.id);
    return {...result,query:q,source:'browser-extension'};
  }finally{
    chrome.tabs.remove(tab.id).catch(()=>{});
  }
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type!=='JSSCC_OS_SEARCH')return;
  const senderUrl=sender.tab?.url||sender.url||'';
  if(!senderUrl.startsWith(JSSCC_PREFIX)){
    sendResponse({ok:false,error:'Origen no permitido'});return;
  }
  search(message.payload).then(
    payload=>sendResponse({ok:true,payload}),
    error=>sendResponse({ok:false,error:error?.message||'No se pudo consultar Online Sequencer'})
  );
  return true;
});
