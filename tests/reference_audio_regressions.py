"""Real Web Audio regression tests for decoded stages (not whole-emulator equivalence)."""
import json, shutil, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT/'test-results'
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('chromium-browser'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(); errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content('<html><title>Reference regression tests</title></html>')
    for name in ['gxscc-exact-data.js','midi-core.js','audio-core.js']:
        page.add_script_tag(content=(ROOT/'js'/name).read_text())
    tests = page.evaluate('''async () => {
      const tests=[]; const check=(test,pass,details)=>{tests.push({test,pass,details});};
      const rms=(b,a,z)=>{let sum=0,n=0;for(let c=0;c<b.numberOfChannels;c++){const x=b.getChannelData(c);for(let i=Math.round(a*b.sampleRate);i<Math.round(z*b.sampleRate);i++){sum+=x[i]*x[i];n++;}}return Math.sqrt(sum/n);};
      const peak=b=>{let p=0;for(let c=0;c<b.numberOfChannels;c++)for(const v of b.getChannelData(c))p=Math.max(p,Math.abs(v));return p;};
      const render=async(program=0,off=2,rate=44100)=>JSSCCAudio.renderMidi({duration:3,events:[
        {type:'program',channel:0,value:program,time:0},{type:'on',channel:0,note:60,velocity:100,time:0},
        {type:'off',channel:0,note:60,time:off}]},GXSCC_EXACT_DATA,{sampleRate:rate,tailSeconds:.5});
      const piano=await render(), earlier=await render(0,1);
      let diff=0;for(let i=0;i<.8*44100;i++)diff=Math.max(diff,Math.abs(piano.getChannelData(0)[i]-earlier.getChannelData(0)[i]));
      check('later Note Off cannot change earlier held PCM',diff<1e-7,{maximumSampleDifference:diff});
      const ratio=20*Math.log10(rms(piano,1,1.05)/rms(piano,.15,.2));
      check('piano relative decay agrees with the measured B236E probe',Math.abs(ratio-(-3.0101168868))<.1,{webDb:ratio,originalDb:-3.0101168868,toleranceDb:.1});
      check('piano key-off finishes after its 50 ms release',rms(piano,2.055,2.15)<1e-7,{rms:rms(piano,2.055,2.15)});
      check('piano release retains energy before its end',rms(piano,2.005,2.02)>.001);
      const earlyAttack=await render(40,.02), heldAttack=await render(40,2);
      let attackDiff=0;for(let i=0;i<.015*44100;i++)attackDiff=Math.max(attackDiff,Math.abs(earlyAttack.getChannelData(0)[i]-heldAttack.getChannelData(0)[i]));
      check('Note Off inside attack preserves the prior attack ramp',attackDiff<1e-7,{maximumSampleDifference:attackDiff});
      check('early violin key-off uses the fifth field release',rms(earlyAttack,.065,.15)<1e-7);
      for(const rate of [22050,48000]){
        const other=await render(0,2,rate), change=20*Math.log10(rms(other,1,1.05)/rms(other,.15,.2));
        check('envelope duration is sample-rate independent at '+rate,Math.abs(change-ratio)<.05&&rms(other,2.06,2.15)<1e-7,{changeDb:change});
      }
      const org=await render(16),change=20*Math.log10(rms(org,1,1.05)/rms(org,.15,.2));
      check('organ retains a stable held stage',Math.abs(change)<.1,{changeDb:change});
      check('organ key-off has a 40 ms tail, not a hard cut',rms(org,2.005,2.02)>.001&&rms(org,2.045,2.15)<1e-7);
      const drum=async(note,controllers=[])=>JSSCCAudio.renderMidi({duration:.7,events:[{type:'on',channel:9,note,velocity:100,time:0},...controllers]},GXSCC_EXACT_DATA,{sampleRate:44100,tailSeconds:0});
      const snare=await drum(38),kick=await drum(35),kick2=await drum(36);
      const db=20*Math.log10(peak(snare));
      check('snare peak is close to the measured native probe without normalization',Math.abs(db-(-12.7707924723))<.8,{webDbfs:db,originalDbfs:-12.7707924723,toleranceDb:.8});
      check('snare retains an audible body rather than an exponential click',rms(snare,.015,.025)>.05,{bodyRms:rms(snare,.015,.025)});
      check('snare decoded durations finish below 38 ms',rms(snare,.038,.1)<1e-7);
      let same=true;for(let i=0;i<kick.length;i++)if(kick.getChannelData(0)[i]!==kick2.getChannelData(0)[i])same=false;
      check('standard kick35/36 produce equal PCM',same);
      check('kick completes one roughly 13.6 ms cycle',rms(kick,.01,.012)>.1&&rms(kick,.014,.1)<1e-7);
      const muted=await drum(46,[{type:'cc',channel:9,controller:7,value:0,time:.01}]);
      check('live CC7 still silences new percussion buffers',rms(muted,.02,.05)===0);
      const hat=await drum(42);let mean=0;for(let i=0;i<600;i++)mean+=hat.getChannelData(0)[i]/600;
      check('decoded signed-noise path retains its native negative bias',mean<-.02,{mean});
      check('the three isolated validation tones do not clip',Math.max(peak(piano),peak(org),peak(snare))<1);
      return tests;
    }''')
    browser.close()
result={'tests':tests,'browserErrors':errors,'passed':sum(t['pass'] for t in tests),'failed':sum(not t['pass'] for t in tests),'scope':'Real Web Audio, isolated measured references; no full-emulator fidelity claim'}
(OUT/'reference-audio-tests.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
if errors or result['failed']:raise SystemExit(1)
