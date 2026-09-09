/* PCM Edition defaults: autoplay on load, repeat enabled, and remote thumbnails enabled. */
(function(root){
  'use strict';
  let loopApplied=false,wrapped=false,thumbApplied=false;

  function applyLoopDefault(){
    if(loopApplied)return true;
    const song=root.ui&&root.ui.song;
    if(!song)return false;
    song.repeat=true;
    loopApplied=true;
    return true;
  }

  function wrapAutoplay(){
    if(wrapped||!root.JSSCCMidi||typeof root.JSSCCMidi.loadFile!=='function')return false;
    const player=root.JSSCCMidi,original=player.loadFile.bind(player);
    player.loadFile=async function(file,options={}){
      const ok=await original(file,options);
      if(!ok||options.autoplay===false)return ok;
      applyLoopDefault();
      await player.play({owner:options.owner||'autoplay-default'});
      return ok;
    };
    wrapped=true;
    return true;
  }

  function applyThumbnailDefault(){
    if(thumbApplied)return true;
    const checkbox=document.getElementById('edition-thumbnails');
    if(!checkbox)return false;
    checkbox.checked=true;
    checkbox.dispatchEvent(new Event('change',{bubbles:true}));
    thumbApplied=true;
    return true;
  }

  function apply(){
    applyLoopDefault();
    wrapAutoplay();
    applyThumbnailDefault();
    if(loopApplied&&wrapped&&thumbApplied)clearInterval(timer);
  }

  const timer=setInterval(apply,50);
  apply();
  root.JSSCCDefaultPlaybackPreferences=Object.freeze({
    get loopDefaultApplied(){return loopApplied;},
    get autoplayWrapped(){return wrapped;},
    get thumbnailsDefaultApplied(){return thumbApplied;}
  });
})(window);
