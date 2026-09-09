'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
test('browser bridge intercepts catalog fetch when input is a URL object',async()=>{
  const source=fs.readFileSync(path.join(root,'js/os-browser-bridge.js'),'utf8');
  const messages=[];
  const listeners={};
  const fakeWindow={
    location:{href:'https://grappepie.github.io/JSSCC/',origin:'https://grappepie.github.io'},
    fetch:async()=>{throw new Error('original fetch should not run for catalog URL object');},
    addEventListener:(type,fn)=>{listeners[type]=fn;},
    postMessage:(data)=>{
      messages.push(data);
      if(data.type==='PING')setImmediate(()=>listeners.message({source:fakeWindow,origin:fakeWindow.location.origin,data:{source:'JSSCC_OS_BRIDGE',requestId:data.requestId,ok:true,payload:{version:'0.1.2'}}}));
      if(data.type==='SEARCH')setImmediate(()=>listeners.message({source:fakeWindow,origin:fakeWindow.location.origin,data:{source:'JSSCC_OS_BRIDGE',requestId:data.requestId,ok:true,payload:{results:[{id:'1',title:'x'}],count:1}}}));
    },
    setTimeout,clearTimeout,URL,Response,Event,document:{readyState:'loading',addEventListener:()=>{}},console
  };
  fakeWindow.window=fakeWindow;
  vm.runInNewContext(source,{window:fakeWindow,globalThis:fakeWindow,URL,Response,setTimeout,clearTimeout,Event,console});
  const u=new URL('https://jsscc-sequence-bridge.lovable.app/api/public/sequence-search?q=kirby&page=1');
  const res=await fakeWindow.fetch(u,{headers:{Accept:'application/json'}});
  assert.equal(res.status,200);
  assert.equal(res.headers.get('x-jsscc-search-source'),'browser-extension');
  const body=await res.json();
  assert.equal(body.results[0].id,'1');
  assert.ok(messages.some(x=>x.type==='SEARCH'));
});
