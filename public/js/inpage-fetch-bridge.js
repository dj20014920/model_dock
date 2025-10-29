(function(){
  // 🔍 CRITICAL: Bridge 로딩 플래그 및 즉시 로그 출력
  console.log('[INPAGE-BRIDGE] 🚀 Bridge script is loading...', location.href);
  window.__INPAGE_FETCH_BRIDGE_LOADED__ = true;

  function headersToObject(headers){
    const obj = {};
    try{ for(const [k,v] of headers.entries()) obj[k] = v }catch(e){}
    return obj;
  }
  const pending = new Map();

  // DeepSeek WASM solver hook -------------------------------------------------
  (function installDeepSeekWasmHook(){
    if (window.__DEEPSEEK_WASM_HOOK_INSTALLED__) return;
    window.__DEEPSEEK_WASM_HOOK_INSTALLED__ = true;

    const encoder = new TextEncoder();
    const SOLVER_EXPORT_CANDIDATES = ['wasm_solve', 'wasm_deepseek_hash_v1'];

    const tryAttachSolverFromInstance = (instanceLike) => {
      if (!instanceLike) return false;
      if (!location.hostname.includes('deepseek.com')) return false;
      const exports = instanceLike.exports || (instanceLike.instance && instanceLike.instance.exports);
      if (!exports || typeof exports !== 'object') return false;
      if (window.__deepseek_pow_solver) return false;

      const solverExportName = SOLVER_EXPORT_CANDIDATES.find((name) => typeof exports[name] === 'function');
      if (!solverExportName) return false;

      const wasmSolve = exports[solverExportName];
      const memory = exports.memory;
      const addToStackPointer = exports.__wbindgen_add_to_stack_pointer;
      const allocate = exports.__wbindgen_export_0;

      if (!(memory instanceof WebAssembly.Memory)) return false;
      if (typeof addToStackPointer !== 'function' || typeof allocate !== 'function') return false;

      const writeString = (text) => {
        const encoded = encoder.encode(String(text ?? ''));
        const ptr = allocate(encoded.length, 1) >>> 0;
        const memView = new Uint8Array(memory.buffer);
        memView.set(encoded, ptr);
        return { ptr, len: encoded.length };
      };

      const solver = async (challenge) => {
        if (!challenge || typeof challenge.challenge !== 'string' || typeof challenge.salt !== 'string') {
          throw new Error('INVALID_CHALLENGE_PAYLOAD');
        }
        if (typeof challenge.expire_at !== 'number') {
          throw new Error('MISSING_EXPIRE_AT');
        }
        const prefix = `${challenge.salt}_${challenge.expire_at}_`;
        const difficulty = Number(challenge.difficulty);
        if (!Number.isFinite(difficulty)) {
          throw new Error('INVALID_DIFFICULTY');
        }

        const retptr = addToStackPointer(-16) >>> 0;
        let challengeBuf, prefixBuf;
        try {
          challengeBuf = writeString(challenge.challenge);
          prefixBuf = writeString(prefix);
          wasmSolve(
            retptr,
            challengeBuf.ptr,
            challengeBuf.len,
            prefixBuf.ptr,
            prefixBuf.len,
            difficulty
          );
          const view = new DataView(memory.buffer);
          const status = view.getInt32(retptr, true);
          if (status !== 1) {
            throw new Error('POW_SOLVER_STATUS_FAIL');
          }
          const value = view.getFloat64(retptr + 8, true);
          if (!Number.isFinite(value)) {
            throw new Error('POW_SOLVER_INVALID_RESULT');
          }
          return Math.trunc(value);
        } finally {
          addToStackPointer(16);
        }
      };

      window.__deepseek_pow_solver = solver;
      window.__deepseek_pow_solver_attached__ = {
        export: solverExportName,
        attachedAt: new Date().toISOString()
      };
      console.log('[DEEPSEEK-POW] ✅ Native WASM solver attached via exports:', solverExportName);
      return true;
    };

    const decoratePromiseResult = (promise) => {
      if (!promise || typeof promise.then !== 'function') return promise;
      return promise.then((result) => {
        tryAttachSolverFromInstance(result);
        return result;
      });
    };

    const originalInstantiate = WebAssembly.instantiate;
    WebAssembly.instantiate = function patchedInstantiate(...args){
      const maybePromise = originalInstantiate.apply(this, args);
      if (maybePromise && typeof maybePromise.then === 'function') {
        return decoratePromiseResult(maybePromise);
      }
      tryAttachSolverFromInstance(maybePromise);
      return maybePromise;
    };

    const originalInstantiateStreaming = WebAssembly.instantiateStreaming;
    if (originalInstantiateStreaming) {
      WebAssembly.instantiateStreaming = function patchedInstantiateStreaming(...args){
        const maybePromise = originalInstantiateStreaming.apply(this, args);
        return decoratePromiseResult(maybePromise);
      };
    }
  })();

  // 🔍 CRITICAL: addEventListener 등록 확인
  console.log('[INPAGE-BRIDGE] 📡 Registering message listener...', location.href);

  window.addEventListener('message', async (ev) => {
    const msg = ev.data;

    // 🔍 모든 메시지 로깅 (디버깅용)
    if (msg && msg.type && msg.type.startsWith('INPAGE')) {
      console.log('[INPAGE-BRIDGE] 📨 Received message:', msg.type, { requestId: msg.requestId, url: msg.url?.substring(0, 50) });
    }

    if(!msg || msg.type !== 'INPAGE_FETCH') return;
    const { requestId, url, options } = msg;
    try{
      // 🔍 DEEP DEBUG: 요청 전 상태 로깅
      console.log('[INPAGE-DEBUG] 📍 Location:', location.href);
      console.log('[INPAGE-DEBUG] 🍪 Cookies:', document.cookie ? 'EXISTS (length: ' + document.cookie.length + ')' : 'EMPTY');
      console.log('[INPAGE-DEBUG] 📨 Request URL:', url);
      console.log('[INPAGE-DEBUG] ⚙️ Original options:', JSON.stringify(options));

      // Grok.com 요청 시 자동으로 필수 헤더/옵션 보강
      const mergedOptions = Object.assign({}, options || {}, { credentials: 'include' });
      try {
        // 브라우저 기본 동작과 최대한 일치시키기 위해 referrer/정책/모드/언어를 명시
        if (!('referrer' in mergedOptions)) mergedOptions.referrer = document.referrer || location.href;
        if (!('referrerPolicy' in mergedOptions)) mergedOptions.referrerPolicy = 'strict-origin-when-cross-origin';
        // CRITICAL: same-origin 모드는 크로스 도메인 요청 차단하므로 제거
        // credentials: 'include'가 있으면 쿠키 전달됨
        // if (!('mode' in mergedOptions)) mergedOptions.mode = 'same-origin';
      } catch(e) {}

      console.log('[INPAGE-DEBUG] ✅ Final options:', JSON.stringify({
        method: mergedOptions.method,
        credentials: mergedOptions.credentials,
        mode: mergedOptions.mode,
        headers: Object.keys(mergedOptions.headers || {})
      }));
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

      // DeepSeek API 요청 처리 (필수 헤더 + 선택적 PoW)
      if (url && url.includes('deepseek.com/api/v0/')) {
        console.log('[INPAGE-DEEPSEEK] 🔐 DeepSeek API request detected:', url);

        // 1) 항상 x-app-* 클라이언트 헤더 부여 (Missing Token 방지)
        //    PoW 성공 여부와 무관하게 추가해야 chat_session/create가 정상 동작함
        mergedOptions.headers = mergedOptions.headers || {};
        if (!('x-app-version' in mergedOptions.headers)) mergedOptions.headers['x-app-version'] = '20241129.1';
        if (!('x-client-locale' in mergedOptions.headers)) mergedOptions.headers['x-client-locale'] = 'en_US';
        if (!('x-client-platform' in mergedOptions.headers)) mergedOptions.headers['x-client-platform'] = 'web';
        if (!('x-client-version' in mergedOptions.headers)) mergedOptions.headers['x-client-version'] = '1.5.0';

        // 2) PoW가 필요한 엔드포인트에만 PoW 수행 (completion)
        const isCompletion = url.includes('/completion');
        if (isCompletion) {
          try {
            // 2-1. PoW 챌린지 요청 (target_path는 completion 고정)
            console.log('[INPAGE-DEEPSEEK] 📡 Requesting PoW challenge...');
            const challengeResp = await fetch('https://chat.deepseek.com/api/v0/chat/create_pow_challenge', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ target_path: '/api/v0/chat/completion' })
            });

            const challengeData = await challengeResp.json();
            console.log('[INPAGE-DEEPSEEK] 📦 Challenge response:', JSON.stringify(challengeData).substring(0, 200));

            if (challengeData.code === 0 && challengeData.data?.biz_data?.challenge) {
              const challenge = challengeData.data.biz_data.challenge;
              console.log('[INPAGE-DEEPSEEK] 🔍 Challenge received:', challenge.algorithm, 'difficulty:', challenge.difficulty);

              // 2-2. PoW 계산 (DeepSeek 페이지의 네이티브 솔버 우선 사용)
              const answer = await solveDeepSeekPoW(challenge);
              console.log('[INPAGE-DEEPSEEK] ✅ PoW solved! Answer:', answer);

              // 2-3. PoW 응답 생성 및 헤더 부여
              const powResponse = {
                algorithm: challenge.algorithm,
                challenge: challenge.challenge,
                salt: challenge.salt,
                answer: answer,
                signature: challenge.signature,
                target_path: challenge.target_path
              };
              const powResponseBase64 = btoa(JSON.stringify(powResponse));
              console.log('[INPAGE-DEEPSEEK] 📝 PoW response prepared (length:', powResponseBase64.length, ')');
              mergedOptions.headers['x-ds-pow-response'] = powResponseBase64;
              console.log('[INPAGE-DEEPSEEK] 🚀 Request with PoW header ready');
            } else {
              console.warn('[INPAGE-DEEPSEEK] ⚠️ Challenge request failed or no challenge received');
            }
          } catch (e) {
            console.error('[INPAGE-DEEPSEEK] ❌ PoW challenge/solve failed:', e.message);
            // 실패해도 계속 진행: 서버에서 자체 처리 가능
          }
        }
      }

      console.log('[INPAGE-DEBUG] 🚀 Sending fetch request...');
      const resp = await fetch(url, mergedOptions);
      console.log('[INPAGE-DEBUG] 📥 Response received:', resp.status, resp.statusText);
      console.log('[INPAGE-DEBUG] 📋 Response headers:', JSON.stringify(headersToObject(resp.headers)));

      const meta = { status: resp.status, statusText: resp.statusText, headers: headersToObject(resp.headers) };
      window.postMessage({ type: 'INPAGE_FETCH_META', requestId, meta }, location.origin);
      const body = resp.body;
      if(!body){
        const text = await resp.text().catch(()=> '');
        console.log('[INPAGE-DEBUG] 📄 Response body (no stream):', text.substring(0, 500));
        window.postMessage({ type: 'INPAGE_FETCH_CHUNK', requestId, value: text, done: true }, location.origin);
        return;
      }
      const reader = body.getReader();
      pending.set(requestId, reader);
      const decoder = new TextDecoder();
      let firstChunk = true;
      while(true){
        const {done, value} = await reader.read();
        if(done){
          window.postMessage({ type: 'INPAGE_FETCH_CHUNK', requestId, done: true }, location.origin);
          pending.delete(requestId);
          break;
        }
        const decodedValue = decoder.decode(value);
        if(firstChunk) {
          console.log('[INPAGE-DEBUG] 📄 First chunk:', decodedValue.substring(0, 500));
          firstChunk = false;
        }
        window.postMessage({ type: 'INPAGE_FETCH_CHUNK', requestId, value: decodedValue, done: false }, location.origin);
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

  // DeepSeek PoW Solver
  // DeepSeekHashV1 알고리즘 구현
  async function solveDeepSeekPoW(challenge) {
    const { challenge: challengeHash, salt, difficulty } = challenge;

    console.log('[DEEPSEEK-POW] 🔨 Starting PoW calculation...');
    console.log('[DEEPSEEK-POW] Challenge:', challengeHash);
    console.log('[DEEPSEEK-POW] Salt:', salt);
    console.log('[DEEPSEEK-POW] Difficulty:', difficulty);

    // DeepSeek PoW는 브루트포스 방식
    // challenge + salt + answer를 해시하여 difficulty보다 작은 값을 찾기

    if (window.__deepseek_pow_solver) {
      console.log('[DEEPSEEK-POW] ✅ Using DeepSeek native solver');
      return await window.__deepseek_pow_solver(challenge);
    }

    console.error('[DEEPSEEK-POW] ❌ Native solver unavailable');
    throw new Error('DEEPSEEK_NATIVE_SOLVER_NOT_AVAILABLE');
  }

  // DeepSeek 웹사이트의 네이티브 솔버 감지 및 래핑
  if (location.hostname.includes('deepseek.com')) {
    console.log('[DEEPSEEK-POW] 🔍 Attempting to detect native PoW solver...');

    // DeepSeek의 실제 PoW 솔버 찾기 (웹사이트에서 사용하는 함수)
    const checkForSolver = () => {
      // DeepSeek 웹사이트의 전역 객체에서 PoW 관련 함수 찾기
      try {
        // 일반적인 패턴들 시도
        const possiblePaths = [
          'window.solvePoW',
          'window.deepseek.solvePoW',
          'window.__DEEPSEEK_POW__',
          'window.DS_POW'
        ];

        for (const path of possiblePaths) {
          const solver = eval(path);
          if (typeof solver === 'function') {
            console.log('[DEEPSEEK-POW] ✅ Found native solver at:', path);
            window.__deepseek_pow_solver = solver;
            return true;
          }
        }
      } catch (e) {
        // 무시
      }
      return false;
    };

    // 즉시 시도
    if (!checkForSolver()) {
      // 페이지 로드 후 재시도
      setTimeout(() => {
        if (checkForSolver()) {
          console.log('[DEEPSEEK-POW] ✅ Native solver detected after delay');
        } else {
          console.warn('[DEEPSEEK-POW] ⚠️ Native solver not found, will use fallback');
        }
      }, 2000);
    }
  }
})();
