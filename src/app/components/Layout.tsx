import { Outlet } from '@tanstack/react-router'
import { useAtom, useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { followArcThemeAtom, showNotesModalAtom, themeColorAtom } from '~app/state'
import { iframeManager } from '~app/services/iframe-manager'
import ReleaseNotesModal from './Modals/ReleaseNotesModal'
// Discount modal disabled
import PremiumModal from './Premium/Modal'
import NotesModal from './Notes/Modal'
import Sidebar from './Sidebar'
import { Toaster } from 'react-hot-toast'

function Layout() {
  const themeColor = useAtomValue(themeColorAtom)
  const followArcTheme = useAtomValue(followArcThemeAtom)
  const [notesOpen, setNotesOpen] = useAtom(showNotesModalAtom)

  // 🚀 앱 시작 시 iframe 봇들을 미리 생성 (비iframe 방식의 Jotai atom처럼 항상 메모리에 유지)
  useEffect(() => {
    const iframeBots = ['chatgpt', 'grok', 'qwen', 'lmarena']
    console.log('[Layout] 🚀 iframe 봇 프리로드:', iframeBots)
    iframeManager.preload(iframeBots)
  }, [])
  return (
    <main
      className="h-screen grid grid-cols-[auto_1fr]"
      style={{ backgroundColor: followArcTheme ? 'var(--arc-palette-foregroundPrimary)' : themeColor }}
    >
      <Sidebar />
      <div className="px-[15px] py-3 h-full overflow-hidden">
        <Outlet />
      </div>
      {/* <DiscountModal /> */}
      <PremiumModal />
      <NotesModal open={notesOpen} onClose={() => setNotesOpen(false)} />
      <ReleaseNotesModal />
      <Toaster position="bottom-center" />
    </main>
  )
}

export default Layout
