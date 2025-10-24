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
      // Grok.com 요청 시 자동으로 필수 헤더/옵션 보강
      const mergedOptions = Object.assign({}, options || {}, { credentials: 'include' });
      try {
        // 브라우저 기본 동작과 최대한 일치시키기 위해 referrer/정책/모드/언어를 명시
        if (!('referrer' in mergedOptions)) mergedOptions.referrer = document.referrer || location.href;
        if (!('referrerPolicy' in mergedOptions)) mergedOptions.referrerPolicy = 'strict-origin-when-cross-origin';
        if (!('mode' in mergedOptions)) mergedOptions.mode = 'same-origin';
      } catch(e) {}
      if(url && url.includes('grok.com')){
        console.log('[INPAGE-GROK] 🔍 Grok request detected, using intercepted headers...');

        // ⚠️ CRITICAL: Cloudflare 봇 감지를 피하기 위해
        // 오직 실제 Grok.com이 보내는 헤더만 사용 (HAR 분석 결과 기반)
        // x-anonuserid, x-challenge, x-signature는 봇으로 감지되므로 제외!

        // 1) 인터셉트된 헤더 기반(키 소문자 정규화)
        const normalizeKeys = (obj) => {
          const out = {}; if (!obj || typeof obj !== 'object') return out;
          for (const k of Object.keys(obj)) { out[String(k).toLowerCase()] = obj[k]; }
          return out;
        };
        const intercepted = normalizeKeys(window.__GROK_LAST_HEADERS__);

        // 2) 호출 측에서 지정한 헤더 유지(키 소문자 정규화) → x-xai-request-id 등 유지
        const callerHeaders = normalizeKeys(mergedOptions.headers);

        // 3) 보강 헤더: x-statsig-id, x-client-timezone 등(없을 때만 추가)
  const augmented = Object.assign({}, intercepted, callerHeaders);
        try {
          if (!('x-statsig-id' in augmented)) {
            const statsigKeys = ['STATSIG_STABLE_ID', 'statsig-id', 'statsig-stable-id', 'statsigStableID'];
            for (const key of statsigKeys) {
              const val = localStorage.getItem(key) || sessionStorage.getItem(key);
              if (val) { augmented['x-statsig-id'] = val; break; }
            }
          }
        } catch(e) {}
        try {
          if (!('x-client-timezone' in augmented)) {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (tz) augmented['x-client-timezone'] = tz;
          }
        } catch(e) {}
        try {
          if (!('accept-language' in augmented)) {
            const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).filter(Boolean)
            if (langs && langs.length) augmented['accept-language'] = langs.join(', ')
          }
        } catch(e) {}

        // Content-Type 보정: JSON 바디가 있으면 application/json으로 고정
        if (!('content-type' in augmented) && (typeof mergedOptions.body === 'string' || mergedOptions.body instanceof Blob)) {
          augmented['content-type'] = 'application/json';
        }
        if (!('accept' in augmented)) {
          augmented['accept'] = 'application/json, text/plain, */*';
        }

  mergedOptions.headers = augmented;
  console.log('[INPAGE-GROK] ✅ Using headers', Object.keys(augmented).join(', '));
        if (!Object.keys(intercepted).length) {
          console.warn('[INPAGE-GROK] ⚠️ No intercepted headers present (will rely on fallback/augmented)');
          console.warn('[INPAGE-GROK] 💡 Tip: Send a message on grok.com first to capture headers!');
        }
      }
      
      const resp = await fetch(url, mergedOptions);
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

  // Grok.com fetch 인터셉터: 실제 페이지가 보내는 요청의 헤더를 캡처
  console.log('[GROK-INTERCEPT] 🔍 Script loaded! Location:', location.hostname, location.href);

  // 중복 주입 방지
  if(window.__GROK_INTERCEPTOR_INSTALLED__){
    console.log('[GROK-INTERCEPT] ⚠️ Interceptor already installed, skipping');
    return;
  }

  // 다양한 Grok 도메인 지원 (grok.com, www.grok.com, x.com 등)
  const isGrokSite = location.hostname.includes('grok.com') || location.href.includes('grok.com');
  console.log('[GROK-INTERCEPT] 🌐 Is Grok site?', isGrokSite);

  if(isGrokSite){
    window.__GROK_INTERCEPTOR_INSTALLED__ = true;
    try{
      const originalFetch = window.fetch;
      window.fetch = function(...args){
        const [url, options] = args;
        const urlString = typeof url === 'string' ? url : (url?.toString?.() || '');
        if(urlString.includes('/rest/app-chat')){
          console.log('[GROK-INTERCEPT] 🎯 Captured Grok API request headers');
          console.log('[GROK-INTERCEPT] 📍 URL:', urlString);

          // ⚠️ CRITICAL FIX: 표준 HTTP 헤더 + 커스텀 헤더 모두 캡처
          // HAR 분석 결과, Content-Type/Origin/Referer가 필수!
          const capturedHeaders = {};

          // 1. 커스텀 헤더들 복사 (x-xai-request-id, x-statsig-id, sentry-trace 등)
          if(options && options.headers){
            Object.assign(capturedHeaders, options.headers);
          }

          // 2. 브라우저가 자동 추가하는 표준 헤더들을 명시적으로 포함
          // (이 헤더들은 options.headers에 없지만 Cloudflare가 검증함!)
          capturedHeaders['content-type'] = 'application/json';
          capturedHeaders['origin'] = location.origin; // https://grok.com
          capturedHeaders['referer'] = location.origin + '/'; // https://grok.com/

          window.__GROK_LAST_HEADERS__ = capturedHeaders;
          console.log('[GROK-INTERCEPT] 📝 Saved headers:', Object.keys(window.__GROK_LAST_HEADERS__).join(', '));
        }
        return originalFetch.apply(this, args);
      };
      console.log('[GROK-INTERCEPT] ✅ Fetch interceptor installed successfully');
    }catch(e){
      console.error('[GROK-INTERCEPT] ❌ Failed to install interceptor:', e.message, e);
    }
  } else {
    console.warn('[GROK-INTERCEPT] ⚠️ Not on Grok site, skipping interceptor');
  }
})();
