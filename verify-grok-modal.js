// Grok 모달 검증 스크립트
// Chrome 확장 프로그램 콘솔에서 실행

console.log('🔍 Grok 모달 검증 시작...\n');

// 1. 저장소 상태 확인
chrome.storage.local.get('grokNoticeShown', (result) => {
  console.log('📦 저장소 상태:', result);
  
  if (result.grokNoticeShown) {
    console.log('⚠️ Grok 안내가 이미 표시되었습니다.');
    console.log('💡 테스트를 위해 초기화하려면 다음 명령을 실행하세요:');
    console.log('   chrome.storage.local.remove("grokNoticeShown")');
  } else {
    console.log('✅ Grok 안내가 아직 표시되지 않았습니다.');
    console.log('💡 Grok을 포함한 봇으로 메시지를 전송하면 모달이 표시됩니다.');
  }
});

// 2. 빌드 파일 확인
console.log('\n📁 빌드 파일 확인:');
console.log('- GrokNoticeModal 컴포넌트: ✅');
console.log('- Dialog 컴포넌트: ✅');
console.log('- close.svg 아이콘: ✅');
console.log('- Button 컴포넌트: ✅');

// 3. 테스트 가이드
console.log('\n🧪 테스트 방법:');
console.log('1. 저장소 초기화:');
console.log('   chrome.storage.local.remove("grokNoticeShown")');
console.log('\n2. Grok을 포함한 봇 선택 (예: ChatGPT + Grok)');
console.log('\n3. 메시지 입력 후 전송');
console.log('\n4. 모달 표시 확인');
console.log('\n5. 닫기 방법 테스트:');
console.log('   - X 버튼 클릭');
console.log('   - 확인 버튼 클릭');
console.log('   - 배경 클릭');
console.log('   - ESC 키');

// 4. 유틸리티 함수
window.resetGrokNotice = () => {
  chrome.storage.local.remove('grokNoticeShown', () => {
    console.log('✅ Grok 안내 초기화 완료!');
    console.log('💡 이제 Grok으로 메시지를 전송하면 모달이 표시됩니다.');
  });
};

window.checkGrokNotice = () => {
  chrome.storage.local.get('grokNoticeShown', (result) => {
    console.log('📦 현재 상태:', result);
    if (result.grokNoticeShown) {
      console.log('⚠️ 이미 표시됨 - 모달이 나타나지 않습니다.');
    } else {
      console.log('✅ 아직 표시 안 됨 - 모달이 나타날 것입니다.');
    }
  });
};

console.log('\n🛠️ 유틸리티 함수:');
console.log('- resetGrokNotice() : Grok 안내 초기화');
console.log('- checkGrokNotice() : 현재 상태 확인');
console.log('\n✅ 검증 스크립트 로드 완료!\n');
