import { AsyncAbstractBot } from '../abstract-bot'
import { CopilotWebBot } from '../copilot-web'
import { BingWebBot } from '../bing'
import { CopilotMode, getUserConfig } from '~/services/user-config'

/**
 * Copilot 통합 봇
 *
 * ✅ 현재 상태: WebSocket Intercept 방식으로 구현 완료
 *
 * 구현 방식:
 * - Content Script를 통한 WebSocket 연결 (Same-Origin 쿠키 인증)
 * - copilot.microsoft.com 페이지 내에서 WebSocket 생성
 * - Message passing으로 Extension과 통신
 *
 * 파일:
 * - src/content-script/copilot-websocket-interceptor.ts
 * - src/content-script/copilot-bridge.ts
 * - src/app/bots/copilot-web/index.ts
 *
 * 참고: .kiro/COPILOT_REAL_SOLUTION.md
 */
export class CopilotBot extends AsyncAbstractBot {
  async initializeBot() {
    const { copilotMode } = await getUserConfig()

    if (copilotMode === CopilotMode.Webapp) {
      console.log('[Copilot] ✅ Using CopilotWebBot with WebSocket Intercept pattern')
      return new CopilotWebBot()
    }

    // 레거시 Bing 봇 (사용자가 Legacy 모드를 선택한 경우)
    console.log('[Copilot] ℹ️ Using BingWebBot (Legacy mode)')
    return new BingWebBot()
  }
}
