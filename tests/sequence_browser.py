"""One-click converter integration with deterministic protobuf fixtures.
Real HTTP player + Worker + native AudioWorklet. Remote body is explicitly a fixture.
An optional separate LIVE_SEQUENCE_SMOKE=1 path reads one real public sequence;
only metrics are saved, never the upstream notes or converted copyrighted MIDI.
"""
from pathlib import Path
import functools,http.server,threading,sys,shutil,json,subprocess,os,urllib.parse
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'test-results';OUT.mkdir(parents=True,exist_ok=True)
ENDPOINT='https://jsscc-sequence-bridge.lovable.app/api/public/sequence-bridge'
fixture=subprocess.check_output(['node',str(ROOT/'tests/sequence-fixtures.cjs')]);results=[]
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
def check(name,value,detail=None):
 results.append({'test':name,'pass':bool(value),'details':detail});(OUT/'sequence-browser-tests.json').write_text(json.dumps(results,indent=2))
 if not value:raise AssertionError(name+': '+str(detail))
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox','--autoplay-policy=user-gesture-required'])
 def newpage():
  page=b.new_page(viewport={'width':1440,'height':1060})
  page.add_init_script("const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(o={}){super({...o,sinkId:{type:'none'}})}};")
  return page
 page=newpage();errors=[];pickers=[];downloads=[];requests=[];deferred=[];mode={'value':'ok'}
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('filechooser',lambda e:pickers.append(True));page.on('download',lambda d:downloads.append(d.suggested_filename))
 def fixture_headers(route,sid):
  return {'Content-Type':'application/octet-stream','X-Sequence-Id':sid,'Access-Control-Allow-Origin':route.request.headers.get('origin',''),'Access-Control-Expose-Headers':'X-Sequence-Id'}
 def routehandler(route):
  requests.append(route.request.url);sid=urllib.parse.parse_qs(urllib.parse.urlsplit(route.request.url).query)['id'][0]
  if mode['value']=='defer':deferred.append((route,sid));return
  if mode['value']=='fail':route.fulfill(status=502,headers=fixture_headers(route,sid),body='{"error":"unavailable"}');return
  route.fulfill(status=200,headers=fixture_headers(route,sid),body=fixture)
 page.route(ENDPOINT+'*',routehandler)
 try:
  page.goto(f'http://127.0.0.1:{server.server_port}/index.html',timeout=15000)
  page.wait_for_function('window.JSSCCEditionUI?.diagnostics().brandingReady',timeout=15000)
  page.click('#jsscc-sequencer');page.wait_for_function('document.querySelectorAll(".edition-card").length===6')
  check('opening the library never fetches song data',len(requests)==0)
  page.locator('.edition-play').first.click()
  page.wait_for_function('JSSCCMidi.diagnostics().state==="playing" && JSSCCMidi.diagnostics().activeVoices>0',timeout=25000)
  check('a fresh user click converts in a Worker and autoplays PCM',page.evaluate('JSSCCMidi.engine==="pcm" && JSSCCEditionUI.diagnostics().lastConversion.noteCount===1'))
  check('primary action never opens a file chooser or a download',not pickers and not downloads,{'pickers':len(pickers),'downloads':downloads})
  check('converted note and instrument reach the existing parser',page.evaluate('JSSCCMidi.current.events.some(e=>e.type==="on"&&e.note===60)&&JSSCCMidi.current.events.some(e=>e.type==="program"&&e.value===0)'))
  check('conversion source remains visible and distinct from a local file','Convertida en memoria' in page.locator('#jsscc-sequence-source').inner_text())
  check('successful remote play closes the drawer',not page.locator('#jsscc-sequencer-dialog').is_visible())
  check('one click performs exactly one upstream request',len(requests)==1)
  page.click('#jsscc-pause');page.wait_for_function('JSSCCMidi.diagnostics().state==="paused"');page.click('#jsscc-sequencer')
  page.wait_for_timeout(100);check('opening the drawer leaves pause intact',page.evaluate('JSSCCMidi.diagnostics().state==="paused"'))
  page.locator('.edition-play').first.click();page.wait_for_function('JSSCCMidi.diagnostics().state==="playing"')
  check('a second play uses temporary RAM and needs no network',len(requests)==1 and page.evaluate('JSSCCEditionUI.diagnostics().remote.cacheHits===1'))
  page.click('#jsscc-stop');page.click('#jsscc-sequencer')
  old=page.evaluate('JSSCCMidi.current.fileName');mode['value']='fail';page.locator('.edition-play').nth(1).click()
  page.wait_for_function('document.querySelector("#edition-feedback").dataset.error==="true" && JSSCCEditionUI.diagnostics().remoteLoading===null')
  check('unavailable online sequence keeps the old MIDI without retry or picker',page.evaluate('JSSCCMidi.current.fileName')==old and len(requests)==2 and not pickers)
  mode['value']='defer';page.locator('.edition-play').nth(2).click();page.wait_for_function('JSSCCEditionUI.diagnostics().remoteLoading!==null')
  page.wait_for_timeout(100);page.click('#edition-cancel-load');page.wait_for_function('JSSCCEditionUI.diagnostics().remoteLoading===null')
  for route,sid in deferred:
   try:route.fulfill(status=200,headers=fixture_headers(route,sid),body=fixture)
   except Exception:pass
  deferred.clear();page.wait_for_timeout(150)
  check('late response after cancel cannot replace or autoplay a song',page.evaluate('JSSCCMidi.current.fileName')==old and page.evaluate('JSSCCMidi.diagnostics().state==="stopped"'))
  page.locator('.edition-play').nth(3).click();page.wait_for_timeout(100);page.keyboard.press('Escape');page.wait_for_timeout(100)
  for route,sid in deferred:
   try:route.fulfill(status=200,headers=fixture_headers(route,sid),body=fixture)
   except Exception:pass
  deferred.clear();check('closing the drawer cancels pending auto-play',page.evaluate('JSSCCEditionUI.diagnostics().remoteLoading===null && JSSCCMidi.diagnostics().state==="stopped"'))
  check('no sequence bytes are written to localStorage',page.evaluate('localStorage.length===0'))
  page.click('#jsscc-sequencer');page.wait_for_timeout(180);page.screenshot(path=str(OUT/'sequence-direct-play.png'),full_page=True)
  check('no browser exceptions in automatic import flow',not errors,errors)
 except Exception:
  (OUT/'sequence-fixture-failure.json').write_text(json.dumps({'errors':errors,'requests':requests,'pickers':pickers,'downloads':downloads,'feedback':page.locator('#edition-feedback').inner_text(),'player':page.evaluate('window.JSSCCMidi?.diagnostics()'),'library':page.evaluate('window.JSSCCEditionUI?.diagnostics()')},indent=2))
  page.screenshot(path=str(OUT/'sequence-fixture-failure.png'),full_page=True);raise
 finally:page.close()
 if os.environ.get('LIVE_SEQUENCE_SMOKE')=='1':
  live=newpage();liveErrors=[];livePickers=[];liveDownloads=[];statuses=[]
  live.on('pageerror',lambda e:liveErrors.append(str(e)));live.on('filechooser',lambda e:livePickers.append(True));live.on('download',lambda d:liveDownloads.append(d.suggested_filename))
  live.on('response',lambda r:statuses.append({'url':r.url,'status':r.status}) if r.url.startswith(ENDPOINT) else None)
  try:
   live.goto(f'http://127.0.0.1:{server.server_port}/index.html',timeout=15000);live.wait_for_function('window.JSSCCEditionUI?.diagnostics().brandingReady')
   live.click('#jsscc-sequencer');live.wait_for_function('document.querySelectorAll(".edition-card").length===6')
   live.fill('#edition-sequence-url','1536400');live.locator('.edition-add-form button').click()
   live.locator('.edition-card[data-sequence-id="1536400"] .edition-play').click()
   live.wait_for_function('JSSCCMidi.diagnostics().state==="playing" && JSSCCMidi.diagnostics().activeVoices>0',timeout=45000)
   state=live.evaluate('({player:JSSCCMidi.diagnostics(),conversion:JSSCCEditionUI.diagnostics().lastConversion,remote:JSSCCEditionUI.diagnostics().remote})')
   (OUT/'sequence-LIVE.json').write_text(json.dumps({'test':'UNMOCKED public backend -> actual OS protobuf -> Worker -> parser -> native PCM playback','state':state,'responses':statuses,'pickers':livePickers,'downloads':liveDownloads,'errors':liveErrors},indent=2))
   check('LIVE public sequence really autoplays without file picker',len(statuses)==1 and statuses[0]['status']==200 and not livePickers and not liveDownloads and not liveErrors,state)
   live.screenshot(path=str(OUT/'sequence-LIVE-playing.png'),full_page=True)
  except Exception:
   (OUT/'sequence-LIVE-failure.json').write_text(json.dumps({'responses':statuses,'errors':liveErrors,'feedback':live.locator('#edition-feedback').inner_text()},indent=2));raise
  finally:live.close()
 b.close();server.shutdown()
print(json.dumps({'passed':len(results),'results':results},indent=2))
