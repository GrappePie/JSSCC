/* Conversion stays off the UI thread; input is data, never executable code. */
'use strict';
importScripts('./sequence-codec.js?v=os-midi-2');
self.onmessage=({data})=>{
  try {
    const result=self.JSSCCSequenceCodec.convert(data.bytes,{id:data.id,title:data.title});
    self.postMessage({ok:true,bytes:result.bytes,report:result.report},[result.bytes.buffer]);
  } catch(error) { self.postMessage({ok:false,error:error.message || 'Conversión fallida'}); }
};
