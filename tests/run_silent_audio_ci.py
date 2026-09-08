"""Select Chromium's native silent output device for CI, not a mocked audio engine.
AudioContext/AudioWorklet/clock/PCM implementations remain the real browser APIs.
The only constructor option changed is sinkId={type:'none'}, documented by Chrome:
https://developer.chrome.com/blog/audiocontext-setsinkid#render_audio_with_a_muted_audiocontext
This validates rendering and transport, NOT physical speaker/device output.
Usage: python tests/run_silent_audio_ci.py <browser_regressions.py|pcm_browser.py> <output>
"""
import json, runpy, sys
from pathlib import Path
from playwright.sync_api import Browser
ROOT=Path(__file__).resolve().parents[1]
if len(sys.argv)!=3 or sys.argv[1] not in ('browser_regressions.py','pcm_browser.py'):
    raise SystemExit('Specify a supported browser suite and output directory')
target=ROOT/'tests'/sys.argv[1]
out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
original_new_page=Browser.new_page
INIT="""(()=>{
  const NativeAudioContext=window.AudioContext;
  window.AudioContext=class SilentOutputAudioContext extends NativeAudioContext {
    constructor(options={}) { super({...options,sinkId:{type:'none'}}); }
  };
  window.__CI_AUDIO_OUTPUT__='native silent sink; real audio rendering, no physical output';
})();"""
def new_page(self,*args,**kwargs):
    page=original_new_page(self,*args,**kwargs)
    page.add_init_script(INIT)
    return page
Browser.new_page=new_page
sys.argv=[str(target),str(out)]
try:
    runpy.run_path(str(target),run_name='__main__')
finally:
    Browser.new_page=original_new_page
    (out/(target.stem+'-device.json')).write_text(json.dumps({
        'audioOutput':'Native AudioContext sinkId type none',
        'synthesisMocked':False,'clockMocked':False,'workletMocked':False,
        'physicalSpeakerOutputTested':False,'suite':target.name},indent=2))
