/* PCM Edition defaults: repeat enabled, remote thumbnails enabled, and UI file loads autoplay. */
(function(root){
  'use strict';
  let loopApplied=false,fileAutoplayApplied=false,thumbApplied=false;

  function applyLoopDefault(){
    if(loopApplied)return true;
    const song=root.ui&&root.ui.song;
    if(!song)return false;
    song.repeat=true;
    loopApplied=true;
    return true;
  }

  function loadAndPlay(file,owner){
    const player=root.JSSCCMidi;
    if(!player||!file)return Promise.resolve(false);
    applyLoopDefault();
    return player.loadFile(file,{owner}).then(ok=>ok?player.play({owner}).then(()=>true):false);
  }

  function applyFileAutoplay(){
    if(fileAutoplayApplied||!root.JSSCCMidi)return fileAutoplayApplied;
    const picker=document.getElementById('jsscc-file');
    if(!picker)return false;
    picker.addEventListener('change',event=>{
      const file=picker.files&&picker.files[0];
      if(!file)return;
      event.stopImmediatePropagation();
      loadAndPlay(file,'file-picker-autoplay').finally(()=>{picker.value='';});
    },true);
    root.addEventListener('drop',event=>{
      const file=event.dataTransfer&&event.dataTransfer.files&&event.dataTransfer.files[0];
      if(!file)return;
      event.preventDefault();event.stopImmediatePropagation();
      const overlay=document.getElementById('jsscc-drop');if(overlay)overlay.classList.remove('visible');
      loadAndPlay(file,'drop-autoplay');
    },true);
    fileAutoplayApplied=true;
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
    applyFileAutoplay();
    applyThumbnailDefault();
    if(loopApplied&&fileAutoplayApplied&&thumbApplied)clearInterval(timer);
  }

  const timer=setInterval(apply,50);
  apply();
  root.JSSCCDefaultPlaybackPreferences=Object.freeze({
    get loopDefaultApplied(){return loopApplied;},
    get fileAutoplayApplied(){return fileAutoplayApplied;},
    get thumbnailsDefaultApplied(){return thumbApplied;}
  });
})(window);
