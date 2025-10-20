(function(){
  function headersToObject(headers){
    const obj = {};
    try{ for(const [k,v] of headers.entries()) obj[k] = v }catch(e){}
    return obj;
  }
  const pending = new Map();
  window.addEventListener('message', async (ev) => {
    const msg = ev.data;
    if(!msg || msg.type !== 'INPAGE_FETCH') return;
    const { requestId, url, options } = msg;
    try{
      const resp = await fetch(url, Object.assign({}, options || {}, { credentials: 'include' }));
      const meta = { status: resp.status, statusText: resp.statusText, headers: headersToObject(resp.headers) };
      window.postMessage({ type: 'INPAGE_FETCH_META', requestId, meta }, location.origin);
      const body = resp.body;
      if(!body){
        const text = await resp.text().catch(()=> '');
        window.postMessage({ type: 'INPAGE_FETCH_CHUNK', requestId, value: text, done: true }, location.origin);
        return;
      }
      const reader = body.getReader();
      pending.set(requestId, reader);
      const decoder = new TextDecoder();
      while(true){
        const {done, value} = await reader.read();
        if(done){
          window.postMessage({ type: 'INPAGE_FETCH_CHUNK', requestId, done: true }, location.origin);
          pending.delete(requestId);
          break;
        }
        window.postMessage({ type: 'INPAGE_FETCH_CHUNK', requestId, value: decoder.decode(value), done: false }, location.origin);
      }
    }catch(e){
      window.postMessage({ type: 'INPAGE_FETCH_ERROR', requestId, message: String(e && e.message || e) }, location.origin);
    }
  });
  window.addEventListener('message', async (ev) => {
    const msg = ev.data;
    if(!msg || msg.type !== 'INPAGE_FETCH_ABORT') return;
    const { requestId } = msg;
    const reader = pending.get(requestId);
    try{ await reader?.cancel() }catch(e){}
    pending.delete(requestId);
  });
})();