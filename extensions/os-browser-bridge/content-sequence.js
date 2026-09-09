'use strict';

const JSSCC_URL='https://grappepie.github.io/JSSCC/';

function sequenceId(){
  const m=location.pathname.match(/^\/(\d{1,9})\/?$/);
  return m?m[1]:null;
}
function clean(text){return String(text||'').replace(/\s+/g,' ').trim();}
function stripSiteTitle(text){
  return clean(text)
    .replace(/^Online Sequencer\s*[-|:]\s*/i,'')
    .replace(/\s*[-|:]\s*Online Sequencer(?:\.net)?\s*$/i,'')
    .trim();
}
function usableTitle(text){
  const t=stripSiteTitle(text);
  if(!t||/^Online Sequencer(?:\.net)?$/i.test(t)||/^Sequence\s*#?\d+$/i.test(t)||/^Loading\.\.\.$/i.test(t))return '';
  return t.slice(0,160);
}
function songTitle(){
  // The page header itself can be an H1/H2 saying only "Online Sequencer".
  // Prefer page metadata first; sequence pages normally expose the real title there.
  const meta=document.querySelector('meta[property="og:title"],meta[name="twitter:title"]');
  const candidates=[meta?.content,document.title];
  for(const value of candidates){const title=usableTitle(value);if(title)return title;}

  // Fallback to visible headings, but reject site-wide/generic labels.
  for(const node of document.querySelectorAll('.sequence-title,.title,h1,h2,h3')){
    const title=usableTitle(node.textContent);if(title)return title;
  }

  // Last fallback: find a non-empty input associated with a visible Title label.
  for(const input of document.querySelectorAll('input,textarea')){
    const value=usableTitle(input.value);if(!value)continue;
    const context=clean(input.closest('label,div,section')?.textContent||'');
    if(/\bTitle\b/i.test(context))return value;
  }
  return '';
}
function pixelIcon(){
  const icon=document.createElement('span');
  icon.setAttribute('aria-hidden','true');
  Object.assign(icon.style,{display:'inline-block',width:'4px',height:'4px',marginRight:'10px',verticalAlign:'middle',background:'#2d82dc',boxShadow:'5px 0 #2d82dc,10px 0 #34383f,15px 0 #34383f,0 5px #34383f,5px 5px #34383f,10px 5px #2d82dc,15px 5px #2d82dc,0 10px #34383f,5px 10px #34383f,10px 10px #34383f,15px 10px #34383f',outline:'1px solid #17191d',imageRendering:'pixelated'});
  return icon;
}
function destination(id){
  const u=new URL(JSSCC_URL);
  u.searchParams.set('os',id);
  u.searchParams.set('autoplay','1');
  const title=songTitle();if(title)u.searchParams.set('title',title);
  u.searchParams.set('from','onlinesequencer');
  return u.href;
}
function findDownloads(){
  const anchors=[...document.querySelectorAll('a[href]')];
  return anchors.find(a=>/download\s*\.?(?:mid|midi)/i.test(clean(a.textContent)))
    ||anchors.find(a=>/download/i.test(clean(a.textContent))&&/mid|midi/i.test(a.getAttribute('href')||''));
}
function inject(){
  const id=sequenceId();if(!id||document.getElementById('jsscc-play-chiptune'))return;
  const midi=findDownloads();if(!midi)return setTimeout(inject,300);
  const a=document.createElement('a');a.id='jsscc-play-chiptune';a.href=destination(id);a.target='_blank';a.rel='noopener noreferrer';
  a.title='Open this sequence in JSSCC PCM Edition and play it as chiptune (unofficial integration)';
  Object.assign(a.style,{display:'inline-flex',alignItems:'center',marginLeft:'7px',padding:'3px 7px',border:'1px solid #1d6fb8',background:'#26364b',color:'#8dc7ff',fontWeight:'700',fontSize:'12px',lineHeight:'18px',textDecoration:'none',boxShadow:'inset 1px 1px #4b5d73'});
  a.append(pixelIcon(),document.createTextNode('Play Chiptune'));
  midi.insertAdjacentText('afterend',' · ');midi.nextSibling.after(a);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject,{once:true});else inject();
