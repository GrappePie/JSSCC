/* Re-render exact MIDI inputs using the independently written PCM kernel.
 * Usage: node tools/render_pcm_matrix.cjs <native-artifact-directory> <output-directory>
 * No native executable is downloaded or run. No normalization or resampling.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
require('../js/gxscc-exact-data.js');
const {parseMidi}=require('../js/midi-core.js'),PCM=require('../js/pcm-core.js');
function main(){
 const input=path.resolve(process.argv[2]||''),out=path.resolve(process.argv[3]||'pcm-matrix-results');
 if(!process.argv[2])throw Error('Provide the extracted native matrix artifact directory');
 const manifest=JSON.parse(fs.readFileSync(path.join(input,'matrix-manifest.json'),'utf8'));
 fs.mkdirSync(out,{recursive:true});const records=[];
 for(const spec of manifest.files){
  if(path.basename(spec.file)!==spec.file)throw Error('Unsafe manifest filename');
  const binary=fs.readFileSync(path.join(input,spec.file));
  const sha=crypto.createHash('sha256').update(binary).digest('hex');
  if(sha!==spec.sha256)throw Error('MIDI hash mismatch: '+spec.file);
  const midi=parseMidi(binary),engine=new PCM.Engine(GXSCC_EXACT_DATA,{instrumentSet:spec.bank}).load(midi);
  const samples=engine.render(Math.ceil((engine.duration+1)*PCM.RATE));
  const wav=Buffer.from(PCM.wav(samples.left,samples.right));
  const file=spec.file.replace(/\.mid$/i,'.wav');fs.writeFileSync(path.join(out,file),wav);
  records.push({file,midiSha256:sha,wavSha256:crypto.createHash('sha256').update(wav).digest('hex'),...engine.diagnostics()});
  console.log(file,engine.duration+' seconds',engine.stats);
 }
 fs.writeFileSync(path.join(out,'render-manifest.json'),JSON.stringify({version:PCM.VERSION,normalization:false,resampling:false,records},null,2));
}
try{main();}catch(error){console.error(error.message);process.exitCode=1;}
