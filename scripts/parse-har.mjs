#!/usr/bin/env node
import fs from 'fs'

if (process.argv.length < 3) {
  console.error('Usage: node scripts/parse-har.mjs <file.har>')
  process.exit(1)
}

const file = process.argv[2]
const raw = fs.readFileSync(file, 'utf-8')
let har
try { har = JSON.parse(raw) } catch (e) { console.error('Invalid HAR'); process.exit(1) }

const entries = har.log?.entries || []

// Heuristics for candidate chat endpoints and auth/session
const CANDIDATE_PATTERNS = [
  /backend-api\/conversation/i,
  /\/api\/auth\/session/i,
  /append_message/i,
  /chat_conversations\/.+\/completion/i,
  /StreamGenerate/i,
  /chat\/completions/i,
  /generate_chat_title/i,
  /models/i,
]

function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

const results = entries
  .filter(e => {
    const u = e.request?.url || ''
    return CANDIDATE_PATTERNS.some(re => re.test(u))
  })
  .map(e => {
    const req = e.request || {}
    const res = e.response || {}
    const headersObj = {}
    for (const h of req.headers || []) headersObj[h.name.toLowerCase()] = h.value
    const resHeaders = {}
    for (const h of res.headers || []) resHeaders[h.name.toLowerCase()] = h.value
    let postData = undefined
    if (req.postData?.text) {
      try { postData = JSON.parse(req.postData.text) } catch { postData = req.postData.text.slice(0, 4000) }
    }
    return {
      method: req.method,
      url: req.url,
      requestHeaders: pick(headersObj, ['content-type','authorization','cookie','x-same-domain','x-client-data','sec-ch-ua','origin']),
      requestBody: postData,
      status: res.status,
      statusText: res.statusText,
      responseHeaders: pick(resHeaders, ['content-type','set-cookie','cf-ray','server']),
    }
  })

results.sort((a,b)=>{
  // prioritize POST streaming endpoints
  const as = /event-stream|octet-stream/i.test(a.responseHeaders['content-type']||'') ? 1:0
  const bs = /event-stream|octet-stream/i.test(b.responseHeaders['content-type']||'') ? 1:0
  if (as!==bs) return bs-as
  return (b.method==='POST') - (a.method==='POST')
})

console.log(JSON.stringify(results, null, 2))

