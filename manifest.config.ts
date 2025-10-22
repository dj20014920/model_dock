import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest(async () => {
  return {
    manifest_version: 3,
    name: '__MSG_appName__',
    description: '__MSG_appDesc__',
    default_locale: 'en',
    version: '1.45.24',
    icons: {
      '16': 'src/assets/icon.png',
      '32': 'src/assets/icon.png',
      '48': 'src/assets/icon.png',
      '128': 'src/assets/icon.png',
    },
    background: {
      service_worker: 'src/background/index.ts',
      type: 'module',
    },
    action: {},
    host_permissions: [
      'https://*.bing.com/',
      'https://*.openai.com/',
      'https://chatgpt.com/*',
      'https://bard.google.com/',
      'https://gemini.google.com/*',
      'https://*.chathub.gg/',
      'https://*.duckduckgo.com/',
      'https://*.poe.com/',
      'https://*.anthropic.com/',
      'https://*.claude.ai/',
      'https://*.perplexity.ai/',
      'https://chat.deepseek.com/*',
      'https://*.twitter.com/*',
      'https://*.x.com/*',
      'https://grok.com/*',
    ],
    optional_host_permissions: ['https://*/*', 'wss://*/*'],
    permissions: ['storage', 'unlimitedStorage', 'sidePanel', 'declarativeNetRequestWithHostAccess', 'scripting', 'tabs', 'cookies'],
    content_scripts: [
      {
        // 단일 블록으로 통합하여 CRX가 동적 모듈(WAR)을 모든 도메인에 일관되게 매핑하도록 함
        matches: [
          'https://chat.openai.com/*',
          'https://chatgpt.com/*',
          'https://claude.ai/*',
          'https://gemini.google.com/*',
          'https://chat.deepseek.com/*',
          'https://grok.com/*',
        ],
        js: ['src/content-script/chatgpt-inpage-proxy.ts'],
        run_at: 'document_start',
      },
    ],
    commands: {
      'open-app': {
        suggested_key: {
          default: 'Alt+J',
          windows: 'Alt+J',
          linux: 'Alt+J',
          mac: 'Command+J',
        },
        description: 'Open ChatHub app',
      },
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    declarative_net_request: {
      rule_resources: [
        {
          id: 'ruleset_bing',
          enabled: true,
          path: 'src/rules/bing.json',
        },
        {
          id: 'ruleset_ddg',
          enabled: true,
          path: 'src/rules/ddg.json',
        },
        {
          id: 'ruleset_qianwen',
          enabled: true,
          path: 'src/rules/qianwen.json',
        },
        {
          id: 'ruleset_baichuan',
          enabled: true,
          path: 'src/rules/baichuan.json',
        },
        {
          id: 'ruleset_pplx',
          enabled: true,
          path: 'src/rules/pplx.json',
        },
      ],
    },
    web_accessible_resources: [
      {
        // 페이지 주입 스크립트(브리지). 동적 URL을 끄고 정적 EXTID 경로로 고정시켜
        // 하위 모듈이 상대 경로로 불러올 때 차단되지 않도록 한다.
        // ✅ Turnstile 우회형 크롤링을 일반 사이트에도 재사용하기 위해 범위를 확대한다.
        resources: ['js/inpage-fetch-bridge.js'],
        // 기존: chatgpt 한정 → 변경: 일반 https 도메인 전역 허용
        matches: ['https://*/*'],
        use_dynamic_url: false,
      },
      {
        // 브리지가 불러오는 모듈 번들들. 정적 경로로 노출 필요.
        resources: [
          'assets/browser-polyfill-*.js',
          'assets/proxy-fetch-*.js',
          'assets/chatgpt-inpage-proxy.ts-*.js',
        ],
        matches: [
          'https://chatgpt.com/*',
          'https://chat.openai.com/*',
          'https://claude.ai/*',
          'https://gemini.google.com/*',
          'https://chat.deepseek.com/*',
          'https://grok.com/*',
        ],
        use_dynamic_url: false,
      },
    ],
  }
})
