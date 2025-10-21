/**
 * 🔥 PROOF OF WORK CALCULATOR
 * 
 * OpenAI Sentinel POW 계산
 * - SHA-256 브루트포스로 nonce 찾기
 * - difficulty보다 작은 해시 찾을 때까지 반복
 * - 결과를 Base64 인코딩하여 반환
 * 
 * Uses Web Crypto API (native browser crypto)
 */

export interface POWResult {
  proof: string // Base64 encoded proof token
  nonce: string // Hex nonce that solved the challenge
  hash: string // Resulting SHA-256 hash
  attempts: number // Number of hashes calculated
  timeMs: number // Time taken in milliseconds
}

/**
 * Calculate SHA-256 hash using Web Crypto API
 */
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

/**
 * Calculate Proof of Work for OpenAI Sentinel
 * 
 * @param seed - Random seed from Sentinel response (e.g., "0.6308142887179851")
 * @param difficulty - Target difficulty as hex string (e.g., "07a120")
 * @param proofData - Browser fingerprint data (p parameter from getSentinel)
 * @returns POW result with proof token
 */
export async function calculateProofOfWork(
  seed: string,
  difficulty: string,
  proofData: string
): Promise<POWResult> {
  const startTime = Date.now()
  
  // Parse difficulty as hex number (target threshold)
  const targetDifficulty = parseInt(difficulty, 16)
  console.log(`[POW] 🔨 Starting POW calculation`)
  console.log(`[POW] Seed: ${seed}`)
  console.log(`[POW] Difficulty: ${difficulty} (${targetDifficulty})`)
  console.log(`[POW] Browser proof data length: ${proofData.length}`)
  
  let nonce = 0
  let hash = ''
  let attempts = 0
  const maxAttempts = 10000000 // 10M attempts max (prevents infinite loop)
  
  // Brute force: try nonces until we find a hash that meets difficulty
  while (attempts < maxAttempts) {
    // Format: seed + nonce (as hex)
    const input = seed + nonce.toString(16).padStart(8, '0')
    
    // Calculate SHA-256 hash using Web Crypto API
    hash = await sha256(input)
    
    // Check if hash starts with enough leading zeros (difficulty)
    const hashPrefix = hash.substring(0, 6) // First 6 hex chars (3 bytes)
    const hashValue = parseInt(hashPrefix, 16)
    
    if (hashValue <= targetDifficulty) {
      // Found valid proof!
      const elapsedMs = Date.now() - startTime
      console.log(`[POW] ✅ Found valid proof!`)
      console.log(`[POW] Nonce: ${nonce} (0x${nonce.toString(16)})`)
      console.log(`[POW] Hash: ${hash}`)
      console.log(`[POW] Hash prefix: ${hashPrefix} (${hashValue} <= ${targetDifficulty})`)
      console.log(`[POW] Attempts: ${attempts + 1}`)
      console.log(`[POW] Time: ${elapsedMs}ms (${(elapsedMs / 1000).toFixed(2)}s)`)
      
      // Format proof token: JSON array [timestamp, nonce, difficulty, hash_prefix]
      const proofToken = JSON.stringify([
        new Date().toISOString(),
        nonce.toString(16),
        difficulty,
        hashPrefix
      ])
      
      // Base64 encode the proof token
      const proof = btoa(proofToken)
      
      return {
        proof,
        nonce: nonce.toString(16),
        hash,
        attempts: attempts + 1,
        timeMs: elapsedMs
      }
    }
    
    nonce++
    attempts++
    
    // Log progress every 100k attempts
    if (attempts % 100000 === 0) {
      const elapsedMs = Date.now() - startTime
      const hashRate = attempts / (elapsedMs / 1000)
      console.log(`[POW] ⏳ ${attempts.toLocaleString()} attempts (${hashRate.toFixed(0)} H/s)...`)
    }
  }
  
  // Failed to find proof within max attempts
  const elapsedMs = Date.now() - startTime
  console.error(`[POW] ❌ Failed to find proof after ${maxAttempts.toLocaleString()} attempts (${elapsedMs}ms)`)
  throw new Error(`POW calculation failed: max attempts (${maxAttempts}) reached`)
}

/**
 * Calculate POW with timeout
 * 
 * @param seed - Random seed
 * @param difficulty - Target difficulty
 * @param proofData - Browser fingerprint
 * @param timeoutMs - Timeout in milliseconds (default: 30000ms = 30s)
 * @returns POW result or throws timeout error
 */
export async function calculateProofOfWorkWithTimeout(
  seed: string,
  difficulty: string,
  proofData: string,
  timeoutMs: number = 30000
): Promise<POWResult> {
  return Promise.race([
    calculateProofOfWork(seed, difficulty, proofData),
    new Promise<POWResult>((_, reject) =>
      setTimeout(() => reject(new Error('POW calculation timeout')), timeoutMs)
    )
  ])
}
