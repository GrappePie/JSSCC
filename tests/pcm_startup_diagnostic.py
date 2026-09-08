"""Observe module readiness and HTTP responses on the real browser, without replacing audio."""
import json,functools,http.server,threading,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'startup-evidence';OUT.mkdir(exist_ok=True)
s=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=s.serve_forever,daemon=True).start();log=[]
with sync_playwright()as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox']);page=b.new_page()
 page.on('console',lambda m:log.append({'console':m.type,'text':m.text}))
 page.on('pageerror',lambda e:log.append({'pageerror':str(e)}))
 page.on('requestfailed',lambda r:log.append({'failed':r.url,'reason':r.failure}))
 page.on('response',lambda r:log.append({'url':r.url,'status':r.status}))
 page.add_init_script('''window.moduleTrace=[];const original=AudioWorklet.prototype.addModule;AudioWorklet.prototype.addModule=function(url,...args){moduleTrace.push({url,phase:'called'});return original.call(this,url,...args).then(v=>{moduleTrace.push({url,phase:'resolved'});return v},e=>{moduleTrace.push({url,phase:'rejected',error:String(e)});throw e})};''')
 page.goto(f'http://127.0.0.1:{s.server_port}/index.html');page.wait_for_function('window.JSSCCMidi')
 track=[0,255,81,3,7,161,32,0,192,16,0,144,60,100,0x9e,0,128,60,0,0,255,47,0]
 midi=bytes([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,0,0,0,len(track)]+track)
 page.set_input_files('#jsscc-file',{'name':'diagnostic.mid','mimeType':'audio/midi','buffer':midi});page.wait_for_function('JSSCCMidi.current')
 page.click('#jsscc-play')
 for i in range(5):
  page.wait_for_timeout(1000);log.append({'at':i+1,'state':page.evaluate('JSSCCMidi.diagnostics()'),'modules':page.evaluate('moduleTrace')})
 # The running application stays unmodified. This separate context tests explicit module ordering.
 page.evaluate('''window.separate=[];window.testContext=new AudioContext({sampleRate:44100});testContext.audioWorklet.addModule('./js/pcm-core.js').then(()=>{separate.push('core ready');return testContext.audioWorklet.addModule('./js/pcm-worklet.js?v=separate')}).then(()=>{separate.push('processor ready');}).catch(e=>separate.push(String(e)));''')
 page.wait_for_timeout(5000);log.append({'separate':page.evaluate('separate'),'modules':page.evaluate('moduleTrace'),'resources':page.evaluate('performance.getEntriesByType("resource").map(x=>({name:x.name,duration:x.duration}))')})
 (OUT/'startup.json').write_text(json.dumps(log,indent=2));page.screenshot(path=str(OUT/'startup.png'));b.close()
s.shutdown()
print(json.dumps(log,indent=2))
