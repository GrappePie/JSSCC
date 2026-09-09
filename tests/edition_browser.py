"""Real HTTP/Chromium, real PCM. No external catalog playback is simulated.
The 6 OS cards are explicitly static reference metadata; the input MIDI is synthetic.
"""
from pathlib import Path
import functools,http.server,threading,sys,shutil,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'test-results';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();results=[]
def check(name,value,detail=None):
 results.append({'test':name,'pass':bool(value),'details':detail});(OUT/'edition-tests.json').write_text(json.dumps(results,indent=2))
 if not value:raise AssertionError(name+': '+str(detail))
track=bytes([0,255,81,3,7,161,32,0,192,16,0,144,60,90,0x9e,0,128,60,0,0,255,47,0])
midi=b'MThd'+(6).to_bytes(4,'big')+bytes([0,0,0,1,1,224])+b'MTrk'+len(track).to_bytes(4,'big')+track
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':1060})
 page.add_init_script("""const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(o={}){super({...o,sinkId:{type:'none'}})}};""")
 errors=[];external=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:external.append(r.url) if 'onlinesequencer.net' in r.url else None)
 try:
  page.goto(f'http://127.0.0.1:{server.server_port}/index.html',timeout=12000)
  page.wait_for_function('window.JSSCCEditionUI?.diagnostics().brandingReady && window.ui?.renderer?.loadEvents===0',timeout=12000)
  check('new product identity is visible',page.title()=='JSSCC — PCM Edition · GrappePie' and 'v0.3.0' in page.locator('#jsscc-edition').inner_text())
  check('canvas notices preserve upstream copyright and new version',page.evaluate("JSON.stringify(ui.renderer.loader.drawGroups).includes('(C) 2017 meme.institute + Milkey Mouse') && JSON.stringify(ui.renderer.loader.drawGroups).includes('PCM v0.3.0')"))
  page.click('#jsscc-sequencer');page.wait_for_function("document.querySelectorAll('.edition-card').length===6")
  check('six real-reference cards appear in the drawer',page.locator('.edition-card').count()==6)
  check('selection is not passed off as live catalog or partnership','no es un catálogo en directo' in page.locator('#edition-network-note').inner_text() and 'no oficial' in page.locator('#edition-network-note').inner_text())
  check('no external requests before opt-in',len(external)==0,external)
  check('original-page links have safe targets',page.evaluate("Array.from(document.querySelectorAll('.edition-card>a')).every(a=>a.href.startsWith('https://onlinesequencer.net/')&&a.target==='_blank'&&a.rel.includes('noopener'))"))
  page.screenshot(path=str(OUT/'edition-library.png'),full_page=True)
  # One-character queries intentionally remain a local fallback filter; two+ characters use the live-search layer.
  page.fill('#edition-search','x');check('short local title-author filter remains available',page.locator('.edition-card').count()==1)
  page.fill('#edition-search','');
  page.fill('#edition-sequence-url','https://evil.test/555');page.locator('.edition-add-form button').click()
  check('untrusted URL is rejected',page.locator('#edition-feedback').get_attribute('data-error')=='true' and page.locator('.edition-card').count()==6)
  page.fill('#edition-sequence-url','https://onlinesequencer.net/1234567');page.locator('.edition-add-form button').click()
  check('user-added URL persists only as metadata',page.locator('.edition-card').count()==7 and page.evaluate("JSON.parse(localStorage.getItem('jsscc-os-links-v1'))[0].id===1234567"))
  page.evaluate('ui.switchPalette("gameboy")');page.wait_for_function("getComputedStyle(document.documentElement).getPropertyValue('--edition-background').trim()==='#8bac0f'")
  check('drawer follows the actual selected palette',True)
  page.evaluate('ui.switchPalette("default")');page.wait_for_function("ui.renderer.paletteName==='default'")
  card=page.locator('.edition-card').first
  with page.expect_file_chooser() as fc:card.locator('.edition-import').click()
  fc.value.set_files({'name':'bad.mid','mimeType':'audio/midi','buffer':b'not midi'})
  page.wait_for_function("document.querySelector('#edition-feedback').dataset.error==='true'")
  check('bad MIDI is rejected without a false playback claim',page.evaluate('JSSCCEditionUI.diagnostics().associatedFiles===0 && !JSSCCMidi.current'))
  with page.expect_file_chooser() as fc:card.locator('.edition-import').click()
  fc.value.set_files({'name':'synthetic-reference.mid','mimeType':'audio/midi','buffer':midi})
  page.wait_for_function("JSSCCMidi.diagnostics().state==='playing' && JSSCCMidi.diagnostics().activeVoices>0",timeout=12000)
  check('a user-supplied MIDI really plays through PCM',page.evaluate("JSSCCMidi.engine==='pcm'&&JSSCCEditionUI.diagnostics().associatedFiles===1"))
  check('drawer closes and attribution distinguishes reference from local filename',not page.locator('#jsscc-sequencer-dialog').is_visible() and 'synthetic-reference.mid' in page.locator('#jsscc-sequence-source').inner_text())
  page.click('#jsscc-pause');page.wait_for_function("JSSCCMidi.diagnostics().state==='paused'")
  page.click('#jsscc-sequencer');page.wait_for_timeout(180)
  check('opening the drawer never resumes paused audio',page.evaluate("JSSCCMidi.diagnostics().state==='paused'"))
  check('associated card now offers actual one-click local playback','Reproducir chiptune' in page.locator('.edition-card').first.locator('.edition-replay').inner_text())
  page.locator('.edition-card').first.locator('.edition-replay').click();page.wait_for_function("JSSCCMidi.diagnostics().state==='playing'")
  check('associated file can be replayed from its card',True)
  page.click('#jsscc-stop');page.wait_for_function("JSSCCMidi.diagnostics().state==='stopped'")
  page.click('#jsscc-sequencer');page.keyboard.press('Escape')
  check('Escape closes modal and restores focus',not page.locator('#jsscc-sequencer-dialog').is_visible() and page.locator('#jsscc-sequencer').evaluate('(e)=>document.activeElement===e'))
  page.set_input_files('#jsscc-file',{'name':'different.mid','mimeType':'audio/midi','buffer':midi});page.wait_for_function("document.querySelector('#jsscc-sequence-source').hidden")
  check('replacing MIDI elsewhere clears stale source credit',True)
  page.set_viewport_size({'width':390,'height':844});page.click('#jsscc-sequencer');page.wait_for_timeout(100)
  check('drawer fits narrow viewport',page.locator('#jsscc-sequencer-dialog').evaluate('(e)=>e.getBoundingClientRect().width<=innerWidth'))
  page.screenshot(path=str(OUT/'edition-library-mobile.png'),full_page=True)
  page.reload();page.wait_for_function('window.JSSCCEditionUI');page.click('#jsscc-sequencer');page.wait_for_function("document.querySelectorAll('.edition-card').length===7")
  check('reload keeps links but drops session MIDI bytes',page.evaluate('JSSCCEditionUI.diagnostics().associatedFiles===0 && JSSCCEditionUI.diagnostics().associatedBytes===0'))
  check('all library flows avoid remote requests without opt-in',not external,external)
  page.goto(f'http://127.0.0.1:{server.server_port}/credits.html');check('credits and license status are accessible','© 2017 meme.institute + Milkey Mouse' in page.inner_text('body') and 'No se asigna una licencia nueva' in page.inner_text('body'))
  check('no browser exceptions',not errors,errors)
 except Exception:
  (OUT/'edition-failure.json').write_text(json.dumps({'errors':errors,'external':external},indent=2));page.screenshot(path=str(OUT/'edition-failure.png'),full_page=True);raise
 finally:b.close();server.shutdown()
print(json.dumps({'passed':len(results),'results':results},indent=2))
