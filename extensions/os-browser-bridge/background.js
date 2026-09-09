'use strict';
const JSSCC_PREFIX='https://grappepie.github.io/JSSCC/';

function officialSearchUrl(query,{page=1,sort='newest',range='all',scope='all'}={}){
  const u=new URL('https://onlinesequencer.net/sequences');
  u.searchParams.set('search',String(query||'').slice(0,120));
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
    const timer=setTimeout(()=>finish(Object.assign(new Error('Online Sequencer tardó demasiado en cargar'),{code:'timeout'})),timeout);
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);chrome.tabs.onUpdated.removeListener(onUpdated);error?reject(error):resolve();};
    const onUpdated=(id,change)=>{if(id===tabId&&change.status==='complete')finish();};
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then(tab=>{if(tab.status==='complete')finish();}).catch(finish);
  });
}
function challengeError(){
  const e=new Error('Online Sequencer necesita verificar este navegador. Completa la verificación en la pestaña abierta y vuelve a buscar.');
  e.code='challenge';
  return e;
}
async function tabLooksChallenged(tabId){
  const tab=await chrome.tabs.get(tabId).catch(()=>null);
  const title=String(tab?.title||'').toLowerCase();
  const url=String(tab?.url||'').toLowerCase();
  return /just a moment|checking your browser|verify you are human|cloudflare|turnstile/.test(title+' '+url);
}
async function scrape(tabId){
  let lastError;
  for(let i=0;i<6;i++){
    if(await tabLooksChallenged(tabId))throw challengeError();
    try{
      const response=await chrome.tabs.sendMessage(tabId,{type:'JSSCC_OS_SCRAPE'});
      if(response?.ok)return response.payload;
      if(response?.error){
        const error=new Error(response.error);
        error.code=response.code||'scrape_error';
        throw error;
      }
    }catch(error){
      lastError=error;
      if(error?.code==='challenge')break;
      if(await tabLooksChallenged(tabId))throw challengeError();
    }
    await new Promise(r=>setTimeout(r,250));
  }
  throw lastError||Object.assign(new Error('No se pudo leer el catálogo de Online Sequencer'),{code:'scrape_error'});
}
async function search(payload){
  const q=String(payload?.q||'').trim();
  if(q.length<2)throw new Error('Escribe al menos dos caracteres');
  const url=officialSearchUrl(q,payload||{});
  const tab=await chrome.tabs.create({url,active:false});
  let keepOpen=false;
  try{
    await waitForComplete(tab.id);
    if(await tabLooksChallenged(tab.id))throw challengeError();
    const result=await scrape(tab.id);
    return {...result,query:q,source:'browser-extension'};
  }catch(error){
    if(error?.code==='challenge'){
      keepOpen=true;
      await chrome.tabs.update(tab.id,{active:true}).catch(()=>{});
      const live=await chrome.tabs.get(tab.id).catch(()=>null);
      if(live?.windowId!=null)await chrome.windows.update(live.windowId,{focused:true}).catch(()=>{});
    }
    throw error;
  }finally{
    if(!keepOpen)chrome.tabs.remove(tab.id).catch(()=>{});
  }
}
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type!=='JSSCC_OS_SEARCH')return;
  const senderUrl=sender.tab?.url||sender.url||'';
  if(!senderUrl.startsWith(JSSCC_PREFIX)){
    sendResponse({ok:false,code:'origin',error:'Origen no permitido'});return;
  }
  search(message.payload).then(
    payload=>sendResponse({ok:true,payload}),
    error=>sendResponse({ok:false,code:error?.code||'search_error',error:error?.message||'No se pudo consultar Online Sequencer'})
  );
  return true;
});
