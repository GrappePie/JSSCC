"""Force the real asset-before-window.load order. No canvas/audio mocks.
An additional test-only image is held pending; all production scripts/assets are real.
"""
from pathlib import Path
import base64,functools,http.server,threading,sys,shutil,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'test-results'
OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
results=[]
def check(name,value,detail=None):
 results.append({'test':name,'pass':bool(value),'details':detail})
 (OUT/'startup-browser-tests.json').write_text(json.dumps(results,indent=2))
 if not value:raise AssertionError(name+': '+str(detail))
html=(ROOT/'index.html').read_text().replace('<body>','<body><img src="/tests/__startup_hold__.png" alt="" hidden>')
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1060});errors=[];pending=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/index.html',lambda route:route.fulfill(status=200,content_type='text/html',body=html))
 page.route('**/__startup_hold__.png',lambda route:pending.append(route))
 try:
  for i in range(3):
   page.goto(f'http://127.0.0.1:{server.server_port}/index.html',wait_until='domcontentloaded',timeout=12000)
   page.wait_for_function('window.ui?.renderer?.loader?.unloadedAssets===0 && ui.renderer.loader.unloadedManifests===0 && window.ui?.configRenderer?.loader?.unloadedAssets===0 && ui.configRenderer.loader.unloadedManifests===0',timeout=12000)
   state=page.evaluate('''() => ({ready:document.readyState,mainEvents:ui.renderer.loadEvents,configEvents:ui.configRenderer.loadEvents,main:!!ui.renderer.hitDetector?.regions.play,config:!!ui.configRenderer.hitDetector?.regions.close})''')
   check('assets-first initialization '+str(i+1),state['ready']=='interactive' and state['mainEvents']==1 and state['configEvents']==1 and state['main'] and state['config'],state)
   check('no early asset callback errors '+str(i+1),not errors,list(errors))
   assert pending,'Expected a pending resource holding window.load'
   for route in pending:route.fulfill(status=200,content_type='image/png',body=png)
   pending.clear()
   page.wait_for_function('document.readyState==="complete" && ui.renderer.loadEvents===0 && ui.configRenderer.loadEvents===0 && window.JSSCCEditionUI?.diagnostics().brandingReady',timeout=12000)
   check('first paint and edition ready '+str(i+1),page.locator('#jsscc-sequencer').count()==1 and not errors,list(errors))
  page.click('#jsscc-sequencer');page.wait_for_function('document.querySelectorAll(".edition-card").length===6')
  # Capture the final dialog state, not its transient opening opacity.
  page.wait_for_function('document.querySelector("#jsscc-sequencer-dialog").getAnimations().every(a=>a.playState==="finished")')
  check('reference library after repeated ordered starts',page.locator('.edition-card').count()==6)
  page.screenshot(path=str(OUT/'edition-library-stable.png'),full_page=True)
  check('no browser exceptions in forced race',not errors,list(errors))
 finally:
  b.close();server.shutdown()
print(json.dumps({'passed':sum(x['pass'] for x in results),'results':results},indent=2))
