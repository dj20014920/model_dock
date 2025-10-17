// 외부 호출 제거 정책(NOWGUIDE): Arkose 토큰 원격 획득을 사용하지 않는다.
// 필요 시 generator.js를 통한 현장 생성만 시도하고, 실패하면 토큰 없이 진행한다.
export async function fetchArkoseToken(): Promise<string | undefined> {
  return undefined
}
