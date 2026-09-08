"""End-to-end Chromium checks of the real index, original canvas and audio modules.
Run: python tests/browser_regressions.py [output directory]
Requires Python playwright and a Chromium binary; no remote site or browser download.
"""
from pathlib import Path
import functools, http.server, threading, json, sys, base64, shutil, mimetypes, re
from urllib.parse import urlsplit, unquote
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'test-results'
OUT.mkdir(parents=True, exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=str(ROOT))
server = http.server.ThreadingHTTPServer(('127.0.0.1',0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
results=[]
def record(name, value, details=None):
    results.append({'test':name,'pass':bool(value),'details':details})
    (OUT/'browser-tests.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    if not value: raise AssertionError(f'{name}: {details}')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('chromium-browser'), headless=True, args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1100,'height':850})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    console=[]
    page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
    # An embedded mode serves exact repository assets from memory, for containers
    # whose Chromium policy disallows HTTP navigation. Audio and application code
    # are real; only asset delivery and the empty-cookie store are substituted.
    if '--embedded' in sys.argv:
        html=(ROOT/'index.html').read_text()
        styles=re.findall(r'<link rel="stylesheet" href="(.*?)">',html)
        scripts=re.findall(r'<script src="(.*?)"></script>',html)
        html=re.sub(r'<script.*?</script>','',html,flags=re.S)
        html=re.sub(r'<link[^>]*>','',html)
        page.set_content(html)
        for style in styles: page.add_style_tag(content=(ROOT/style.split('?')[0]).read_text())
        assets={}
        for f in (ROOT/'assets').rglob('*'):
            if f.is_file():
                assets[f.relative_to(ROOT).as_posix()] = (f.read_text() if f.suffix=='.json' else 'data:image/png;base64,'+base64.b64encode(f.read_bytes()).decode())
        page.evaluate("""assets=>{
          Object.defineProperty(document,'cookie',{value:'',writable:true,configurable:true});
          class LocalXHR extends EventTarget {
            open(method,path){this.path=path.replace(/^\.\//,'');}
            send(){setTimeout(()=>{this.responseText=assets[this.path];this.status=this.responseText?200:404;this.readyState=4;this.dispatchEvent(new Event('readystatechange'));},0);}
          }
          window.XMLHttpRequest=LocalXHR;
          const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
          Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(value){descriptor.set.call(this,assets[value]||value);}});
        }""",assets)
        for script in scripts: page.add_script_tag(content=(ROOT/script.split('?')[0]).read_text())
    else:
        page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
    page.wait_for_function('window.JSSCCMidi && window.ui && ui.renderer && ui.renderer.initialized && ui.renderer.hitDetector.regions.play')
    record('real index and legacy canvas initialize',not errors,errors)
    record('real data adapter has complete banks',page.evaluate('GXSCC_EXACT_DATA.instrumentSets.every(s=>s.map.length===128) && GXSCC_EXACT_DATA.envelopes.length===128'))
    # Small, original test fixture: a held organ note with a MIDI volume change.
    track=[0,0xc0,16,0,0x90,60,100,0x8f,0,0xb0,7,64,0x8f,0,0x80,60,0,0,0xff,0x2f,0]
    midi=bytes([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,0,0,0,len(track)]+track)
    page.set_input_files('#jsscc-file',{'name':'browser-probe.mid','mimeType':'audio/midi','buffer':midi})
    page.wait_for_function('JSSCCMidi.current && JSSCCMidi.current.fileName === "browser-probe.mid"')
    record('file picker loads MIDI in real application',True)
    page.click('#jsscc-play'); page.wait_for_function('JSSCCMidi.diagnostics().state === "playing"')
    page.wait_for_timeout(400)
    before=page.evaluate('JSSCCMidi.diagnostics()')
    record('interactive audio clock advances',before['position']>.25,before)
    page.click('#jsscc-pause');page.wait_for_function('JSSCCMidi.diagnostics().state === "paused"')
    paused=page.evaluate('JSSCCMidi.diagnostics()');page.wait_for_timeout(350)
    same=page.evaluate('JSSCCMidi.diagnostics()')
    record('pause retains nonzero position and active note',paused['position']>.25 and abs(same['position']-paused['position'])<.002 and same['activeVoices']==1,{'paused':paused,'after':same})
    page.click('small')
    record('unrelated click does not resume paused audio',page.evaluate('JSSCCMidi.diagnostics().contextState === "suspended"'))
    page.click('#jsscc-play');page.wait_for_function('JSSCCMidi.diagnostics().state === "playing"');page.wait_for_timeout(300)
    resumed=page.evaluate('JSSCCMidi.diagnostics()')
    record('resume continues from paused position',resumed['position']>paused['position']+.2,resumed)
    page.click('#jsscc-stop');page.wait_for_function('JSSCCMidi.diagnostics().state === "stopped"')
    record('stop resets playhead',page.evaluate('JSSCCMidi.diagnostics().position === 0 && JSSCCMidi.diagnostics().activeVoices === 0'))
    def click_legacy(name):
        point=page.evaluate("""name=>{const r=ui.renderer.hitDetector.regions[name],box=ui.renderer.canvas.getBoundingClientRect();return {x:box.left+(r.x+r.w/2)*ui.renderer.scale,y:box.top+(r.y+r.h/2)*ui.renderer.scale};}""",name)
        page.mouse.click(point['x'],point['y'])
    click_legacy('play')
    # Transport.state becomes playing before AudioContext.resume resolves. Wait
    # for the observable audio clock, not a fixed 200 ms on a busy CI runner.
    try:
        page.wait_for_function('JSSCCMidi.diagnostics().contextState === "running" && JSSCCMidi.diagnostics().position > .1', timeout=5000)
    except Exception:
        page.screenshot(path=str(OUT/'canvas-play-failure.png'),full_page=True)
        record('original canvas Play controls the new engine',False,page.evaluate('({audio:JSSCCMidi.diagnostics(),uiState:ui.song.playState})'))
    record('original canvas Play controls the new engine',page.evaluate('JSSCCMidi.diagnostics().position > .1'),page.evaluate('JSSCCMidi.diagnostics()'))
    record('unused channels no longer animate fake sine meters',page.evaluate('ui.song.channels[5].volume === 0'))
    click_legacy('pause');page.wait_for_function('JSSCCMidi.diagnostics().state === "paused"')
    record('original canvas Pause freezes the engine',page.evaluate('JSSCCMidi.diagnostics().contextState === "suspended"'))
    click_legacy('stop');page.wait_for_function('JSSCCMidi.diagnostics().state === "stopped"')
    record('original canvas Stop resets the engine',page.evaluate('JSSCCMidi.diagnostics().position === 0'))
    # Actual drop event with a File, not just a call to loadFile.
    page.evaluate('''bytes => { const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],'dropped.mid',{type:'audio/midi'})); window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true})); }''',list(midi))
    page.wait_for_function('JSSCCMidi.current.fileName === "dropped.mid"')
    record('drag-and-drop loads a File',True)
    # Invalid load must leave the previous song usable and show an error.
    page.set_input_files('#jsscc-file',{'name':'broken.mid','mimeType':'audio/midi','buffer':b'MThd'})
    page.wait_for_function('document.querySelector("#jsscc-status").dataset.error === "true"')
    record('malformed file is reported without replacing previous song',page.evaluate('JSSCCMidi.current.fileName === "dropped.mid"'))
    # Render with the SAME Synth implementation; no mocked audio in these tests.
    audio=page.evaluate('''async()=>{
      const make=events=>({duration:1.2,events});
      const n={type:'on',channel:0,note:60,velocity:100,time:0};
      const prog={type:'program',channel:0,value:16,time:0};
      const control=(controller,value,time)=>({type:'cc',channel:0,controller,value,time});
      const rms=(buf,start,end,c=0)=>{const a=buf.getChannelData(c);let sum=0;for(let i=Math.floor(start*buf.sampleRate);i<Math.floor(end*buf.sampleRate);i++)sum+=a[i]*a[i];return Math.sqrt(sum/(Math.floor(end*buf.sampleRate)-Math.floor(start*buf.sampleRate)));};
      const options={tailSeconds:.3,masterGain:.12};
      const silence=await JSSCCAudio.renderMidi(make([]),GXSCC_EXACT_DATA,options);
      const base=await JSSCCAudio.renderMidi(make([prog,n]),GXSCC_EXACT_DATA,options);
      const vol=await JSSCCAudio.renderMidi(make([prog,n,control(7,0,.5)]),GXSCC_EXACT_DATA,options);
      const expr=await JSSCCAudio.renderMidi(make([prog,n,control(11,0,.5)]),GXSCC_EXACT_DATA,options);
      const pan=await JSSCCAudio.renderMidi(make([prog,n,control(10,0,.5)]),GXSCC_EXACT_DATA,options);
      const mute=await JSSCCAudio.renderMidi(make([prog,n]),GXSCC_EXACT_DATA,{...options,muted:[0]});
      let peak=0,finite=true;for(let c=0;c<base.numberOfChannels;c++)for(const v of base.getChannelData(c)){peak=Math.max(peak,Math.abs(v));if(!Number.isFinite(v))finite=false;}
      const bytes=new Uint8Array(JSSCCAudio.wav(base));let text='';for(let i=0;i<bytes.length;i++)text+=String.fromCharCode(bytes[i]);
      return {silence:rms(silence,0,1),before:rms(base,.25,.4),after:rms(base,.6,.9),volAfter:rms(vol,.6,.9),exprAfter:rms(expr,.6,.9),panLeft:rms(pan,.6,.9),panRight:rms(pan,.6,.9,1),muted:rms(mute,.2,1),peak,finite,wav:btoa(text)};
    }''')
    (OUT/'browser-probe-web.wav').write_bytes(base64.b64decode(audio.pop('wav')))
    record('OfflineAudioContext renders non-silent finite PCM',audio['before']>.001 and audio['finite'] and audio['peak']<1,audio)
    record('no-note offline render is silent',audio['silence']==0)
    record('CC7 mutes an already sounding note in PCM',audio['volAfter']<1e-6,audio['volAfter'])
    record('CC11 mutes an already sounding note in PCM',audio['exprAfter']<1e-6,audio['exprAfter'])
    record('CC10 moves an already sounding note to the left in PCM',audio['panLeft']>.001 and audio['panRight']<1e-6,{'left':audio['panLeft'],'right':audio['panRight']})
    record('mute is actual audio silence, not just an icon',audio['muted']==0,audio['muted'])
    with page.expect_download() as dl:
        page.click('#jsscc-export')
    dl.value.save_as(OUT/'export-button-web.wav')
    record('Export WAV button downloads a real RIFF file',(OUT/'export-button-web.wav').read_bytes()[:4]==b'RIFF')
    with page.expect_download() as original_download:
        click_legacy('export')
    original_download.value.save_as(OUT/'canvas-export-web.wav')
    record('original canvas Export downloads WAV',(OUT/'canvas-export-web.wav').read_bytes()[:4]==b'RIFF')
    # Synthetic offline scheduling includes all 128 program maps and envelopes.
    matrix=page.evaluate('''async()=>{
      const events=[];for(let program=0;program<128;program++){const time=program*.06;events.push({time,type:'program',channel:0,value:program},{time,type:'on',channel:0,note:60,velocity:80},{time:time+.04,type:'off',channel:0,note:60});}
      const summaries=[];
      for(let instrumentSet=0;instrumentSet<8;instrumentSet++){
        const buffer=await JSSCCAudio.renderMidi({duration:8,events},GXSCC_EXACT_DATA,{instrumentSet,tailSeconds:.5});let energy=0,peak=0,finite=true;
        for(const v of buffer.getChannelData(0)){energy+=v*v;peak=Math.max(peak,Math.abs(v));if(!Number.isFinite(v))finite=false;}
        summaries.push({instrumentSet,finite,peak,energy});
      }return summaries;
    }''')
    record('128 programs render through each of 8 banks without runtime error',all(m['finite'] and m['energy']>0 for m in matrix),matrix)
    page.screenshot(path=str(OUT/'player-tested.png'),full_page=True)
    record('no browser exceptions',not errors,errors)
    record('no browser console errors',not console,console)
    browser.close()
server.shutdown()
(OUT/'browser-tests.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps({'mode':'embedded-assets' if '--embedded' in sys.argv else 'http-site','browser':p.chromium.name,'results':results},indent=2))
