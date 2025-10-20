#!/bin/bash
# ChatGPT API 직접 테스트 스크립트

echo "🧪 Testing ChatGPT API..."
echo ""

# 1. Session 확인
echo "1️⃣ Testing /api/auth/session..."
curl -v \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  -H "Accept: application/json" \
  --cookie-jar cookies.txt \
  https://chatgpt.com/api/auth/session 2>&1 | grep -E "(< HTTP|Location|Set-Cookie)"

echo ""
echo "2️⃣ Checking if session returned 200 or 403..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
  https://chatgpt.com/api/auth/session)

echo "Status: $STATUS"

if [ "$STATUS" = "403" ]; then
  echo "❌ 403 Forbidden - ChatGPT is blocking requests"
  echo "💡 This means your IP/environment is flagged"
  echo ""
  echo "Possible solutions:"
  echo "  - Wait 10-30 minutes"
  echo "  - Clear cookies and re-login"
  echo "  - Try from a different network"
  echo "  - Use VPN"
elif [ "$STATUS" = "200" ]; then
  echo "✅ 200 OK - API is accessible"
  echo "💡 The issue is likely in the extension's request headers"
else
  echo "⚠️ Unexpected status: $STATUS"
fi

echo ""
echo "3️⃣ Testing with Chrome User-Agent..."
curl -s -o /dev/null -w "Status: %{http_code}\n" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  https://chatgpt.com/api/auth/session
