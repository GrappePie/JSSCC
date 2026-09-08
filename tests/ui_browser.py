"""UI integration against the actual HTTP site and live AudioWorklet. No fake voices.
Screenshots/pixel reads verify that POLY and BUFFER are really painted, not merely
stored in a JavaScript object. Optional --embedded is for local visual testing only.
"""
from pathlib import Path
import functools,http.server,threading,sys,shutil,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'test-results';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();results=[]
def check(name,value,details=None):
 results.append({'test':name,'pass':bool(value),'details':details});(OUT/'ui-tests.json').write_text(json.dumps(results,indent=2))
 if not value:raise AssertionError(name+': '+str(details))
def vlq(v):
 a=[v&127];v>>=7
 while v:a.insert(0,128|(v&127));v>>=7
 return a
track=[0,255,81,3,7,161,32,0,192,40,0,144,60,100,0,144,64,90,0,144,67,80,*vlq(240),176,0,8,*vlq(1920),128,60,0,0,128,64,0,0,128,67,0,*vlq(480),255,47,0]
midi=b'MThd'+(6).to_bytes(4,'big')+bytes([0,0,0,1,1,224])+b'MTrk'+len(track).to_bytes(4,'big')+bytes(track)
with sync_playwright()as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1120});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
  page.wait_for_function('window.JSSCCMidi && ui.renderer.initialized && ui.renderer.loadEvents===0')
  page.wait_for_function('JSSCCMidi.diagnostics().ui.frames>1')
  page.screenshot(path=str(OUT/'ui-idle.png'),full_page=True)
  check('idle buffer and all unused channels are dark',page.evaluate('ui.song.buffer===0 && ui.song.channels.every(c=>c.poly===0 && c.output===0)'))
  page.set_input_files('#jsscc-file',{'name':'ui-three-voice-probe.mid','mimeType':'audio/midi','buffer':midi})
  page.click('#jsscc-play');page.wait_for_function('ui.song.channels[0].poly===3 && ui.song.buffer>.9 && ui.song.channels[0].envelope>.2',timeout=12000)
  check('three real voices drive POLY and envelope',True,page.evaluate('({poly:ui.song.channels[0].poly,envelope:ui.song.channels[0].envelope,health:JSSCCMidi.diagnostics().ui.buffer})'))
  pixels=page.evaluate('''()=>{const r=ui.renderer,p=(x,y)=>Array.from(r.ctx.getImageData(x,y,1,1).data).slice(0,3),rgb=s=>{const c=document.createElement('canvas').getContext('2d');c.fillStyle=s;c.fillRect(0,0,1,1);return Array.from(c.getImageData(0,0,1,1).data).slice(0,3)};return{poly:p(81,56),idle:p(189,56),buffer:p(450,36),light:rgb(r.palette.light),white:rgb(r.palette.white),dark:rgb(r.palette.foreground)}}''')
  check('three-voice POLY rectangle uses original orange on the actual canvas',pixels['poly']==[255,108,0],pixels)
  check('unused channel POLY rectangle stays dark',pixels['idle']==pixels['dark'],pixels)
  check('buffer fill is visible and is not erased by a second background rectangle',pixels['buffer']==pixels['light'],pixels)
  page.wait_for_function('ui.song.channels[0].cc0===8')
  check('program number, bank, BPM, timing division and clock update',page.evaluate("ui.song.channels[0].percussion===41 && ui.song.bpm===120 && ui.song.ppq===480 && ui.song.timeText!==\"00 : 00 : 00 '000\""),page.evaluate('({pc:ui.song.channels[0].percussion,cc0:ui.song.channels[0].cc0,bpm:ui.song.bpm,ppq:ui.song.ppq,time:ui.song.timeText})'))
  before=page.evaluate('JSSCCMidi.diagnostics().ui');page.wait_for_timeout(350);after=page.evaluate('JSSCCMidi.diagnostics().ui')
  check('rAF continues drawing without a full-panel redraw every frame',after['frames']-before['frames']>=5 and after['fullRedraws']==before['fullRedraws'],{'before':before,'after':after})
  page.screenshot(path=str(OUT/'ui-playing.png'),full_page=True)
  page.click('#jsscc-pause');page.wait_for_function("JSSCCMidi.diagnostics().ui.buffer.status==='paused'")
  paused=page.evaluate('({time:ui.song.timeText,env:ui.song.channels[0].envelope,output:ui.song.channels[0].output,poly:ui.song.channels[0].poly,buffer:ui.song.buffer})');page.wait_for_timeout(200)
  check('pause freezes time/meters and is not falsely reported as underrun',paused==page.evaluate('({time:ui.song.timeText,env:ui.song.channels[0].envelope,output:ui.song.channels[0].output,poly:ui.song.channels[0].poly,buffer:ui.song.buffer})') and paused['buffer']==0,paused)
  page.click('#jsscc-play');page.wait_for_function("JSSCCMidi.diagnostics().ui.buffer.status==='active'")
  page.evaluate('ui.song.channels[0].mute=true');page.wait_for_timeout(300)
  px=page.evaluate('Array.from(ui.renderer.ctx.getImageData(81,56,1,1).data).slice(0,3)')
  check('mute darkens the lamp but retains actual allocated voice count',px==pixels['dark'] and page.evaluate('ui.song.channels[0].poly')==3)
  page.evaluate('ui.song.channels[0].mute=false');page.wait_for_timeout(100)
  page.evaluate('ui.switchPalette("gameboy")');page.wait_for_timeout(150)
  check('palette switch preserves live indicators',page.evaluate('ui.renderer.paletteName==="gameboy" && ui.song.channels[0].poly===3'))
  page.click('#jsscc-stop');page.wait_for_function('ui.song.buffer===0 && ui.song.channels.every(c=>c.poly===0&&c.polyDisplay===0&&c.output===0&&c.freq===0)')
  check('Stop clears lamps, output, frequency and flow status',True)
  check('buffer measurement meaning is visible, not an invented Windows queue',page.locator('#jsscc-buffer-help').inner_text().find('no es la cola de Windows')>=0)
  # A completely new tune must reset displayed program/bank/control history.
  page.set_input_files('#jsscc-file',{'name':'fresh-ui-probe.mid','mimeType':'audio/midi','buffer':midi});page.wait_for_timeout(100)
  check('file replacement starts with clean metering',page.evaluate('ui.song.channels[0].cc0===0 && ui.song.channels[0].poly===0 && ui.song.buffer===0'))
  # All native levels, including the six-plus cap, using actual simultaneous voices.
  colors_track=[0,255,81,3,7,161,32]
  for channel in range(1,8):
   colors_track.extend([0,192+channel,16])
   for note in range(channel):colors_track.extend([0,144+channel,60+note,70+channel*5])
  colors_track.extend([*vlq(9600),255,47,0])
  color_midi=b'MThd'+(6).to_bytes(4,'big')+bytes([0,0,0,1,1,224])+b'MTrk'+len(colors_track).to_bytes(4,'big')+bytes(colors_track)
  page.evaluate('ui.switchPalette("default")');page.wait_for_function('ui.renderer.paletteName==="default"')
  page.set_input_files('#jsscc-file',{'name':'poly-color-counts.mid','mimeType':'audio/midi','buffer':color_midi})
  page.wait_for_function('ui.song.fileName==="poly-color-counts.mid"')
  page.click('#jsscc-play')
  page.wait_for_function('ui.song.channels.slice(0,8).every((c,i)=>c.poly===i)',timeout=12000)
  page.wait_for_timeout(100)
  expected=[[92,31,9],[181,0,0],[239,47,0],[255,108,0],[255,159,0],[255,204,0],[255,255,60],[255,255,60]]
  color_pixels=page.evaluate('Array.from({length:8},(_,i)=>Array.from(ui.renderer.ctx.getImageData(81+i*36,56,1,1).data).slice(0,3))')
  for count in range(8):
   check('original POLY RGB for '+str(count)+' actual voices',color_pixels[count]==expected[count],{'voices':count,'actual':color_pixels[count],'expected':expected[count]})
  page.screenshot(path=str(OUT/'poly-colors-playing.png'),full_page=True)
  page.evaluate('ui.switchPalette("gameboy")');page.wait_for_function('ui.renderer.paletteName==="gameboy"');page.wait_for_timeout(100)
  changed_pixels=page.evaluate('Array.from({length:7},(_,i)=>Array.from(ui.renderer.ctx.getImageData(117+i*36,56,1,1).data).slice(0,3))')
  check('active POLY color coding survives a real palette switch',changed_pixels==expected[1:],changed_pixels)
  page.click('#jsscc-stop');page.wait_for_function('ui.song.channels.every(c=>c.poly===0&&c.polyDisplay===0)')
  check('no browser exceptions',not errors,errors)
 except Exception:
  (OUT/'ui-failure.json').write_text(json.dumps({'errors':errors,'diagnostics':page.evaluate('window.JSSCCMidi?JSSCCMidi.diagnostics():null')},indent=2));page.screenshot(path=str(OUT/'ui-failure.png'),full_page=True);raise
 finally:b.close();server.shutdown()
print(json.dumps({'passed':len(results),'results':results},indent=2))
