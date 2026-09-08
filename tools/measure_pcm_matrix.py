from pathlib import Path
import json,hashlib,numpy as np,wave
import argparse
parser=argparse.ArgumentParser(description='Compare native and new PCM matrix, without normalization or resampling.')
parser.add_argument('native',type=Path);parser.add_argument('rendered',type=Path);parser.add_argument('results',type=Path)
args=parser.parse_args();O=args.native;N=args.rendered;R=args.results;R.mkdir(exist_ok=True,parents=True)
def wav(p):
 with wave.open(str(p),'rb') as w:
  if (w.getnchannels(),w.getsampwidth(),w.getframerate())!=(2,2,44100):raise ValueError('Expected PCM16 stereo44100Hz: '+str(p))
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2).astype(np.int32)
def ranges(x,threshold=3,gap=400):
 ix=np.flatnonzero(np.max(np.abs(x),axis=1)>threshold)
 if len(ix)==0:return []
 cuts=np.flatnonzero(np.diff(ix)>gap)
 return [(int(a),int(b+1)) for a,b in zip(np.r_[ix[0],ix[cuts+1]],np.r_[ix[cuts],ix[-1]])]
def metrics(a,b):
 p=float(np.max(np.abs(a),initial=0));q=float(np.max(np.abs(b),initial=0));out={'peakOriginal':p,'peakNew':q,'peakErrorDb':float(20*np.log10(q/p)) if p>0 and q>0 else None}
 n=min(len(a),len(b),10000)
 if n:
  d=a[:n].astype(float)-b[:n];out.update(prefixFrames=n,prefixExact=bool(np.array_equal(a[:n],b[:n])),prefixRmsePcm=float(np.sqrt(np.mean(d*d))),meanOriginal=a[:n].mean(0).tolist(),meanNew=b[:n].mean(0).tolist())
 return out
manifest=json.loads((O/'matrix-manifest.json').read_text())
# The clock scale is measured only to locate regions; NOT applied to generated audio.
clock=ranges(wav(O/'timing-grid-original.wav'));coef=np.polyfit(np.arange(len(clock)),np.array([a for a,b in clock]),1)
results=[]
for spec in manifest['files']:
 if spec['file']=='timing-grid.mid':continue
 name=Path(spec['file']).stem;a=wav(O/(name+'-original.wav'));b=wav(N/(name+'.wav'));rows=[]
 for i,c in enumerate(spec['cases']):
  # Wide midpoint-separated windows account for clock drift without resampling/normalizing.
  lo=max(0,c['on']-.04)
  hi=spec['cases'][i+1]['on']-.02 if i+1<len(spec['cases']) else spec['duration']+.2
  ia=max(0,int((lo*coef[0]+40)));ja=min(len(a),int(hi*coef[0]+220));ib=max(0,int(lo*coef[0]));jb=min(len(b),int(hi*coef[0]+220))
  aa=a[ia:ja];bb=b[ib:jb];aaix=np.flatnonzero(np.max(np.abs(aa),axis=1)>3);bbix=np.flatnonzero(np.max(np.abs(bb),axis=1)>3)
  if len(aaix):astart=ia+int(aaix[0]);aend=ia+int(aaix[-1])+1
  else:astart=aend=ia
  if len(bbix):bstart=ib+int(bbix[0]);bend=ib+int(bbix[-1])+1
  else:bstart=bend=ib
  out={'case':c['label'],'bank':spec['bank'],'onsetOriginal':astart,'onsetNew':bstart,'durationOriginal':(aend-astart)/44100,'durationNew':(bend-bstart)/44100,**metrics(a[astart:aend],b[bstart:bend])}
  rows.append(out)
 results.append({'file':spec['file'],'cases':rows})
 errors=[abs(x['peakErrorDb']) for x in rows if x['peakErrorDb'] is not None]
 print(name,'cases',len(rows),'exactPrefixes',sum(x.get('prefixExact',False) for x in rows),'peaks <=.01dB',sum(e<=.01 for e in errors),'maxPeakErr',max(errors,default=0))
 print('worst',sorted([(x['case'],x['peakErrorDb'],x.get('prefixRmsePcm')) for x in rows if x['peakErrorDb'] is not None],key=lambda x:-abs(x[1]))[:8])
(R/'full-matrix.json').write_text(json.dumps({'normalization':False,'resampling':False,'prefixAlignment':'first PCM magnitude >3; at most10000 frames per case','nativeClockFramesPerSecondMeasured':float(coef[0]),'results':results},indent=2))
