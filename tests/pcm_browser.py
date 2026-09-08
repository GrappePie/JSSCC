"""Real browser tests for the PCM AudioWorklet and retained fallback. No mocked audio.
The optional --routed delivery mode only maps HTTPS test URLs to local files.
CI uses real HTTP, including AudioWorklet module imports.
"""
from pathlib import Path
import functools,http.server,threading,shutil,sys,json,base64,mimetypes
from urllib.parse import urlsplit,unquote
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'test-results';OUT.mkdir(exist_ok=True,parents=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
results=[]
def check(name,passed,details=None):
 results.append({'test':name,'pass':bool(passed),'details':details});(OUT/'pcm-browser-tests.json').write_text(json.dumps(results,indent=2))
 if not passed:raise AssertionError(name+': '+str(details))
with sync_playwright()as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1200,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 if '--routed' in sys.argv:
  def route(r):
   f=(ROOT/unquote(urlsplit(r.request.url).path).lstrip('/')).resolve()
   if not f.is_relative_to(ROOT)or not f.is_file():return r.fulfill(status=404,body='Not found')
   r.fulfill(status=200,body=f.read_bytes(),content_type=mimetypes.guess_type(str(f))[0]or'application/octet-stream')
  page.route('https://pcm.test/**',route);url='https://pcm.test/index.html'
 else:url=f'http://127.0.0.1:{server.server_port}/index.html'
 try:
  page.goto(url);page.wait_for_function('window.JSSCCMidi && window.ui && ui.renderer.initialized')
  check('PCM is the visible default engine',page.evaluate("JSSCCMidi.engine==='pcm' && document.querySelector('#jsscc-engine').value==='pcm'"))
  # Explicit120 BPM; held organ, controller and release, duration3 seconds.
  track=[0,255,81,3,7,161,32,0,192,16,0,144,60,100,0x87,0x40,176,11,100,0x8b,0x20,128,60,0,0x83,0x60,255,47,0]
  midi=bytes([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,0,0,0,len(track)]+track)
  page.set_input_files('#jsscc-file',{'name':'worklet-probe.mid','mimeType':'audio/midi','buffer':midi})
  page.wait_for_function('JSSCCMidi.current !== null')
  page.click('#jsscc-play');page.wait_for_function('JSSCCMidi.diagnostics().position>.15 && JSSCCMidi.diagnostics().activeVoices===1',timeout=10000)
  check('real AudioWorklet plays and reports active note',page.evaluate("JSSCCMidi.diagnostics().contextState==='running'"),page.evaluate('JSSCCMidi.diagnostics()'))
  page.click('#jsscc-pause');page.wait_for_function("JSSCCMidi.diagnostics().state==='paused'")
  paused=page.evaluate('JSSCCMidi.diagnostics()');page.wait_for_timeout(250)
  check('pause freezes AudioContext and preserves voice',page.evaluate('JSSCCMidi.diagnostics().position')==paused['position'] and page.evaluate('JSSCCMidi.diagnostics().activeVoices')==1)
  page.click('small');check('unrelated click does not unpause',page.evaluate("JSSCCMidi.diagnostics().contextState==='suspended'"))
  check('seek uses phase and random-state replay',page.evaluate('async()=>await JSSCCMidi.seek(.5)') and abs(page.evaluate('JSSCCMidi.diagnostics().position')-.5)<.0001)
  page.click('#jsscc-play');page.wait_for_function('JSSCCMidi.diagnostics().position>.65')
  check('resume advances from restored playhead',True)
  page.click('#jsscc-stop');page.wait_for_function("JSSCCMidi.diagnostics().state==='stopped'")
  check('stop resets PCM transport',page.evaluate('JSSCCMidi.diagnostics().position===0'))
  def canvas(name):
   at=page.evaluate("name=>{const r=ui.renderer.hitDetector.regions[name],b=ui.renderer.canvas.getBoundingClientRect();return{x:b.left+(r.x+r.w/2)*ui.renderer.scale,y:b.top+(r.y+r.h/2)*ui.renderer.scale}}",name);page.mouse.click(at['x'],at['y'])
  canvas('play');page.wait_for_function('JSSCCMidi.diagnostics().position>.1',timeout=5000);check('original canvas starts PCM worklet',True)
  canvas('pause');page.wait_for_function("JSSCCMidi.diagnostics().state==='paused'");check('original canvas pauses PCM',True)
  canvas('stop');page.wait_for_function("JSSCCMidi.diagnostics().state==='stopped'");check('original canvas stops PCM',True)
  with page.expect_download()as dl:page.click('#jsscc-export')
  dl.value.save_as(OUT/'pcm-export-web.wav');check('PCM export downloads actual RIFF',(OUT/'pcm-export-web.wav').read_bytes()[:4]==b'RIFF')
  page.evaluate("bytes=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],'worklet-dropped.mid'));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))}",list(midi))
  page.wait_for_function("JSSCCMidi.current.fileName==='worklet-dropped.mid'");check('drop loads new MIDI in PCM mode',True)
  page.evaluate("async()=>await JSSCCMidi.setEngine('legacy')");page.click('#jsscc-play');page.wait_for_function("JSSCCMidi.diagnostics().engine==='legacy'&&JSSCCMidi.diagnostics().position>.1");check('previous engine remains usable',True)
  page.evaluate("async()=>await JSSCCMidi.setEngine('pcm')");page.click('#jsscc-play');page.wait_for_function("JSSCCMidi.diagnostics().engine==='pcm'&&JSSCCMidi.diagnostics().position>.1");check('switching back reinitializes PCM without stale voices',True)
  page.evaluate('async()=>await JSSCCMidi.stop()')
  # Actual processor PCM compared with standalone kernel, including module graph.
  audio=page.evaluate('''async()=>{
   const events=[{type:'program',channel:0,value:40,time:0},{type:'on',channel:0,note:60,velocity:100,time:0},{type:'off',channel:0,note:60,time:.3}];
   const midi={duration:.5,events};const frames=22050;
   const c=new OfflineAudioContext(2,frames,44100);await JSSCCPCMBridge.prepare(c);
   const node=new AudioWorkletNode(c,'jsscc-b236-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{data:GXSCC_EXACT_DATA,midi,autoplay:true,options:{instrumentSet:0}}});
   const gain=c.createGain();gain.gain.value=.25;node.connect(gain).connect(c.destination);
   const b=await c.startRendering(),core=new JSSCCPCM.Engine(GXSCC_EXACT_DATA).load(midi),a=core.render(frames);
   let error=0,peak=0;for(let ch=0;ch<2;ch++){const x=b.getChannelData(ch),y=ch?a.right:a.left;for(let i=0;i<frames;i++){error=Math.max(error,Math.abs(x[i]-y[i]));peak=Math.max(peak,Math.abs(x[i]));}}
   const offline=await JSSCCPCMBridge.renderMidi(midi,GXSCC_EXACT_DATA,{tailSeconds:0});let exportError=0;for(let ch=0;ch<2;ch++){const x=offline.getChannelData(ch),y=b.getChannelData(ch);for(let i=0;i<frames;i++)exportError=Math.max(exportError,Math.abs(x[i]-y[i]));}
   node.port.close();node.disconnect();gain.disconnect();return{maximumWorkletKernelError:error,maximumExportWorkletError:exportError,peak,frames};
  }''')
  check('actual worklet output equals standalone kernel sample for sample',audio['maximumWorkletKernelError']==0,audio)
  check('export and actual worklet use the same PCM',audio['maximumExportWorkletError']==0,audio)
  check('worklet output is finite non-silent audio',.001<audio['peak']<1,audio)
  page.screenshot(path=str(OUT/'pcm-player-tested.png'),full_page=True)
  check('no browser exceptions',not errors,errors)
 except Exception:
  page.screenshot(path=str(OUT/'pcm-browser-failure.png'),full_page=True)
  (OUT/'pcm-browser-failure.json').write_text(json.dumps({'errors':errors,'diagnostics':page.evaluate('window.JSSCCMidi?JSSCCMidi.diagnostics():null'),'html':page.locator('#jsscc-status').text_content() if page.locator('#jsscc-status').count() else None},indent=2));raise
 finally:browser.close();server.shutdown()
print(json.dumps({'mode':'routed-local-assets' if '--routed'in sys.argv else 'http-site','passed':len(results),'results':results},indent=2))
