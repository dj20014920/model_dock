import { AnimatePresence, motion } from 'framer-motion'
import { FC, useMemo, useState } from 'react'
import React from 'react'
import { CHATBOTS } from '~app/consts'
import Button from '~app/components/Button'
import { BotId } from '~app/bots'
import { useMainBrain } from '~app/hooks/use-main-brain'
import { getUserConfig } from '~services/user-config'

// LM Arena 리더보드 기반 실제 사용자 평가 순위 (2025년 최신)
// 사용 빈도가 높은 순서: 범용성 > 정보탐색 > 코딩 > 추론 > 속도 > 팩트체크 > 학술연구 > 창작 > 비용효율
const RECOMMENDATIONS = {
  general: ['chatgpt', 'claude', 'gemini'] as BotId[], // 🌐 범용성 (Text Arena 1-3위)
  search: ['perplexity', 'chatgpt', 'gemini'] as BotId[], // 🔍 정보탐색 (Search Arena 상위)
  coding: ['deepseek', 'claude', 'chatgpt'] as BotId[], // 💻 코딩 (WebDev/Copilot 1위 DeepSeek)
  reasoning: ['claude', 'chatgpt', 'qwen'] as BotId[], // 🧠 추론/분석 (Thinking 모델 상위)
  speed: ['gemini', 'chatgpt', 'qwen'] as BotId[], // ⚡ 빠른응답 (Flash 계열)
  factcheck: ['perplexity', 'claude', 'chatgpt'] as BotId[], // ✅ 팩트체크 (Search + Reasoning)
  academic: ['claude', 'chatgpt', 'perplexity'] as BotId[], // 🎓 학술연구 (대학생/교수/석박사)
  creative: ['chatgpt', 'claude', 'gemini'] as BotId[], // 🎨 창작/글쓰기
  cost: ['qwen', 'deepseek', 'gemini'] as BotId[], // 💰 비용효율
  vision: ['gemini', 'chatgpt', 'claude'] as BotId[], // 📷 사진인식 (Vision Arena 1위 Gemini)
  arena: ['lmarena', 'chatgpt', 'claude'] as BotId[], // 🎯 최신모델 (LM Arena 접근)
}

type RecommendCategory = keyof typeof RECOMMENDATIONS

const MainBrainPanel: FC = () => {
  const { mainBrainBotId, setMainBrain } = useMainBrain()
  const [selectedCategory, setSelectedCategory] = useState<RecommendCategory>('general')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [position, setPosition] = useState(() => {
    // localStorage에서 저장된 위치 불러오기
    try {
      const saved = localStorage.getItem('mainBrainPanelPosition')
      return saved ? JSON.parse(saved) : { top: '50%', translateY: '-50%' }
    } catch {
      return { top: '50%', translateY: '-50%' }
    }
  })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ y: 0, startTop: 0, time: 0 })
  const [hasMoved, setHasMoved] = useState(false)

  const bot = useMemo(() => (mainBrainBotId ? CHATBOTS[mainBrainBotId] : null), [mainBrainBotId])

  // 메인 브레인 변경 시 로그
  React.useEffect(() => {
    console.log('[MainBrainPanel] 🔄 Main Brain state updated:', mainBrainBotId)
  }, [mainBrainBotId])

  // 드래그 시작 (클릭과 구분하기 위한 로직)
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, isCollapsedButton = false) => {
    e.preventDefault() // 기본 동작 방지
    e.stopPropagation()
    
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const currentTop = typeof position.top === 'string' && position.top.includes('%')
      ? (parseFloat(position.top) / 100) * window.innerHeight
      : parseFloat(position.top as string)
    
    setDragStart({ 
      y: clientY, 
      startTop: currentTop,
      time: Date.now()
    })
    setHasMoved(false)
    
    // 약간의 지연 후 드래그 모드 활성화 (클릭과 구분)
    setTimeout(() => {
      setIsDragging(true)
    }, 50)
  }

  // 드래그 중
  const handleDragMove = React.useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging && dragStart.time === 0) return
    
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const deltaY = clientY - dragStart.y
    
    // 3px 이상 움직였을 때만 드래그로 인식 (더 민감하게)
    if (Math.abs(deltaY) > 3) {
      e.preventDefault() // 스크롤 방지
      setHasMoved(true)
      setIsDragging(true) // 확실히 드래그 모드 활성화
      
      const newTop = Math.max(80, Math.min(window.innerHeight - 100, dragStart.startTop + deltaY))
      setPosition({ top: `${newTop}px`, translateY: '0' })
    }
  }, [isDragging, dragStart])

  // 드래그 종료
  const handleDragEnd = React.useCallback(() => {
    const dragDuration = Date.now() - dragStart.time
    
    // 150ms 이내이고 3px 미만 이동 = 클릭으로 간주
    const isClick = dragDuration < 150 && !hasMoved
    
    console.log('[MainBrainPanel] Drag End:', {
      duration: dragDuration,
      hasMoved,
      isClick,
      isDragging,
    })
    
    setIsDragging(false)
    setHasMoved(false)
    setDragStart({ y: 0, startTop: 0, time: 0 })
    
    // 드래그였다면 위치 저장
    if (!isClick && hasMoved) {
      try {
        localStorage.setItem('mainBrainPanelPosition', JSON.stringify(position))
      } catch (e) {
        console.error('Failed to save position:', e)
      }
    }
  }, [dragStart.time, hasMoved, isDragging, position])

  // 드래그 이벤트 리스너 등록 (dragStart.time이 있으면 활성화)
  React.useEffect(() => {
    if (dragStart.time > 0) {
      const handleMove = (e: MouseEvent | TouchEvent) => handleDragMove(e)
      const handleEnd = () => handleDragEnd()
      
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleEnd)
      window.addEventListener('touchmove', handleMove, { passive: false })
      window.addEventListener('touchend', handleEnd)
      window.addEventListener('touchcancel', handleEnd)
      
      return () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleEnd)
        window.removeEventListener('touchmove', handleMove)
        window.removeEventListener('touchend', handleEnd)
        window.removeEventListener('touchcancel', handleEnd)
      }
    }
  }, [dragStart.time, handleDragMove, handleDragEnd])

  const categoryLabels: Record<RecommendCategory, string> = {
    general: '🌐 범용성',
    search: '🔍 정보탐색',
    coding: '💻 코딩',
    reasoning: '🧠 추론/분석',
    speed: '⚡ 빠른응답',
    factcheck: '✅ 팩트체크',
    academic: '🎓 학술연구',
    creative: '🎨 창작/글쓰기',
    cost: '💰 비용효율',
    vision: '📷 사진인식',
    arena: '🎯 최신모델',
  }

  return (
    <AnimatePresence>
      {bot && (
        <>
          {/* 접힌 상태: 우측 버튼 (전체 드래그 가능) */}
          {isCollapsed && (
            <motion.div
              key="collapsed-button"
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed z-[100] select-none"
              style={{
                right: '-2px', // 화면 끝에 딱 붙이기
                top: position.top,
                transform: position.translateY ? `translateY(${position.translateY})` : undefined,
                cursor: isDragging ? 'grabbing' : 'grab',
              }}
              onMouseDown={(e) => handleDragStart(e, true)}
              onTouchStart={(e) => handleDragStart(e, true)}
            >
              {/* 버튼 (클릭 시 펼치기, 드래그 시 이동) */}
              <div
                onClick={(e) => {
                  // 드래그가 아닐 때만 펼치기
                  console.log('[MainBrainPanel] Button Click:', { hasMoved, isDragging })
                  if (!hasMoved && !isDragging) {
                    setIsCollapsed(false)
                  }
                  e.stopPropagation()
                }}
                className="bg-amber-500 hover:bg-amber-600 text-white px-2 py-4 rounded-l-lg shadow-lg flex flex-col items-center gap-1 group transition-all cursor-pointer"
                title="클릭: 패널 열기 | 드래그: 위치 이동"
              >
                <span className="text-xl">👑</span>
                <span className="text-sm group-hover:-translate-x-0.5 transition-transform">◀</span>
              </div>
            </motion.div>
          )}

          {/* 펼쳐진 상태: 전체 패널 (드래그 가능) */}
          {!isCollapsed && (
            <motion.div
              key="main-brain-panel"
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="fixed right-4 w-80 bg-primary-background border border-primary-border rounded-xl shadow-lg z-[100] max-h-[calc(100vh-120px)] overflow-hidden flex flex-col"
              style={{
                top: position.top,
                transform: position.translateY ? `translateY(${position.translateY})` : undefined,
              }}
            >
              {/* 드래그 가능한 헤더 */}
              <div
                className="flex flex-row items-center justify-between p-4 pb-3 border-b border-primary-border shrink-0 cursor-grab active:cursor-grabbing select-none"
                onMouseDown={(e) => handleDragStart(e, false)}
                onTouchStart={(e) => handleDragStart(e, false)}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
              >
                <div className="flex flex-row items-center gap-2">
                  <img src={bot.avatar} className="w-6 h-6 rounded-sm" />
                  <span className="text-sm font-bold">{bot.name}</span>
                  <span className="text-[11px] px-2 py-[2px] rounded-full bg-amber-100 text-amber-700 font-semibold">
                    👑 메인 브레인
                  </span>
                </div>
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="text-secondary-text hover:text-primary-text transition-colors p-1 hover:bg-secondary rounded"
                  title="패널 접기"
                >
                  <span className="text-lg">▶</span>
                </button>
              </div>

              {/* 스크롤 가능한 컨텐츠 영역 */}
              <div className="overflow-y-auto p-4 pt-3"
>
                {/* 카테고리 선택 */}
                <div className="mb-3">
            <span className="text-[12px] font-semibold text-primary-text mb-2 block">
              상황별 추천 (LM Arena 리더보드 기반)
            </span>
            <div className="grid grid-cols-2 gap-1.5 max-h-[180px] overflow-y-auto">
              {(Object.keys(RECOMMENDATIONS) as RecommendCategory[]).map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`text-[10px] px-2 py-1.5 rounded-lg border transition-all text-left ${
                    selectedCategory === category
                      ? 'bg-amber-50 border-amber-300 text-amber-700 font-semibold'
                      : 'border-primary-border text-secondary-text hover:bg-secondary'
                  }`}
                >
                  {categoryLabels[category]}
                </button>
              ))}
            </div>
          </div>

                {/* 추천 모델 리스트 */}
                <div className="flex flex-col gap-2">
            <span className="text-[11px] text-secondary-text mb-1">
              {categoryLabels[selectedCategory]} Top 3
            </span>
            {RECOMMENDATIONS[selectedCategory].map((id, index) => (
              <div
                key={id}
                className="flex flex-row items-center gap-2 p-2 rounded-lg border border-primary-border hover:bg-secondary transition-colors"
              >
                <span className="text-[10px] font-bold text-amber-600 w-4">{index + 1}</span>
                <img src={CHATBOTS[id].avatar} className="w-4 h-4 rounded-sm" />
                <span className="text-sm grow">{CHATBOTS[id].name}</span>
                {mainBrainBotId === id ? (
                  <span className="text-[10px] text-amber-600 font-semibold">✓ 선택됨</span>
                ) : (
                  <Button
                    text="선택"
                    size="tiny"
                    color="primary"
                    onClick={async () => {
                      console.log('[MainBrainPanel] 🎯 Selecting new main brain:', {
                        current: mainBrainBotId,
                        new: id,
                      })
                      
                      // 메인 브레인 변경 (storage 이벤트가 자동으로 발생)
                      await setMainBrain(id)
                      
                      console.log('[MainBrainPanel] ✅ Main Brain selection complete')
                    }}
                  />
                )}
              </div>
            ))}
          </div>

                {/* 안내 문구 */}
                <div className="mt-4 pt-3 border-t border-primary-border">
                  <p className="text-[10px] text-secondary-text leading-relaxed">
                    💡 메인 브레인은 여러 모델의 응답을 비교하고 정리하는 중심 역할을 합니다.
                    언제든지 다른 모델로 변경할 수 있습니다.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  )
}

export default MainBrainPanel

