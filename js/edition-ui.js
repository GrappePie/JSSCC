/* Edition identity + optional Online Sequencer reference drawer. No synthesis changes. */
(function(){
  'use strict';
  const E=window.JSSCCEdition,L=window.JSSCCSequenceLibrary;
  if(!E||!L)return;
  const el=(tag,cls,content)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=content;return e;};
  const link=(title,url)=>{const a=el('a','edition-link',title);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
  function setup(){
    const controls=document.querySelector('.jsscc-control-row');if(!controls)return;
    let storage;try{storage=window.localStorage;}catch(_){storage=null;}
    let saved=L.readSaved(storage),selection=[],loading=null,thumbnails=false,selectedId=null,busy=false,creditSeq=null;
    const midiFiles=new Map();let usedBytes=0;const MAX_BYTES=32*1024*1024;
    const open=el('button','edition-launch');open.type='button';open.id='jsscc-sequencer';
    open.append(el('span','edition-os-badge','OS'),el('span','', 'Online Sequencer'));
    open.title='Enlaces a Online Sequencer e importación local de MIDI. No es una colaboración oficial.';
    open.setAttribute('aria-haspopup','dialog');controls.append(open);
    const creditLink=link('Créditos y licencias','./credits.html');creditLink.classList.add('edition-credits');controls.append(creditLink);
    const product=el('span','edition-product',E.name+' · v'+E.version+' · '+E.status);product.id='jsscc-edition';
    document.querySelector('.jsscc-controls').append(product);
    const source=el('div','edition-source');source.id='jsscc-sequence-source';source.hidden=true;document.querySelector('.jsscc-controls').append(source);
    const drawer=el('dialog','edition-drawer');drawer.id='jsscc-sequencer-dialog';drawer.setAttribute('aria-labelledby','edition-gallery-title');
    const head=el('header','edition-drawer-head');const titleBlock=el('div');titleBlock.append(el('p','edition-eyebrow','EXPLORAR · ENLAZAR · ESCUCHAR'));
    const title=el('h2','', 'Online Sequencer');title.id='edition-gallery-title';titleBlock.append(title,el('p','edition-subtitle','Tu biblioteca de enlaces, con el sonido de PCM Edition.'));
    const close=el('button','edition-close','×');close.type='button';close.setAttribute('aria-label','Cerrar biblioteca');close.onclick=()=>drawer.close();head.append(titleBlock,close);drawer.append(head);
    const notice=el('p','edition-notice','Integración independiente, no oficial. Selección de enlaces del 08 sep 2026; no es un catálogo en directo. Para escuchar aquí, exporta el MIDI en la página original y cárgalo en su tarjeta.');notice.id='edition-network-note';drawer.append(notice);
    const nav=el('div','edition-nav');const search=el('input');search.type='search';search.placeholder='Filtrar título o autor de estos enlaces';search.setAttribute('aria-label','Filtrar enlaces guardados');search.id='edition-search';
    nav.append(search,link('Explorar catálogo oficial ↗',L.ORIGIN+'/sequences'));drawer.append(nav);
    const railRow=el('div','edition-rail-row');const prev=el('button','edition-arrow','‹'),next=el('button','edition-arrow','›');
    prev.type=next.type='button';prev.setAttribute('aria-label','Tarjetas anteriores');next.setAttribute('aria-label','Tarjetas siguientes');
    const rail=el('div','edition-rail');rail.id='edition-sequence-cards';rail.setAttribute('role','region');rail.setAttribute('aria-label','Canciones enlazadas');rail.tabIndex=0;
    function slide(dir){rail.scrollBy({left:dir*Math.max(280,rail.clientWidth*.85),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
    prev.onclick=()=>slide(-1);next.onclick=()=>slide(1);railRow.append(prev,rail,next);drawer.append(railRow);
    const feedback=el('p','edition-feedback');feedback.id='edition-feedback';feedback.setAttribute('role','status');drawer.append(feedback);
    const form=el('form','edition-add-form');form.append(el('label','', 'Añadir otro enlace'));
    const urlInput=el('input');urlInput.id='edition-sequence-url';urlInput.placeholder='https://onlinesequencer.net/1234567';urlInput.required=true;urlInput.maxLength=2048;urlInput.setAttribute('aria-label','Enlace o ID de Online Sequencer');
    const add=el('button','', 'Añadir');add.type='submit';form.append(urlInput,add);drawer.append(form);
    const options=el('div','edition-options');const thumbLabel=el('label');const thumb=el('input');thumb.type='checkbox';thumb.id='edition-thumbnails';
    thumbLabel.append(thumb,document.createTextNode('Cargar miniaturas externas (conecta con Online Sequencer)'));options.append(thumbLabel);drawer.append(options);
    const help=el('details','edition-help');help.append(el('summary','', 'Cómo funciona la reproducción y qué falta para conectar el catálogo'));
    help.append(el('p','', 'Abre la canción original → Export MIDI → Cargar MIDI y escuchar. El archivo se sintetiza aquí; no se reproduce una grabación de Online Sequencer. La asociación entre el enlace y el archivo la eliges tú, no se verifica automáticamente.'));
    help.append(el('p','', 'Los MIDI asociados se conservan solo durante esta sesión (máximo 32 MiB en conjunto). Se guardan únicamente tus enlaces en este navegador; no se suben los archivos. Usa música propia o con los permisos necesarios.'));
    help.append(el('p','', 'La carga automática del catálogo y de las canciones está pendiente: las respuestas comprobadas no habilitan CORS para nuestra página. No usamos proxies públicos, credenciales ni descargas masivas. Una API habilitada o un servicio acordado con Online Sequencer permitiría completar el flujo de un clic.'));
    help.append(el('p','', 'El distintivo OS es una etiqueta propia de acceso, no su logotipo oficial ni un sello de colaboración. Las miniaturas opcionales se muestran desde su sitio sin copiarlas al repositorio.'));
    help.append(link('Privacidad de Online Sequencer ↗',L.ORIGIN+'/privacy'));drawer.append(help);
    const fileInput=el('input');fileInput.type='file';fileInput.accept='.mid,.midi';fileInput.hidden=true;fileInput.id='edition-midi-file';drawer.append(fileInput);document.body.append(drawer);
    function tell(message,bad=false){feedback.textContent=message;feedback.dataset.error=String(bad);}
    function all(){const map=new Map(selection.map(x=>[x.id,x]));for(const x of saved)map.set(x.id,x);return [...map.values()];}
    function showSource(item,file){creditSeq=window.JSSCCMidi.current;source.replaceChildren(document.createTextNode('Referencia elegida: '),link(item.title+' · '+item.author,item.url),document.createTextNode(' | MIDI local: '+file.name+' (asociación elegida por ti)'));source.hidden=false;window.dispatchEvent(new Event('resize'));}
    async function playItem(item,file){
      if(busy)return false;busy=true;render();tell('Cargando MIDI local con el motor seleccionado…');
      try{
        const player=window.JSSCCMidi;
        if(!player||!await player.loadFile(file))throw new Error('No se pudo leer el MIDI. La canción anterior no se reemplaza por un archivo inválido.');
        showSource(item,file);
        const played=await player.play();
        if(!played)throw new Error('MIDI cargado, pero el audio no arrancó. Revisa el estado del reproductor.');
        tell('Reproduciendo '+file.name+' en PCM Edition.');drawer.close();return true;
      }catch(e){tell(e.message,true);return false;}
      finally{busy=false;render();}
    }
    function render(){
      rail.replaceChildren();const q=search.value.trim().toLocaleLowerCase();
      const items=all().filter(x=>(x.title+' '+x.author+' '+x.id).toLocaleLowerCase().includes(q));
      if(!items.length)rail.append(el('p','edition-empty','No hay coincidencias en estos enlaces. Abre el catálogo oficial o añade un ID.'));
      for(const item of items){
        const file=midiFiles.get(item.id),card=el('article','edition-card');card.dataset.sequenceId=item.id;
        const art=el('div','edition-art');art.append(el('span','edition-art-label',String(item.id)),el('span','edition-art-os','OS'));
        if(thumbnails&&item.thumbnail){const img=el('img');img.src=item.thumbnail;img.alt='Miniatura de '+item.title;img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();art.append(img);}
        const h=el('h3','',item.title);h.title=item.title;
        card.append(art,el('span','edition-tag',file?'MIDI LOCAL ASOCIADO':'ENLACE · REQUIERE MIDI'),h,el('p','edition-author','Por '+item.author),el('p','edition-duration',item.duration?'Duración publicada: '+item.duration:'ID '+item.id));
        card.append(link('Abrir original ↗',item.url));
        const play=el('button','edition-play',file?'▶ Reproducir chiptune':'Cargar MIDI y escuchar');play.type='button';play.disabled=busy;
        play.onclick=()=>{if(file)playItem(item,file);else{selectedId=item.id;fileInput.value='';fileInput.click();}};card.append(play);
        if(file){
          const detail=el('p','edition-file',file.name+' · solo esta sesión');card.append(detail);
          const unlink=el('button','edition-minor','Quitar MIDI');unlink.type='button';unlink.disabled=busy;unlink.onclick=()=>{usedBytes-=file.size;midiFiles.delete(item.id);render();};card.append(unlink);
        }
        if(saved.some(x=>x.id===item.id)){
          const remove=el('button','edition-minor','Quitar enlace guardado');remove.type='button';remove.disabled=busy;
          remove.onclick=()=>{saved=saved.filter(x=>x.id!==item.id);L.save(storage,saved);if(file){usedBytes-=file.size;midiFiles.delete(item.id);}render();};card.append(remove);
        }
        rail.append(card);
      }
    }
    fileInput.onchange=async()=>{
      const file=fileInput.files[0],item=all().find(x=>x.id===selectedId);fileInput.value='';if(!file||!item)return;
      try{
        if(!/\.(mid|midi)$/i.test(file.name)||file.size>16*1024*1024)throw new Error('Selecciona un MIDI de hasta 16 MiB.');
        const old=midiFiles.get(item.id);if(usedBytes-(old?.size||0)+file.size>MAX_BYTES)throw new Error('La biblioteca temporal supera 32 MiB. Quita otro MIDI antes de añadir este.');
        const parsed=window.JSSCCMidi.parseMidi(await file.arrayBuffer(),file.name);
        if(!parsed.events.some(x=>x.type==='on'))throw new Error('El MIDI no contiene notas.');
        usedBytes=usedBytes-(old?.size||0)+file.size;midiFiles.set(item.id,file);await playItem(item,file);
      }catch(e){tell(e.message,true);}
    };
    form.onsubmit=e=>{
      e.preventDefault();try{
        const item=L.record({id:L.sequenceId(urlInput.value)});
        if(all().some(x=>x.id===item.id)){search.value=String(item.id);render();tell('Ese enlace ya está en la biblioteca.');return;}
        if(saved.length>=L.MAX_LINKS)throw new Error('Máximo 40 enlaces guardados. Quita uno antes de añadir otro.');
        saved.unshift(item);const persisted=L.save(storage,saved);urlInput.value='';search.value='';render();
        tell(persisted?'Enlace guardado. Su título y autor no se consultan automáticamente.':'Enlace añadido solo para esta sesión; el navegador bloqueó el almacenamiento.');
      }catch(e){tell(e.message,true);}
    };
    search.oninput=render;thumb.onchange=()=>{thumbnails=thumb.checked;render();};
    async function loadSelection(){
      if(loading)return loading;
      loading=(async()=>{
        try{const r=await fetch('./assets/sequencer-links.json',{credentials:'omit',cache:'no-cache'});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();if(j.kind!=='selected-links'||j.live!==false||!Array.isArray(j.items))throw new Error('Catálogo inválido');selection=j.items.slice(0,20).map(L.record);render();}
        catch(_){tell('No se pudo cargar la selección de enlaces. Puedes añadir un ID o abrir el catálogo oficial.',true);render();}
      })();return loading;
    }
    open.onclick=()=>{syncPalette();drawer.showModal();loadSelection();search.focus();};
    drawer.addEventListener('close',()=>open.focus());
    let lastPalette=null,repoHooked=false;
    function syncPalette(){
      const r=window.ui?.renderer;
      if(!repoHooked&&r?.loadEvents===0&&r?.hitDetector?.regions?.githubLink){
        r.hitDetector.regions.githubLink.onmousedown=[()=>window.location.assign(E.repository)];
        const groups=r.loader.drawGroups;
        groups.sparkles=[['image','sparkles',424,4],['text','medium','PCM Edition - '+E.maintainer+' ('+E.year+')',453,4,'&dark'],['text','medium','PCM Edition - '+E.maintainer+' ('+E.year+')',452,3,'&white'],['text','medium','(C) 2017 meme.institute + Milkey Mouse',452,14,'&dark'],['bounds',424,3,201,20]];
        for(const d of groups.logo)if(d[0]==='text'){d[2]='PCM v'+E.version;d[3]=22;}
        for(const d of groups.githubLink)if(d[0]==='text')d[2]='PCM Edition source: github.com/GrappePie/JSSCC';
        repoHooked=true;r.redraw();
      }
      const p=r?.palette;if(!p||lastPalette===p)return;lastPalette=p;
      for(const key of ['background','foreground','dark','light','white'])document.documentElement.style.setProperty('--edition-'+key,p[key]);
    }
    // Only small metadata checks; no second audio/animation loop.
    setInterval(()=>{syncPalette();if(creditSeq&&creditSeq!==window.JSSCCMidi?.current){source.hidden=true;creditSeq=null;window.dispatchEvent(new Event('resize'));}},250);
    syncPalette();window.dispatchEvent(new Event('resize'));
    window.JSSCCEditionUI={openLibrary:()=>open.click(),diagnostics:()=>({version:E.version,brandingReady:repoHooked,liveCatalog:false,officialPartnership:false,links:all().length,associatedFiles:midiFiles.size,associatedBytes:usedBytes,remoteThumbnails:thumbnails})};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
