/* Pure editing helpers shared by JSSCC Studio and its regressions. */
(function(root){
  'use strict';
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const allowed=new Set([4,8,16,32]);
  function gridValue(grid){const g=Math.round(+grid||16);return allowed.has(g)?g:16;}
  function snapSize(grid){return 16/gridValue(grid);}
  function quantize(value,grid,mode='round'){
    const snap=snapSize(grid),v=(+value||0)/snap;
    const q=mode==='floor'?Math.floor(v):mode==='ceil'?Math.ceil(v):Math.round(v);
    return +(q*snap).toFixed(6);
  }
  function clampMove(notes,deltaStep,deltaPitch,totalSteps,grid){
    if(!notes.length)return {step:0,pitch:0};
    let ds=quantize(deltaStep,grid),dp=Math.round(+deltaPitch||0);
    const minStep=Math.min(...notes.map(n=>+n.step||0));
    const maxEnd=Math.max(...notes.map(n=>(+n.step||0)+Math.max(snapSize(grid),+n.length||snapSize(grid))));
    ds=clamp(ds,-minStep,totalSteps-maxEnd);
    const minPitch=Math.min(...notes.map(n=>+n.pitch||0)),maxPitch=Math.max(...notes.map(n=>+n.pitch||0));
    dp=clamp(dp,-minPitch,127-maxPitch);
    return {step:+ds.toFixed(6),pitch:dp};
  }
  function resizedLength(note,targetLength,grid,totalSteps){
    const min=snapSize(grid),remaining=Math.max(min,totalSteps-(+note.step||0));
    return clamp(quantize(Math.max(min,+targetLength||min),grid),min,remaining);
  }
  function quantizeNote(note,grid,totalSteps){
    const step=clamp(quantize(note.step,grid),0,Math.max(0,totalSteps-snapSize(grid)));
    const length=resizedLength({...note,step},note.length,grid,totalSteps);
    return {...note,step,length};
  }
  const api=Object.freeze({gridValue,snapSize,quantize,clampMove,resizedLength,quantizeNote});
  root.JSSCCStudioEditing=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
