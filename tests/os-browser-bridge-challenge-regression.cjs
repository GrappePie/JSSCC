'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
test('browser bridge challenge is surfaced instead of silently falling back',()=>{
  const page=fs.readFileSync(path.join(root,'js/os-browser-bridge.js'),'utf8');
  const bg=fs.readFileSync(path.join(root,'extensions/os-browser-bridge/background.js'),'utf8');
  const os=fs.readFileSync(path.join(root,'extensions/os-browser-bridge/content-os.js'),'utf8');
  const live=fs.readFileSync(path.join(root,'js/edition-live-search.js'),'utf8');
  assert.match(page,/browser_challenge/);
  assert.match(page,/status:challenge\?428:502/);
  assert.match(page,/OS Browser Bridge v/);
  assert.match(bg,/tabLooksChallenged/);
  assert.match(bg,/Just a moment|just a moment/);
  assert.match(bg,/keepOpen=true/);
  assert.match(bg,/chrome\.tabs\.update\(tab\.id,\{active:true\}\)/);
  assert.match(os,/error\.code='challenge'/);
  assert.match(live,/body\.error==='browser_challenge'/);
  assert.match(live,/renderBrowserChallenge/);
});
