import { arkoseTokenGenerator } from './generator'
import { fetchArkoseToken } from './server'

export async function getArkoseToken() {
  console.log('[ARKOSE] 🎫 Starting Arkose token acquisition...')
  
  try {
    // 3초 타임아웃 설정 (background fetch에서는 enforcement 로드 안되므로 빠르게 스킵)
    const timeout = new Promise<undefined>((resolve) => {
      setTimeout(() => {
        console.log('[ARKOSE] ⏰ Timeout - enforcement not ready in 3s (expected in background mode)')
        resolve(undefined)
      }, 3000)
    })
    
    const tokenPromise = arkoseTokenGenerator.generate()
    const token = await Promise.race([tokenPromise, timeout])
    
    if (token) {
      console.log('[ARKOSE] ✅ Token obtained:', token.substring(0, 20) + '...')
      return token
    }
    
    console.log('[ARKOSE] ⚠️ No token from generator, trying server (will return undefined)...')
    const serverToken = await fetchArkoseToken()
    console.log('[ARKOSE] ℹ️ Server token result:', serverToken ? 'yes' : 'no')
    return serverToken
  } catch (error) {
    console.error('[ARKOSE] ❌ Error:', error)
    return undefined
  }
}
