import { Outlet } from '@tanstack/react-router'
import { useAtom, useAtomValue } from 'jotai'
import { followArcThemeAtom, showNotesModalAtom, themeColorAtom } from '~app/state'
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
