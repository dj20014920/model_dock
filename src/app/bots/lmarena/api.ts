/**
 * LM Arena API 유틸리티
 * 최신 모델 목록을 동적으로 가져오는 기능
 */

import { LMArenaModel } from './index'

export interface ModelInfo {
  id: string
  name: string
  organization: string
  description?: string
  isAvailable: boolean
  price?: {
    input: string
    output: string
  }
  license?: string
}

/**
 * LM Arena에서 사용 가능한 최신 모델 목록 가져오기
 * 다중 소스 전략: 라이브 리더보드 → Hugging Face CSV → arena-catalog → 로컬 캐시 → 기본 목록
 */
export async function fetchAvailableModels(): Promise<ModelInfo[]> {
  try {
    // 1차 시도: 실시간 리더보드 HTML 파싱 (최신 모델)
    console.log('[LMArena] 🔥 Fetching from live leaderboard HTML...')
    const liveModels = await fetchFromLiveLeaderboard()
    if (liveModels.length > 0) {
      console.log(`[LMArena] ✅ Loaded ${liveModels.length} models from live leaderboard`)
      return liveModels
    }

    // 2차 시도: Hugging Face 최신 CSV
    console.warn('[LMArena] Live leaderboard failed, trying HF CSV...')
    const hfModels = await fetchFromHuggingFaceCSV()
    if (hfModels.length > 0) {
      console.log(`[LMArena] ✅ Loaded ${hfModels.length} models from Hugging Face CSV`)
      return hfModels
    }

    // 3차 시도: GitHub arena-catalog JSON
    console.warn('[LMArena] HF CSV failed, trying arena-catalog...')
    const catalogModels = await fetchFromArenaCatalog()
    if (catalogModels.length > 0) {
      console.log(`[LMArena] ✅ Loaded ${catalogModels.length} models from arena-catalog`)
      return catalogModels
    }

    // 4차 시도: 커뮤니티 CSV (백업)
    console.warn('[LMArena] arena-catalog failed, trying community CSV...')
    const csvModels = await fetchFromCommunityCsv()
    if (csvModels.length > 0) {
      console.log(`[LMArena] ✅ Loaded ${csvModels.length} models from community CSV`)
      return csvModels
    }

    // 5차 시도: 로컬 캐시
    const cached = getCachedModels()
    if (cached.length > 0) {
      console.warn(`[LMArena] ⚠️ Using cached models (${cached.length})`)
      return cached
    }

    // 최종 폴백: 하드코딩된 기본 목록
    console.warn('[LMArena] ⚠️ Using fallback default models')
    return getDefaultModels()
  } catch (error) {
    console.error('[LMArena] ❌ Failed to fetch models:', error)
    return getDefaultModels()
  }
}

/**
 * 실시간 리더보드 HTML에서 모델 목록 파싱 (1차 소스 - 최신)
 * Claude 4, GPT-5 등 최신 모델 포함
 */
async function fetchFromLiveLeaderboard(): Promise<ModelInfo[]> {
  try {
    const response = await fetch('https://lmarena.ai/leaderboard', {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      cache: 'no-store',
    })

    if (!response.ok) return []

    const html = await response.text()
    
    // title 속성에서 모델 이름 추출
    const titleRegex = /title="([^"]+)"/g
    const matches = [...html.matchAll(titleRegex)]
    
    const modelNames = new Set<string>()
    const models: ModelInfo[] = []

    for (const match of matches) {
      const name = match[1]
      
      // 모델 이름으로 보이는 것만 필터링
      if (
        name.includes('GPT') ||
        name.includes('Claude') ||
        name.includes('Gemini') ||
        name.includes('DeepSeek') ||
        name.includes('Qwen') ||
        name.includes('GLM') ||
        name.includes('Grok') ||
        name.includes('Llama') ||
        name.includes('Mistral')
      ) {
        // 중복 제거
        if (!modelNames.has(name)) {
          modelNames.add(name)
          
          // ID 생성 (소문자, 공백을 하이픈으로)
          const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[()]/g, '')
          
          models.push({
            id,
            name,
            organization: extractOrganization(name),
            isAvailable: true,
          })
        }
      }
    }

    console.log('[LMArena] 🎯 Parsed models from HTML:', models.slice(0, 10).map(m => m.name))
    return models
  } catch (error) {
    console.error('[LMArena] Live leaderboard parse failed:', error)
    return []
  }
}

/**
 * Hugging Face Space의 최신 CSV에서 모델 목록 가져오기 (1차 소스)
 * 가장 최신 데이터를 제공하는 공식 소스
 */
async function fetchFromHuggingFaceCSV(): Promise<ModelInfo[]> {
  try {
    // 최신 CSV 파일 찾기 (역순으로 시도)
    const today = new Date()
    const dates: string[] = []
    
    // 최근 30일 시도
    for (let i = 0; i < 30; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
      dates.push(dateStr)
    }

    for (const dateStr of dates) {
      const csvUrl = `https://huggingface.co/spaces/lmarena-ai/lmarena-leaderboard/raw/main/leaderboard_table_${dateStr}.csv`
      
      try {
        const response = await fetch(csvUrl, {
          headers: { 'Accept': 'text/csv' },
          cache: 'no-store',
        })

        if (response.ok) {
          const csvText = await response.text()
          const models = parseHuggingFaceCSV(csvText)
          
          if (models.length > 0) {
            console.log(`[LMArena] Found CSV from ${dateStr}`)
            return models
          }
        }
      } catch {
        continue
      }
    }

    return []
  } catch (error) {
    console.error('[LMArena] HF CSV fetch failed:', error)
    return []
  }
}

/**
 * Hugging Face CSV 파싱
 */
function parseHuggingFaceCSV(csvText: string): ModelInfo[] {
  try {
    const lines = csvText.split('\n').filter(line => line.trim())
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map(h => h.trim())
    const keyIdx = headers.findIndex(h => h.toLowerCase() === 'key')
    const modelIdx = headers.findIndex(h => h.toLowerCase() === 'model')
    const orgIdx = headers.findIndex(h => h.toLowerCase() === 'organization')
    const licenseIdx = headers.findIndex(h => h.toLowerCase() === 'license')

    if (keyIdx === -1 && modelIdx === -1) return []

    const models: ModelInfo[] = []
    
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim())
      const key = keyIdx !== -1 ? cols[keyIdx] : cols[modelIdx]
      const name = modelIdx !== -1 ? cols[modelIdx] : key
      const org = orgIdx !== -1 ? cols[orgIdx] : extractOrganization(name)
      const license = licenseIdx !== -1 ? cols[licenseIdx] : undefined

      if (key && name) {
        models.push({
          id: key,
          name,
          organization: org || 'Other',
          isAvailable: true,
          license,
        })
      }
    }

    return models
  } catch (error) {
    console.error('[LMArena] HF CSV parse failed:', error)
    return []
  }
}

/**
 * GitHub arena-catalog에서 모델 목록 가져오기 (2차 소스)
 */
async function fetchFromArenaCatalog(): Promise<ModelInfo[]> {
  try {
    const catalogUrl = 'https://raw.githubusercontent.com/lmarena/arena-catalog/main/data/scatterplot-data.json'
    
    const response = await fetch(catalogUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    })

    if (!response.ok) return []

    const data = await response.json()
    
    if (Array.isArray(data)) {
      return data
        .filter(item => item.model_api_name && item.name)
        .map(item => ({
          id: item.model_api_name,
          name: item.name,
          organization: item.organization || extractOrganization(item.name),
          description: item.model_source || undefined,
          isAvailable: true,
          price: item.input_token_price && item.output_token_price ? {
            input: item.input_token_price,
            output: item.output_token_price,
          } : undefined,
          license: item.license || undefined,
        }))
    }

    return []
  } catch (error) {
    console.error('[LMArena] arena-catalog fetch failed:', error)
    return []
  }
}

/**
 * 커뮤니티 CSV에서 모델 목록 가져오기 (백업 방법)
 */
async function fetchFromCommunityCsv(): Promise<ModelInfo[]> {
  try {
    // GitHub API로 최신 릴리스 확인
    const releaseUrl = 'https://api.github.com/repos/fboulnois/llm-leaderboard-csv/releases/latest'
    const releaseRes = await fetch(releaseUrl, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
    })

    if (!releaseRes.ok) return []

    const release = await releaseRes.json()
    const csvAsset = release.assets?.find((a: any) => a.name.endsWith('.csv'))
    
    if (!csvAsset) return []

    // CSV 다운로드 및 파싱
    const csvRes = await fetch(csvAsset.browser_download_url)
    const csvText = await csvRes.text()
    
    return parseCsvToModels(csvText)
  } catch (error) {
    console.error('[LMArena] Failed to fetch from community CSV:', error)
    return []
  }
}

/**
 * CSV 텍스트를 모델 목록으로 파싱
 */
function parseCsvToModels(csvText: string): ModelInfo[] {
  try {
    const lines = csvText.split('\n').filter(line => line.trim())
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map(h => h.trim())
    const nameIdx = headers.findIndex(h => h.toLowerCase().includes('model'))
    const keyIdx = headers.findIndex(h => h.toLowerCase().includes('key') || h.toLowerCase().includes('id'))

    if (nameIdx === -1) return []

    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim())
      const name = cols[nameIdx]
      const id = keyIdx !== -1 ? cols[keyIdx] : name.toLowerCase().replace(/\s+/g, '-')

      return {
        id,
        name,
        organization: extractOrganization(name),
        isAvailable: true,
      }
    }).filter(m => m.id && m.name)
  } catch (error) {
    console.error('[LMArena] Failed to parse CSV:', error)
    return []
  }
}

/**
 * 모델 이름에서 조직명 추출
 */
function extractOrganization(modelName: string): string {
  const name = modelName.toLowerCase()
  
  if (name.includes('gpt') || name.includes('openai')) return 'OpenAI'
  if (name.includes('claude')) return 'Anthropic'
  if (name.includes('gemini') || name.includes('gemma')) return 'Google'
  if (name.includes('llama')) return 'Meta'
  if (name.includes('deepseek')) return 'DeepSeek'
  if (name.includes('qwen') || name.includes('qwq')) return 'Alibaba'
  if (name.includes('glm')) return 'Zhipu AI'
  if (name.includes('grok')) return 'xAI'
  if (name.includes('mistral') || name.includes('mixtral')) return 'Mistral AI'
  if (name.includes('kimi')) return 'Moonshot AI'
  if (name.includes('hunyuan')) return 'Tencent'
  if (name.includes('yi')) return '01.AI'
  if (name.includes('nova')) return 'Amazon'
  if (name.includes('command')) return 'Cohere'
  if (name.includes('reka')) return 'Reka AI'
  if (name.includes('jamba')) return 'AI21 Labs'
  if (name.includes('nemotron')) return 'NVIDIA'
  if (name.includes('granite')) return 'IBM'
  if (name.includes('phi')) return 'Microsoft'
  
  return 'Other'
}

/**
 * 로컬 스토리지에서 캐시된 모델 가져오기
 */
function getCachedModels(): ModelInfo[] {
  try {
    const cached = localStorage.getItem('lmarena_models_cache')
    if (!cached) return []

    const data = JSON.parse(cached)
    const age = Date.now() - (data.timestamp || 0)
    
    // 캐시가 24시간 이내면 사용
    if (age < 24 * 60 * 60 * 1000 && Array.isArray(data.models)) {
      return data.models
    }
  } catch (error) {
    console.error('[LMArena] Failed to read cache:', error)
  }
  return []
}

/**
 * 모델 목록을 로컬 스토리지에 캐시
 */
export function cacheModels(models: ModelInfo[]): void {
  try {
    localStorage.setItem('lmarena_models_cache', JSON.stringify({
      timestamp: Date.now(),
      models,
    }))
  } catch (error) {
    console.error('[LMArena] Failed to cache models:', error)
  }
}

/**
 * 기본 모델 목록 (fallback) - 2025년 최신 LM Arena 리더보드 기준
 */
function getDefaultModels(): ModelInfo[] {
  return [
    // OpenAI - Top Tier
    { id: 'gpt-5-high', name: 'GPT-5 High', organization: 'OpenAI', isAvailable: true },
    { id: 'gpt-4.5-preview-2025-02-27', name: 'GPT-4.5 Preview', organization: 'OpenAI', isAvailable: true },
    { id: 'gpt-4.1-2025-04-14', name: 'GPT-4.1', organization: 'OpenAI', isAvailable: true },
    { id: 'chatgpt-4o-latest-20250326', name: 'ChatGPT-4o Latest', organization: 'OpenAI', isAvailable: true },
    { id: 'o3-2025-04-16', name: 'o3', organization: 'OpenAI', isAvailable: true },
    { id: 'o1-2024-12-17', name: 'o1', organization: 'OpenAI', isAvailable: true },
    
    // Anthropic - Claude 4 Series
    { id: 'claude-opus-4-1-20250805-thinking-16k', name: 'Claude Opus 4.1 Thinking', organization: 'Anthropic', isAvailable: true },
    { id: 'claude-sonnet-4-5-20250929-thinking-32k', name: 'Claude Sonnet 4.5 Thinking', organization: 'Anthropic', isAvailable: true },
    { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1', organization: 'Anthropic', isAvailable: true },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', organization: 'Anthropic', isAvailable: true },
    
    // Google - Gemini 2.5
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', organization: 'Google', isAvailable: true },
    { id: 'gemini-2.5-flash-preview-09-2025', name: 'Gemini 2.5 Flash', organization: 'Google', isAvailable: true },
    { id: 'gemini-1.5-pro-001', name: 'Gemini 1.5 Pro', organization: 'Google', isAvailable: true },
    
    // Meta - Llama 4 & 3.3
    { id: 'llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', organization: 'Meta', isAvailable: true },
    { id: 'llama-3.3-70b-instruct', name: 'Llama 3.3 70B', organization: 'Meta', isAvailable: true },
    { id: 'llama-3.1-405b-instruct-bf16', name: 'Llama 3.1 405B', organization: 'Meta', isAvailable: true },
    
    // DeepSeek - Latest
    { id: 'deepseek-v3.2-exp-thinking', name: 'DeepSeek V3.2 Exp Thinking', organization: 'DeepSeek', isAvailable: true },
    { id: 'deepseek-v3.1', name: 'DeepSeek V3.1', organization: 'DeepSeek', isAvailable: true },
    { id: 'deepseek-r1-0528', name: 'DeepSeek R1', organization: 'DeepSeek', isAvailable: true },
    
    // Alibaba - Qwen 3
    { id: 'qwen3-max-preview', name: 'Qwen 3 Max Preview', organization: 'Alibaba', isAvailable: true },
    { id: 'qwen3-235b-a22b-instruct-2507', name: 'Qwen 3 235B', organization: 'Alibaba', isAvailable: true },
    { id: 'qwen2.5-max', name: 'Qwen 2.5 Max', organization: 'Alibaba', isAvailable: true },
    { id: 'qwq-32b', name: 'QwQ 32B', organization: 'Alibaba', isAvailable: true },
    
    // Zhipu AI - GLM
    { id: 'glm-4.6', name: 'GLM-4.6', organization: 'Zhipu AI', isAvailable: true },
    { id: 'glm-4.5', name: 'GLM-4.5', organization: 'Zhipu AI', isAvailable: true },
    
    // xAI - Grok
    { id: 'grok-4-fast', name: 'Grok 4 Fast', organization: 'xAI', isAvailable: true },
    { id: 'grok-3-preview-02-24', name: 'Grok 3 Preview', organization: 'xAI', isAvailable: true },
    
    // Mistral AI
    { id: 'mistral-large-2411', name: 'Mistral Large 2411', organization: 'Mistral AI', isAvailable: true },
    { id: 'mixtral-8x22b-instruct-v0.1', name: 'Mixtral 8x22B', organization: 'Mistral AI', isAvailable: true },
    
    // Moonshot AI
    { id: 'kimi-k2-0905-preview', name: 'Kimi K2', organization: 'Moonshot AI', isAvailable: true },
    
    // Tencent
    { id: 'hunyuan-t1-20250711', name: 'Hunyuan T1', organization: 'Tencent', isAvailable: true },
    
    // Cohere
    { id: 'command-r-plus-08-2024', name: 'Command R+', organization: 'Cohere', isAvailable: true },
    
    // Amazon
    { id: 'amazon-nova-pro-v1.0', name: 'Amazon Nova Pro', organization: 'Amazon', isAvailable: true },
  ]
}

/**
 * 모델 ID로 모델 정보 가져오기
 */
export async function getModelInfo(modelId: LMArenaModel): Promise<ModelInfo | null> {
  const models = await fetchAvailableModels()
  return models.find(m => m.id === modelId) || null
}

/**
 * 조직별로 모델 그룹화
 */
export function groupModelsByOrganization(models: ModelInfo[]): Record<string, ModelInfo[]> {
  return models.reduce((acc, model) => {
    const org = model.organization
    if (!acc[org]) {
      acc[org] = []
    }
    acc[org].push(model)
    return acc
  }, {} as Record<string, ModelInfo[]>)
}

/**
 * 사용 가능한 모델만 필터링
 */
export function filterAvailableModels(models: ModelInfo[]): ModelInfo[] {
  return models.filter(m => m.isAvailable)
}
