/* Live catalog search layer for PCM Edition. Keeps local library behavior when the query is empty. */
(function(){
  'use strict';
  const SEARCH_ENDPOINT='https://jsscc-sequence-bridge.lovable.app/api/public/sequence-search';
  const ORIGIN='https://onlinesequencer.net';
  const debounce=(fn,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const link=(text,url)=>{const a=el('a','edition-link',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
  function officialSearchUrl(q){
    const u=new URL(ORIGIN+'/sequences');
    u.searchParams.set('search',q);u.searchParams.set('sort','1');u.searchParams.set('date','4');u.searchParams.set('type','3');
    return u.toString();
  }
  function setup(){
    const search=document.getElementById('edition-search'),rail=document.getElementById('edition-sequence-cards'),feedback=document.getElementById('edition-feedback');
    if(!search||!rail||!feedback||!window.JSSCCSequenceRemote||!window.JSSCCMidi)return;
    search.placeholder='Buscar en el catálogo de Online Sequencer';
    search.setAttribute('aria-label','Buscar en el catálogo público de Online Sequencer');
    const remote=new window.JSSCCSequenceRemote.Importer();
    let serial=0,controller=null,query='';
    function tell(msg,bad=false){feedback.textContent=msg;feedback.dataset.error=String(bad);}
    function cancel(){serial++;if(controller)controller.abort();controller=null;}
    function clearRemote(){cancel();delete rail.dataset.liveSearch;}
    async function play(item,button){
      button.disabled=true;const old=button.textContent;button.textContent='Cargando…';
      try{
        await window.JSSCCMidi.unlockAudio();
        const result=await remote.get(item,{onProgress:(stage,bytes)=>tell(stage==='convert'?'Convirtiendo notas…':'Obteniendo secuencia… '+Math.ceil((bytes||0)/1024)+' KiB')});
        const name=(item.title||'Online Sequencer').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)+'-os'+item.id+'.mid';
        const file=new File([result.bytes],name,{type:'audio/midi'});
        if(!await window.JSSCCMidi.loadFile(file,{owner:'sequence-live-search'}))throw Error('No se pudo cargar la secuencia convertida.');
        if(!await window.JSSCCMidi.play({owner:'sequence-live-search'}))throw Error('La secuencia se cargó, pero el navegador no inició el audio.');
        tell('Reproduciendo '+item.title+' · '+result.report.noteCount+' notas.');
        document.getElementById('jsscc-sequencer-dialog')?.close();
      }catch(e){tell(e?.message||'No se pudo reproducir la secuencia.',true);}
      finally{button.disabled=false;button.textContent=old;}
    }
    function renderResults(payload,q){
      rail.dataset.liveSearch='true';rail.replaceChildren();
      if(!payload.results?.length){
        const empty=el('div','edition-empty');
        empty.append(el('p','',`No se encontraron resultados públicos para “${q}”.`),link('Abrir esa búsqueda en Online Sequencer ↗',officialSearchUrl(q)));
        rail.append(empty);return;
      }
      for(const r of payload.results){
        const item={id:String(r.id),title:r.title||('Secuencia '+r.id),author:r.author||'Online Sequencer',url:r.url||`${ORIGIN}/${r.id}`};
        const card=el('article','edition-card');card.dataset.sequenceId=item.id;
        const art=el('div','edition-art');art.append(el('span','edition-art-label',item.id),el('span','edition-art-os','OS'));
        if(r.thumbnail){const img=el('img');img.src=r.thumbnail;img.alt='Miniatura de '+item.title;img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();art.append(img);}
        card.append(art,el('span','edition-tag','RESULTADO DEL CATÁLOGO'),el('h3','',item.title));
        if(r.author)card.append(el('p','edition-author','Por '+r.author));
        if(r.duration)card.append(el('p','edition-duration','Duración: '+r.duration));
        else if(r.info)card.append(el('p','edition-duration',r.info));
        else if(Number.isFinite(r.notes))card.append(el('p','edition-duration',r.notes+' notas'));
        card.append(link('Abrir original ↗',item.url));
        const playBtn=el('button','edition-play','▶ Escuchar chiptune');playBtn.type='button';playBtn.onclick=()=>play(item,playBtn);card.append(playBtn);
        rail.append(card);
      }
      tell(`${payload.count ?? payload.results.length} resultados del catálogo para “${q}”.`);
    }
    function renderBlocked(q,message){
      rail.dataset.liveSearch='true';rail.replaceChildren();
      const box=el('div','edition-empty');
      box.append(el('p','',message||'Online Sequencer está bloqueando la consulta automática del catálogo desde nuestro servicio.'),
        el('p','', 'No significa que no existan resultados.'),
        link(`Buscar “${q}” en el catálogo oficial ↗`,officialSearchUrl(q)),
        el('p','', 'Cuando abras una canción allí, puedes pegar su URL o ID abajo y JSSCC la reproducirá directamente como chiptune.'));
      rail.append(box);
    }
    function renderBrowserChallenge(q,message){
      rail.dataset.liveSearch='true';rail.replaceChildren();
      const box=el('div','edition-empty');
      box.append(
        el('p','',message||'Online Sequencer necesita verificar tu navegador.'),
        el('p','', 'La extensión dejó abierta la pestaña de Online Sequencer para que completes esa verificación manualmente.'),
        el('p','', 'Después vuelve a JSSCC y busca de nuevo “'+q+'”.'),
        link('Abrir la búsqueda oficial ↗',officialSearchUrl(q))
      );
      rail.append(box);
    }
    async function run(){
      const q=search.value.trim();query=q;
      if(q.length<2){clearRemote();return;}
      cancel();const mine=++serial;controller=new AbortController();
      rail.dataset.liveSearch='true';rail.replaceChildren(el('p','edition-empty','Buscando “'+q+'” en el catálogo público…'));
      tell('Consultando catálogo público…');
      try{
        const u=new URL(SEARCH_ENDPOINT);u.searchParams.set('q',q);u.searchParams.set('page','1');u.searchParams.set('sort','newest');u.searchParams.set('range','all');u.searchParams.set('scope','all');
        const res=await fetch(u,{signal:controller.signal,headers:{Accept:'application/json'}});
        const body=await res.json().catch(()=>({}));
        if(mine!==serial||q!==query)return;
        if(!res.ok){
          if(body.error==='browser_challenge'){
            renderBrowserChallenge(q,body.message);
            tell(body.message||'Completa la verificación en la pestaña de Online Sequencer y vuelve a buscar.',true);
          }else if(body.error==='upstream_challenge'||body.error==='upstream_login'){
            renderBlocked(q,'Online Sequencer activó su protección anti-bot para esta consulta automática.');
            tell(body.message||'La búsqueda automática no está disponible; abre la búsqueda oficial.',true);
          }else{
            renderBlocked(q,body.message||'No fue posible consultar el catálogo ahora mismo.');
            tell(body.message||'No fue posible consultar el catálogo ahora mismo.',true);
          }
          return;
        }
        renderResults(body,q);
      }catch(e){
        if(e.name==='AbortError'||mine!==serial)return;
        renderBlocked(q,'No se pudo conectar con el buscador del catálogo.');tell('No se pudo consultar el catálogo; usa el enlace oficial.',true);
      }finally{if(mine===serial)controller=null;}
    }
    const debounced=debounce(run,450);
    search.addEventListener('input',()=>{if(search.value.trim().length>=2)debounced();else clearRemote();});
    search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run();}});
    const dlg=document.getElementById('jsscc-sequencer-dialog');dlg?.addEventListener('close',cancel);
    window.JSSCCEditionSearch={run,officialSearchUrl};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(setup,0));else setTimeout(setup,0);
})();
