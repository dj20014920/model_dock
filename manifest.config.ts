import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest(async () => {
  return {
    manifest_version: 3,
    name: '__MSG_appName__',
    description: '__MSG_appDesc__',
    default_locale: 'en',
    version: '1.45.16',
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
    ],
    optional_host_permissions: ['https://*/*', 'wss://*/*'],
    permissions: ['storage', 'unlimitedStorage', 'sidePanel', 'declarativeNetRequestWithHostAccess', 'scripting', 'tabs'],
    content_scripts: [
      {
        // 단일 블록으로 통합하여 CRX가 동적 모듈(WAR)을 모든 도메인에 일관되게 매핑하도록 함
        matches: [
          'https://chat.openai.com/*',
          'https://chatgpt.com/*',
          'https://claude.ai/*',
          'https://gemini.google.com/*',
          'https://chat.deepseek.com/*',
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
        // 404 에러 방지: 빌드 후 실제 경로는 js/inpage-fetch-bridge.js만 존재
        resources: ['js/inpage-fetch-bridge.js'],
        matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
        use_dynamic_url: true,
      },
    ],
  }
})
