/* Optional browser-extension bridge for Online Sequencer catalog search.
 * When the companion extension is installed, exact catalog searches are performed
 * in the user's browser session instead of the server-side search bridge.
 * Without the extension, the existing network search/fallback remains untouched.
 */
(function(root){
  'use strict';
  const VERSION='0.1.0';
  const PAGE_SOURCE='JSSCC_PAGE';
  const EXT_SOURCE='JSSCC_OS_BRIDGE';
  const SEARCH_ENDPOINT='https://jsscc-sequence-bridge.lovable.app/api/public/sequence-search';
  const originalFetch=root.fetch.bind(root);
  const pending=new Map();
  let sequence=0,lastSeen=0;

  function id(){return 'osb-'+Date.now().toString(36)+'-'+(++sequence).toString(36)+'-'+Math.random().toString(36).slice(2,8);}
  function send(type,payload={},timeout=1200){
    const requestId=id();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('OS Browser Bridge no detectado'));},timeout);
      pending.set(requestId,{resolve,reject,timer});
      root.postMessage({source:PAGE_SOURCE,type,requestId,payload},root.location.origin);
    });
  }
  root.addEventListener('message',event=>{
    if(event.source!==root||event.origin!==root.location.origin)return;
    const data=event.data;
    if(!data||data.source!==EXT_SOURCE||typeof data.requestId!=='string')return;
    const wait=pending.get(data.requestId);if(!wait)return;
    pending.delete(data.requestId);clearTimeout(wait.timer);lastSeen=Date.now();
    if(data.ok===false)wait.reject(new Error(data.error||'OS Browser Bridge falló'));
    else wait.resolve(data.payload||{});
  });

  async function ping(){
    try{const out=await send('PING',{},500);return !!out.version;}catch(_){return false;}
  }
  async function search(params){
    const out=await send('SEARCH',params,20000);
    if(!Array.isArray(out.results))throw new Error('Respuesta inválida del OS Browser Bridge');
    return out;
  }
  function isCatalogSearch(input){
    try{const u=new URL(typeof input==='string'?input:input.url,root.location.href);return u.href.startsWith(SEARCH_ENDPOINT);}catch(_){return false;}
  }
  root.fetch=async function(input,init){
    if(!isCatalogSearch(input))return originalFetch(input,init);
    let u;try{u=new URL(typeof input==='string'?input:input.url,root.location.href);}catch(_){return originalFetch(input,init);}
    const params={
      q:(u.searchParams.get('q')||'').slice(0,120),
      page:Math.max(1,Math.min(20,Number(u.searchParams.get('page'))||1)),
      sort:(u.searchParams.get('sort')||'newest').slice(0,20),
      range:(u.searchParams.get('range')||'all').slice(0,20),
      scope:(u.searchParams.get('scope')||'all').slice(0,20)
    };
    if(params.q.length<2)return originalFetch(input,init);
    try{
      if(!(Date.now()-lastSeen<30000) && !(await ping()))return originalFetch(input,init);
      const payload=await search(params);
      payload.source='browser-extension';
      payload.count=Number.isFinite(payload.count)?payload.count:payload.results.length;
      return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json','x-jsscc-search-source':'browser-extension'}});
    }catch(error){
      console.info('[JSSCC] OS Browser Bridge unavailable:',error.message);
      return originalFetch(input,init);
    }
  };
  root.JSSCCOSBrowserBridge=Object.freeze({VERSION,ping,search,get available(){return Date.now()-lastSeen<30000;}});
})(window);
