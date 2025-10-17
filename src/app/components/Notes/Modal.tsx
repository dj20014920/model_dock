import { FC } from 'react'
import Dialog from '~app/components/Dialog'
import { Toaster } from 'react-hot-toast'
import NotesPanel from './Panel'

const NotesModal: FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  return (
    <Dialog title="Notes" open={open} onClose={onClose} className="w-[720px] min-h-[420px]">
      <div className="p-5 overflow-auto">
        <NotesPanel />
      </div>
      <Toaster position="bottom-center" />
    </Dialog>
  )
}

export default NotesModal
