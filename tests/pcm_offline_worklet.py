"""Real OfflineAudioContext + exact PCM AudioWorklet module. Bounded, no audio mocks."""
from pathlib import Path
import json,functools,http.server,threading
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'startup-evidence';OUT.mkdir(exist_ok=True)
(OUT/'index.html').write_text('<!doctype html><title>PCM offline Worklet check</title>')
s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=s.serve_forever,daemon=True).start()
with sync_playwright()as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox']);page=b.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:print(m.type,m.text,flush=True))
 page.goto(f'http://127.0.0.1:{s.server_port}/startup-evidence/index.html')
 for name in ['gxscc-exact-data.js','pcm-core.js']:page.add_script_tag(content=(ROOT/'js'/name).read_text())
 code=(ROOT/'js/pcm-core.js').read_text()+'\n'+(ROOT/'js/pcm-worklet.js').read_text().removeprefix("import './pcm-core.js';\n")
 result=page.evaluate('''async code=>{
  const c=new OfflineAudioContext(2,22050,44100);
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  const loaded=await Promise.race([c.audioWorklet.addModule(url).then(()=>true,e=>String(e)),new Promise(r=>setTimeout(()=>r('timeout'),8000))]);
  if(loaded!==true)return {loaded};
  const midi={duration:.5,events:[{type:'program',channel:0,value:40,time:0},{type:'on',channel:0,note:60,velocity:100,time:0},{type:'off',channel:0,note:60,time:.3}]};
  const node=new AudioWorkletNode(c,'jsscc-b236-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{data:GXSCC_EXACT_DATA,midi,autoplay:true}});
  const g=c.createGain();g.gain.value=.25;node.connect(g).connect(c.destination);
  const rendering=await Promise.race([c.startRendering(),new Promise(r=>setTimeout(()=>r(null),8000))]);
  if(!rendering)return {loaded,renderTimeout:true};
  const reference=new JSSCCPCM.Engine(GXSCC_EXACT_DATA).load(midi).render(22050);
  let maxError=0,peak=0;for(let ch=0;ch<2;ch++){const a=rendering.getChannelData(ch),z=ch?reference.right:reference.left;for(let i=0;i<a.length;i++){maxError=Math.max(maxError,Math.abs(a[i]-z[i]));peak=Math.max(peak,Math.abs(a[i]));}}
  node.port.close();node.disconnect();URL.revokeObjectURL(url);return {loaded,maxError,peak};
 }''',code)
 result['errors']=errors;(OUT/'pcm-offline.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True);b.close()
s.shutdown()
if result.get('maxError')!=0 or not result.get('peak',0)>0 or errors:raise SystemExit(1)
