'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');

test('extension adds Play Chiptune deep link on Online Sequencer sequence pages',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'extensions/os-browser-bridge/manifest.json'),'utf8'));
  const sequence=fs.readFileSync(path.join(root,'extensions/os-browser-bridge/content-sequence.js'),'utf8');
  assert.equal(manifest.version,'0.1.4');
  assert.ok(manifest.content_scripts.some(x=>x.js?.includes('content-sequence.js')&&x.matches?.includes('https://onlinesequencer.net/*')));
  assert.match(sequence,/jsscc-play-chiptune/);
  assert.match(sequence,/searchParams\.set\('os',id\)/);
  assert.match(sequence,/searchParams\.set\('autoplay','1'\)/);
  assert.match(sequence,/Play Chiptune/);
});

test('extension prefers sequence page metadata over generic Online Sequencer headings',()=>{
  const sequence=fs.readFileSync(path.join(root,'extensions/os-browser-bridge/content-sequence.js'),'utf8');
  assert.match(sequence,/meta\[property="og:title"\]/);
  assert.match(sequence,/document\.title/);
  assert.match(sequence,/replace\(\/\^Online Sequencer\\s\*\[-\|:\]/);
  assert.match(sequence,/for\(const node of document\.querySelectorAll\('\.sequence-title,\.title,h1,h2,h3'\)\)/);
});

test('JSSCC deep link prepares a sequence and handles browser autoplay blocking',()=>{
  const source=fs.readFileSync(path.join(root,'js/os-deeplink.js'),'utf8');
  assert.match(source,/^[\s\S]*\?\:\s*new URLSearchParams|URLSearchParams/);
  assert.match(source,/JSSCCSequenceRemote/);
  assert.match(source,/loadFile/);
  assert.match(source,/player\.play/);
  assert.match(source,/requiere un clic para habilitar el audio/);
  assert.match(source,/edition-deeplink-play/);
});

test('JSSCC uses a CSS pixel-art OS integration mark',()=>{
  const css=fs.readFileSync(path.join(root,'css/os-integration.css'),'utf8');
  assert.match(css,/edition-os-badge::before/);
  assert.match(css,/box-shadow:/);
  assert.match(css,/image-rendering:pixelated/);
});
