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
  
  // Turnstile solve bridge (runs in page context)
  // Usage: window.postMessage({ type: 'INPAGE_TURNSTILE_SOLVE', requestId, dx }, location.origin)
  window.addEventListener('message', async (ev) => {
    const msg = ev.data;
    if(!msg || msg.type !== 'INPAGE_TURNSTILE_SOLVE') return;
    const { requestId, dx } = msg;
    const reply = (payload) => window.postMessage(Object.assign({ type: 'INPAGE_TURNSTILE_SOLVE_RESULT', requestId }, payload || {}), location.origin);
    try {
      // ensure cf turnstile script
      if(!(window).turnstile){
        await new Promise((resolve, reject) => {
          try{
            const s = document.createElement('script');
            s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
            s.async = true; s.defer = true;
            s.onload = () => resolve();
            s.onerror = () => resolve(); // continue even if blocked; we'll fail below gracefully
            document.documentElement.appendChild(s);
          }catch(e){ resolve(); }
          setTimeout(resolve, 4000);
        });
      }
      const ts = (window).turnstile;
      if(!ts || typeof ts !== 'object'){
        return reply({ error: 'TURNSTILE_NOT_AVAILABLE' });
      }
      // try to discover sitekey
      let sitekey = null;
      try{
        const el = document.querySelector('[data-sitekey]');
        if(el) sitekey = el.getAttribute('data-sitekey');
      }catch(e){}
      if(!sitekey && (window).__TURNSTILE_SITEKEY){ sitekey = (window).__TURNSTILE_SITEKEY; }
      if(!sitekey){
        // try common meta/container ids (best-effort)
        const meta = document.querySelector('meta[name="cf-turnstile-sitekey"]');
        if(meta) sitekey = meta.getAttribute('content');
      }
      if(!sitekey){
        return reply({ error: 'SITEKEY_NOT_FOUND' });
      }
      // prefer execute if available
      try{
        if(typeof ts.execute === 'function'){
          const token = await ts.execute(sitekey, { action: 'chat', cData: dx, cdata: dx });
          if(token) return reply({ token });
        }
      }catch(e){}
      // fallback: render invisible widget and execute
      try{
        const c = document.createElement('div');
        c.style.position = 'fixed'; c.style.opacity = '0'; c.style.pointerEvents = 'none'; c.style.bottom = '0'; c.style.right = '0';
        document.body.appendChild(c);
        const wid = ts.render(c, { sitekey: sitekey, size: 'invisible', callback: function(token){ reply({ token }); }, 'cData': dx, 'cdata': dx });
        try{ ts.execute(wid); }catch(e){
          // some versions accept element id
          try{ ts.execute(c); }catch(e2){}
        }
        // timeout guard
        setTimeout(() => reply({ error: 'TIMEOUT' }), 6000);
      }catch(e){
        reply({ error: 'RENDER_FAILED' });
      }
    } catch(e){
      reply({ error: String(e && e.message || e) });
    }
  });
})();
