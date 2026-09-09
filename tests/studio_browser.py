"""End-to-end smoke tests for JSSCC Studio editing tools."""
from pathlib import Path
import functools,http.server,json,shutil,sys,threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'test-results'
OUT.mkdir(parents=True,exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass

server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
results=[]
def check(name,value,detail=None):
 results.append({'test':name,'pass':bool(value),'details':detail})
 (OUT/'studio-browser-tests.json').write_text(json.dumps(results,indent=2))
 if not value: raise AssertionError(name+': '+str(detail))

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1600,'height':1000})
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.goto(f'http://127.0.0.1:{server.server_port}/studio.html',wait_until='networkidle',timeout=20000)
  check('Studio opens without browser exceptions',not errors,list(errors))
  check('Paint tool is active by default',page.locator('.tool[data-tool="paint"].active').count()==1)
  check('Onboarding hint is visible for an empty pattern',page.locator('#rollHint:not(.hidden)').count()==1)

  # Paint a note with the actual pointer surface.
  cell=page.locator('.cell[data-step="0"][data-pitch="60"]').first
  cell.scroll_into_view_if_needed();box=cell.bounding_box();assert box
  page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
  page.wait_for_timeout(100)
  check('Paint creates a note',page.locator('.note-block').count()==1)
  check('Onboarding hint hides after first note',page.locator('#rollHint.hidden').count()==1)

  # Visible history buttons must work, not only keyboard shortcuts.
  page.click('#undoBtn');page.wait_for_timeout(100)
  check('Visible Undo removes the painted note',page.locator('.note-block').count()==0)
  page.click('#redoBtn');page.wait_for_timeout(100)
  check('Visible Redo restores the note',page.locator('.note-block').count()==1)

  # Selection should be a real mode and clicking a note selects it.
  page.keyboard.press('v')
  check('V shortcut activates Select',page.locator('.tool[data-tool="select"].active').count()==1)
  note=page.locator('.note-block').first;note.click();page.wait_for_timeout(80)
  check('Selected note has visible selected state',page.locator('.note-block.selected').count()==1)
  check('Selection inspector appears',page.locator('#selectionInspector:not([hidden])').count()==1)

  # Text editing shortcuts must not accidentally undo notes in the composer.
  page.click('#titleInput');page.keyboard.type(' X');page.keyboard.press('Control+z');page.wait_for_timeout(100)
  check('Ctrl+Z inside title input does not undo composer notes',page.locator('.note-block').count()==1)
  page.locator('#pianoRoll').focus()

  # Duplicate and delete operate on the selection.
  page.keyboard.press('Control+d');page.wait_for_timeout(100)
  check('Ctrl+D duplicates selected note',page.locator('.note-block').count()==2)
  check('Duplicated note remains selected',page.locator('.note-block.selected').count()==1)
  page.keyboard.press('Delete');page.wait_for_timeout(100)
  check('Delete removes current selection only',page.locator('.note-block').count()==1)

  # Grid 1/32 must expose half-step cells and allow a note there.
  page.select_option('#gridSelect','32');page.wait_for_timeout(100)
  check('1/32 grid renders fractional half-step cells',page.locator('.cell[data-step="0.5"]').count()>0)
  page.keyboard.press('p')
  half=page.locator('.cell[data-step="0.5"][data-pitch="62"]').first
  half.scroll_into_view_if_needed();hb=half.bounding_box();assert hb
  page.mouse.click(hb['x']+hb['width']/2,hb['y']+hb['height']/2);page.wait_for_timeout(100)
  check('Paint works at a fractional 1/32 position',page.locator('.note-block').count()==2)

  # Eraser should delete with the same direct pointer interaction.
  page.keyboard.press('e');page.wait_for_timeout(50)
  target=page.locator('.note-block').last;tb=target.bounding_box();assert tb
  page.mouse.click(tb['x']+max(2,tb['width']/2),tb['y']+tb['height']/2);page.wait_for_timeout(100)
  check('Eraser removes a note directly',page.locator('.note-block').count()==1)

  # Help and autosave feedback should be discoverable and quiet.
  page.click('#helpBtn');check('Help dialog opens',page.locator('#helpDialog[open]').count()==1);page.click('#closeHelpDialog')
  page.fill('#titleInput','UX regression song');page.wait_for_timeout(1200)
  check('Autosave reports saved state','guardado' in page.locator('#saveState').inner_text().lower(),page.locator('#saveState').inner_text())
  check('No browser exceptions after editing workflow',not errors,list(errors))
  page.screenshot(path=str(OUT/'studio-tools-v2.png'),full_page=True)
 finally:
  browser.close();server.shutdown()

print(json.dumps({'passed':sum(x['pass'] for x in results),'results':results},indent=2))
