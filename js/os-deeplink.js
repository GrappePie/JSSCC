/* Deep-link entry point used by the optional Online Sequencer browser extension. */
(function(root){
  'use strict';
  const params=new URLSearchParams(root.location.search);
  const raw=params.get('os');
  if(!/^[1-9]\d{0,8}$/.test(raw||'')||params.get('autoplay')!=='1')return;
  const id=raw;
  const safeTitle=String(params.get('title')||('Online Sequencer #'+id)).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,160)||('Online Sequencer #'+id);
  const item={id,title:safeTitle,author:'Online Sequencer',url:'https://onlinesequencer.net/'+id};
  let prepared=false,busy=false,report=null;

  const waitForPlayer=()=>new Promise((resolve,reject)=>{
    const deadline=Date.now()+10000;
    const tick=()=>{
      if(root.JSSCCSequenceRemote&&root.JSSCCMidi)return resolve();
      if(Date.now()>deadline)return reject(new Error('JSSCC tardó demasiado en iniciar'));
      setTimeout(tick,80);
    };tick();
  });
  const statusNode=()=>document.getElementById('jsscc-sequence-source')||document.querySelector('.jsscc-controls');
  function show(message,bad=false,button=false){
    const host=statusNode();if(!host)return;
    host.hidden=false;
    host.replaceChildren();
    const text=document.createElement('span');text.textContent=message;text.dataset.error=String(bad);host.append(text);
    if(button){
      const b=document.createElement('button');b.type='button';b.className='edition-deeplink-play';b.textContent='▶ Reproducir chiptune';
      b.onclick=()=>resumeFromGesture(b);host.append(document.createTextNode(' '),b);
    }
    root.dispatchEvent(new Event('resize'));
  }
  async function resumeFromGesture(button){
    if(busy)return;busy=true;button.disabled=true;button.textContent='Iniciando…';
    try{
      const player=root.JSSCCMidi;await player.unlockAudio();
      const played=await player.play({owner:'os-deeplink'});
      if(!played)throw new Error('El navegador todavía bloqueó el audio');
      show('Reproduciendo '+safeTitle+(report?' · '+report.noteCount+' notas':''));
    }catch(error){show(error.message||'No se pudo iniciar el audio.',true,true);}
    finally{busy=false;}
  }
  async function prepare(){
    if(busy||prepared)return;busy=true;
    try{
      await waitForPlayer();
      const remote=new root.JSSCCSequenceRemote.Importer();
      show('Obteniendo '+safeTitle+' desde Online Sequencer…');
      const result=await remote.get(item,{onProgress:(stage,bytes)=>show(stage==='convert'?'Convirtiendo a chiptune…':'Obteniendo secuencia… '+Math.ceil((bytes||0)/1024)+' KiB')});
      const name=safeTitle.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)+'-os'+id+'.mid';
      const file=new File([result.bytes],name,{type:'audio/midi'});
      const player=root.JSSCCMidi;
      if(!await player.loadFile(file,{owner:'os-deeplink'}))throw new Error('No se pudo cargar la secuencia convertida');
      prepared=true;report=result.report;
      show('Secuencia lista · intentando iniciar el audio…');
      try{await player.unlockAudio();}catch(_){}
      const played=await player.play({owner:'os-deeplink'});
      if(played){
        show('Reproduciendo '+safeTitle+' · '+result.report.noteCount+' notas');
      }else{
        show('Secuencia lista. Tu navegador requiere un clic para habilitar el audio.',false,true);
      }
      try{
        const clean=new URL(root.location.href);clean.searchParams.delete('autoplay');root.history.replaceState(null,'',clean.href);
      }catch(_){}
    }catch(error){show(error.message||'No se pudo preparar la secuencia.',true,true);}
    finally{busy=false;}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(prepare,0),{once:true});else setTimeout(prepare,0);
})(window);
