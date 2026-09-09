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
  const INSTALL_URL='https://github.com/GrappePie/JSSCC/tree/github-pages/extensions/os-browser-bridge';
  const originalFetch=root.fetch.bind(root);
  const pending=new Map();
  const prefs={sort:'newest',range:'all',scope:'all'};
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
      sort:prefs.sort,
      range:prefs.range,
      scope:prefs.scope
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

  function filterButton(label,key,value,searchInput){
    const b=document.createElement('button');b.type='button';b.className='edition-minor';b.textContent=label;b.dataset.active=String(prefs[key]===value);
    b.onclick=()=>{
      prefs[key]=value;
      b.parentElement.querySelectorAll('button').forEach(x=>x.dataset.active=String(x===b));
      if(searchInput.value.trim().length>=2)searchInput.dispatchEvent(new Event('input',{bubbles:true}));
    };
    return b;
  }
  async function enhanceUi(){
    const dialog=document.getElementById('jsscc-sequencer-dialog'),nav=dialog?.querySelector('.edition-nav'),searchInput=document.getElementById('edition-search');
    if(!dialog||!nav||!searchInput)return setTimeout(enhanceUi,80);
    if(document.getElementById('os-browser-bridge-status'))return;
    const row=document.createElement('p');row.id='os-browser-bridge-status';row.className='edition-feedback';row.textContent='Comprobando OS Browser Bridge…';nav.insertAdjacentElement('afterend',row);
    const filters=document.createElement('div');filters.className='edition-bridge-filters';filters.setAttribute('aria-label','Filtros del catálogo');
    const sort=document.createElement('div');sort.className='edition-filter-group';sort.append(document.createTextNode('Orden: '));
    [['Newest','newest'],['Popular','popular'],['Most Notes','notes'],['Longest','longest']].forEach(([label,value])=>sort.append(filterButton(label,'sort',value,searchInput)));
    const range=document.createElement('div');range.className='edition-filter-group';range.append(document.createTextNode('Fecha: '));
    [['Today','today'],['This week','week'],['This month','month'],['All time','all']].forEach(([label,value])=>range.append(filterButton(label,'range',value,searchInput)));
    row.insertAdjacentElement('afterend',filters);filters.append(sort,range);
    const connected=await ping();
    if(connected){row.textContent='OS Browser Bridge conectado · las búsquedas usan tu sesión normal del navegador.';row.dataset.error='false';}
    else{
      row.textContent='OS Browser Bridge no instalado · se usará el buscador auxiliar/fallback. ';
      const a=document.createElement('a');a.className='edition-link';a.textContent='Instalar integración ↗';a.href=INSTALL_URL;a.target='_blank';a.rel='noopener noreferrer';row.append(a);row.dataset.error='false';
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(enhanceUi,0));else setTimeout(enhanceUi,0);
  root.JSSCCOSBrowserBridge=Object.freeze({VERSION,ping,search,INSTALL_URL,prefs,get available(){return Date.now()-lastSeen<30000;}});
})(window);
