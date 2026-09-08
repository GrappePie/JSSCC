"""Bounded module-isolation experiment. Real Chromium; no synthesis replacements."""
import functools, http.server, json, threading, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'isolation-evidence'; OUT.mkdir(exist_ok=True)
(OUT/'index.html').write_text('<!doctype html><button id="start">Start</button>')
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
core=(ROOT/'js/pcm-core.js').read_text()
processor=(ROOT/'js/pcm-worklet.js').read_text().removeprefix("import './pcm-core.js';\n")
tiny="class Tiny extends AudioWorkletProcessor {process(i,o){o[0][0].fill(.01);return true;}}registerProcessor('tiny',Tiny);"
cases=[('tiny',tiny),('core-only',core+'\n'+tiny),('processor-only',processor),('full',core+'\n'+processor)]
results=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
  for kind in ['offline','realtime']:
   for label,code in cases:
    page=browser.new_page(); logs=[]; errors=[]
    page.on('console',lambda m:logs.append({'type':m.type,'text':m.text}))
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/isolation-evidence/index.html')
    result=page.evaluate('''async ({kind,code})=>{
      const c=kind==='offline'?new OfflineAudioContext(2,128,44100):new AudioContext({sampleRate:44100,sinkId:{type:'none'}});
      window.testContext=c;
      const t=performance.now();
      const blob=URL.createObjectURL(new Blob(["console.log('module-start');\\n",code,"\\nconsole.log('module-end');"],{type:'text/javascript'}));
      if(kind==='realtime')await Promise.race([c.resume(),new Promise(r=>setTimeout(r,1000))]);
      const loaded=await Promise.race([c.audioWorklet.addModule(blob).then(()=>({ok:true}),e=>({error:String(e)})),new Promise(r=>setTimeout(()=>r({timeout:true}),3000))]);
      URL.revokeObjectURL(blob);
      return {...loaded,elapsed:performance.now()-t,state:c.state};
    }''',{'kind':kind,'code':code})
    results.append({'kind':kind,'label':label,'result':result,'logs':logs,'errors':errors});print(json.dumps(results[-1]),flush=True)
    (OUT/'results.json').write_text(json.dumps(results,indent=2))
    page.close()
  browser.close()
finally:
 server.shutdown()
