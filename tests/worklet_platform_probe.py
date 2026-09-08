"""Minimal real Worklet probes. No audio mocks; all waits are bounded."""
import functools,http.server,threading,json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'startup-evidence';OUT.mkdir(exist_ok=True)
code="class Tiny extends AudioWorkletProcessor{process(i,o){o[0][0].fill(.01);return true}}registerProcessor('tiny',Tiny);"
(OUT/'tiny.js').write_text(code);(OUT/'index.html').write_text('<!doctype html><button id="start">Start</button>')
s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=s.serve_forever,daemon=True).start();rows=[]
def save(x):rows.append(x);(OUT/'platform.json').write_text(json.dumps(rows,indent=2));print(json.dumps(x),flush=True)
with sync_playwright()as p:
 for channel in [None,'chrome']:
  try:
   browser=p.chromium.launch(channel=channel,headless=True,args=['--no-sandbox'])
   page=browser.new_page();page.on('console',lambda m:save({'console':m.type,'text':m.text}));page.on('pageerror',lambda e:save({'error':str(e)}))
   page.goto(f'http://127.0.0.1:{s.server_port}/startup-evidence/index.html');page.click('#start')
   for kind in ['offline-url','realtime-url','realtime-warm-url','offline-blob','realtime-warm-blob']:
    result=page.evaluate('''async({kind,code})=>{
      const ctx=kind.startsWith('offline')?new OfflineAudioContext(1,4410,44100):new AudioContext({sampleRate:44100});
      const observed=[];const bounded=p=>Promise.race([p.then(()=>({resolved:true})).catch(e=>({error:String(e)})),new Promise(r=>setTimeout(()=>r({timeout:true}),2500))]);
      let source=null;
      if(kind.includes('warm')){source=ctx.createConstantSource();source.offset.value=0;source.connect(ctx.destination);source.start();observed.push(await bounded(ctx.resume()));}
      const url=kind.includes('blob')?URL.createObjectURL(new Blob([code],{type:'text/javascript'})):'./tiny.js';
      const result=await bounded(ctx.audioWorklet.addModule(url));
      if(result.resolved){const n=new AudioWorkletNode(ctx,'tiny');n.connect(ctx.destination);if(kind.startsWith('offline')){const b=await ctx.startRendering();result.sample=b.getChannelData(0)[100];}n.disconnect();n.port.close();}
      if(source){source.stop();source.disconnect();}
      if(ctx.close)await bounded(ctx.close());if(kind.includes('blob'))URL.revokeObjectURL(url);
      return{kind,state:ctx.state,observed,result};
    }''',{'kind':kind,'code':code});save({'channel':channel,**result})
   browser.close()
  except Exception as error:save({'channel':channel,'exception':str(error)})
s.shutdown()
