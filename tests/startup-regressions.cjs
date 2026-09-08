'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/jsscc.js'), 'utf8');
function create(readyState = 'loading') {
  const listeners = [];
  const sandbox = {document: {readyState}, window: {addEventListener(type, fn) {if(type === 'load') listeners.push(fn);}}, Cookies: {get: () => 'default'}};
  vm.runInNewContext(source.slice(0, source.indexOf('var Cookies =')), sandbox);
  const R = sandbox.CanvasRenderer;
  R.prototype.initCanvas = function () {if(this.initialized) return; this.initialized = true; this.canvas = {width:634,height:444};this.hitDetector = {regions:{}};this.initializations = (this.initializations || 0) + 1;};
  R.prototype.rescale = function () {};
  R.prototype.switchPalette = function () {};
  R.prototype.firstDraw = function () {assert.equal(this.initialized, true);this.draws=(this.draws||0)+1;};
  const loader = {onload:[], palettes:{default:{}}};
  const renderer = new R(loader,{channels:[{}]});
  let regionCalls=0;
  loader.onload.push(() => {
    assert.ok(renderer.hitDetector, 'asset observers must see an initialized hit detector');
    assert.equal(renderer.canvas.width, 634);
    renderer.hitDetector.regions.play = {};regionCalls++;
  });
  return {renderer,assets:()=>loader.onload.forEach(fn=>fn()),load:()=>listeners.forEach(fn=>fn()),regions:()=>regionCalls};
}
for (const order of ['assets-first','window-first','already-loaded']) {
  test('renderer initializes exactly once: '+order, () => {
    const p = create(order==='already-loaded'?'complete':'loading');
    if(order==='assets-first') {p.assets();assert.equal(p.renderer.loadEvents,1);assert.equal(p.renderer.draws,undefined);p.load();}
    else if(order==='window-first') {p.load();p.assets();}
    else p.assets();
    assert.equal(p.renderer.loadEvents,0);assert.equal(p.renderer.initializations,1);
    assert.equal(p.renderer.draws,1);assert.equal(p.regions(),1);
  });
}
test('TypeScript and shipped JavaScript initialize before asset observers', () => {
  const ts=fs.readFileSync(path.join(root,'src/canvas.ts'),'utf8');
  assert.match(ts,/this\.loader\.onload\.push\(\(\) => \{\s*\/\/[^\n]*\n\s*this\.initCanvas\(\);\s*this\.loadEvents--;/);
  assert.match(source,/this\.loader\.onload\.push\(function \(\) \{\s*\/\/[^\n]*\n\s*_this\.initCanvas\(\);\s*_this\.loadEvents--;/);
});
