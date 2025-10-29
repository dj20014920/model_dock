#!/usr/bin/env python3
"""
Copilot HAR 파일 분석 스크립트
실제 작동하는 API 엔드포인트와 요청 형식을 파악
"""
import json
import sys

def analyze_har(har_path):
    """HAR 파일에서 중요한 API 요청 추출"""
    print(f"🔍 분석 중: {har_path}\n")

    with open(har_path, 'r', encoding='utf-8') as f:
        try:
            har_data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"❌ JSON 파싱 실패: {e}")
            return

    entries = har_data.get('log', {}).get('entries', [])
    print(f"📊 총 요청 수: {len(entries)}\n")

    # conversation 관련 요청 찾기
    conv_requests = []
    for entry in entries:
        url = entry['request']['url']
        method = entry['request']['method']
        status = entry['response']['status']

        if 'conversation' in url.lower() or 'create' in url.lower():
            conv_requests.append({
                'url': url,
                'method': method,
                'status': status,
                'headers': entry['request']['headers'],
                'response_headers': entry['response']['headers'],
            })

    print(f"🎯 Conversation 관련 요청: {len(conv_requests)}개\n")

    for idx, req in enumerate(conv_requests):
        print(f"{'='*80}")
        print(f"요청 #{idx+1}")
        print(f"URL: {req['url']}")
        print(f"Method: {req['method']}")
        print(f"Status: {req['status']}")
        print(f"\n요청 헤더:")
        for h in req['headers'][:10]:  # 처음 10개만
            print(f"  {h['name']}: {h['value'][:100]}")
        print()

    # 200 응답만 필터링
    success_requests = [r for r in conv_requests if r['status'] == 200]
    print(f"\n✅ 성공한 요청 (200): {len(success_requests)}개")

    if success_requests:
        print("\n🎉 성공한 API 엔드포인트:")
        for req in success_requests:
            print(f"  - {req['method']} {req['url']}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("사용법: python analyze_copilot_har.py <HAR 파일 경로>")
        sys.exit(1)

    analyze_har(sys.argv[1])
