'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
test('OS Browser Bridge 0.1.3 extracts only official thumbnails and optional note/play metrics',()=>{
  const os=fs.readFileSync(path.join(root,'extensions/os-browser-bridge/content-os.js'),'utf8');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'extensions/os-browser-bridge/manifest.json'),'utf8'));
  const page=fs.readFileSync(path.join(root,'js/edition-live-search.js'),'utf8');
  assert.equal(manifest.version,'0.1.3');
  assert.match(os,/safeThumbnail/);
  assert.match(os,/\/t\\\/\\d\+/);
  assert.match(os,/data-lazy-src/);
  assert.match(os,/backgroundImage/);
  assert.match(os,/notes:Number\.isFinite\(notes\)/);
  assert.match(os,/plays:Number\.isFinite\(plays\)/);
  assert.match(page,/reproducciones/);
  assert.match(page,/notas/);
});
