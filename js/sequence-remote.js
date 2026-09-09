/* On-click public-sequence retrieval. No file dialog, audio download, open proxy,
 * automatic retries, persistent song storage, or arbitrary remote code loading.
 */
(function(root){
  'use strict';
  const ENDPOINT='https://jsscc-sequence-bridge.lovable.app/api/public/sequence-bridge';
  const MAX_BYTES=4*1024*1024,CACHE_BYTES=32*1024*1024,TTL=300000;
  const base=typeof document!=='undefined' && document.currentScript ? document.currentScript.src : null;
  function idOf(id){if(!/^[1-9][0-9]{0,8}$/.test(String(id)))throw Error('ID de secuencia inválido');return String(id);}
  function abortError(){return new DOMException('Carga cancelada','AbortError');}
  function assertActive(signal){if(signal?.aborted)throw abortError();}
  function workerConvert(bytes,metadata,signal){
    assertActive(signal);
    return new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./sequence-import-worker.js?v=os-midi-3',base || document.baseURI));
      const finish=(error,result)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(result);};
      const abort=()=>finish(abortError());
      const timer=setTimeout(()=>finish(Error('La conversión excedió 15 segundos')),15000);
      signal?.addEventListener('abort',abort,{once:true});
      worker.onmessage=({data})=>data.ok?finish(null,{bytes:new Uint8Array(data.bytes),report:data.report}):finish(Error(data.error));
      worker.onerror=e=>{e.preventDefault();finish(Error('No se pudo iniciar el conversor de secuencias'));};
      worker.postMessage({bytes:bytes.buffer,id:metadata.id,title:metadata.title},[bytes.buffer]);
    });
  }
  class Importer {
    constructor({fetcher=root.fetch?.bind(root),convert=workerConvert,now=Date.now}={}){
      this.fetcher=fetcher;this.convert=convert;this.now=now;this.cache=new Map();this.bytes=0;
      this.stats={requests:0,cacheHits:0,converted:0};
    }
    evict(){for(const [id,item] of this.cache)if(item.expires<=this.now()){this.bytes-=item.bytes.length;this.cache.delete(id);}}
    async get(item,{signal,onProgress=()=>{}}={}){
      const id=idOf(item.id);assertActive(signal);this.evict();
      const cached=this.cache.get(id);
      if(cached){this.stats.cacheHits++;onProgress('cache',cached.bytes.length);return {bytes:cached.bytes.slice(),report:{...cached.report},cached:true};}
      const controller=new AbortController();let timedOut=false;
      const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>{timedOut=true;controller.abort();},22000);
      try {
        assertActive(signal);onProgress('fetch',0);this.stats.requests++;
        const response=await this.fetcher(ENDPOINT+'?id='+id,{signal:controller.signal,mode:'cors',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
        if(!response.ok){
          const detail=({400:'ID de secuencia inválido',403:'Acceso no permitido',429:'Demasiadas solicitudes; espera un minuto',502:'Online Sequencer no entregó una secuencia disponible',503:'Servicio ocupado; vuelve a intentarlo después',504:'Online Sequencer tardó demasiado'})[response.status] || 'No se pudo obtener la secuencia';
          throw Error(detail+' (HTTP '+response.status+')');
        }
        if(!/^application\/octet-stream(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('El servicio no devolvió datos de secuencia');
        if(response.headers.get('x-sequence-id')!==id)throw Error('El servicio respondió con otro ID de secuencia');
        if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('La secuencia supera 4 MiB');
        const reader=response.body?.getReader();if(!reader)throw Error('La respuesta no contiene datos');
        const chunks=[];let length=0;
        try {
          while(true){
            assertActive(signal);const {value,done}=await reader.read();if(done)break;
            length+=value.length;if(length>MAX_BYTES)throw Error('La secuencia supera 4 MiB');
            chunks.push(value);onProgress('fetch',length);
          }
        }catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
        assertActive(signal);if(!length)throw Error('La secuencia está vacía');
        const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
        onProgress('convert',length);
        const result=await this.convert(bytes,{id:Number(id),title:item.title},controller.signal);
        assertActive(signal);if(controller.signal.aborted)throw abortError();
        if(!(result.bytes instanceof Uint8Array)||result.bytes.length>16*1024*1024)throw Error('Resultado de conversión inválido');
        this.stats.converted++;
        while(this.cache.size>=8 || this.bytes+result.bytes.length>CACHE_BYTES){const first=this.cache.keys().next();if(first.done)break;this.bytes-=this.cache.get(first.value).bytes.length;this.cache.delete(first.value);}
        this.cache.set(id,{bytes:result.bytes.slice(),report:result.report,expires:this.now()+TTL});this.bytes+=result.bytes.length;
        return {...result,cached:false};
      } catch(error){
        if(signal?.aborted)throw abortError();
        if(timedOut)throw Error('La carga tardó demasiado; no se reintentó automáticamente');
        if(error instanceof TypeError)throw Error('No se pudo conectar al servicio de secuencias. Revisa la conexión o intenta más tarde.');
        throw error;
      } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    }
    diagnostics(){this.evict();return {...this.stats,cachedSequences:this.cache.size,cachedBytes:this.bytes,endpoint:ENDPOINT};}
  }
  const api={ENDPOINT,MAX_BYTES,Importer,idOf};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.JSSCCSequenceRemote=api;
})(globalThis);
