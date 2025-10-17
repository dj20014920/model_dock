import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { v4 as uuid } from 'uuid'
import Button from '~app/components/Button'
import { Input, Textarea } from '~app/components/Input'
import { Note, loadNotes, removeNote, saveNote } from '~services/notes'
import useSWR from 'swr'
import { useSetAtom } from 'jotai'
import { showPremiumModalAtom } from '~app/state'
import Select from '~app/components/Select'
import toast from 'react-hot-toast'

function NoteForm(props: { initial: Note; onSubmit: (n: Note) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(props.initial.title)
  const [content, setContent] = useState(props.initial.content)
  const submit = useCallback(() => {
    props.onSubmit({ ...props.initial, title, content, updatedAt: Date.now() })
  }, [content, props, title])
  return (
    <div className="flex flex-col gap-2">
      <Input value={title} onChange={(e) => setTitle(e.currentTarget.value)} placeholder={t('Title')!} />
      <Textarea value={content} onChange={(e) => setContent(e.currentTarget.value)} placeholder={t('Content')!} />
      <div className="flex gap-2">
        <Button text={t('Save')} color="primary" size="small" onClick={submit} />
        <Button text={t('Cancel')} color="flat" size="small" onClick={props.onCancel} />
      </div>
    </div>
  )
}

const NotesPanel = () => {
  const { t } = useTranslation()
  const notesQuery = useSWR('notes', loadNotes, { suspense: false })
  const [editing, setEditing] = useState<Note | null>(null)
  const openPremium = useSetAtom(showPremiumModalAtom)
  const [keyword, setKeyword] = useState('')
  const [sortBy, setSortBy] = useState<'updated' | 'title' | 'length'>('updated')

  const onCreate = useCallback(() => {
    setEditing({ id: uuid(), title: '', content: '', updatedAt: Date.now() })
  }, [])

  const onSave = useCallback(
    async (n: Note) => {
      try {
        await saveNote(n)
        setEditing(null)
        notesQuery.mutate()
        toast.success('Saved')
      } catch (e) {
        openPremium(true)
      }
    },
    [notesQuery, openPremium],
  )

  const onRemove = useCallback(
    async (id: string) => {
      await removeNote(id)
      notesQuery.mutate()
      toast.success('Deleted')
    },
    [notesQuery],
  )

  const list = useMemo(() => {
    const arr = (notesQuery.data || []).filter((n) => {
      if (!keyword.trim()) return true
      const q = keyword.toLowerCase()
      return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q)
    })
    if (sortBy === 'updated') {
      return arr.sort((a, b) => b.updatedAt - a.updatedAt)
    }
    if (sortBy === 'title') {
      return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    }
    // length
    return arr.sort((a, b) => (b.content || '').length - (a.content || '').length)
  }, [keyword, notesQuery.data, sortBy])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row items-center gap-2">
        <Input className="grow" placeholder={t('Search')!} value={keyword} onChange={(e) => setKeyword(e.currentTarget.value)} />
        <div className="w-[180px]">
          <Select
            options={[
              { name: t('Sort by updated'), value: 'updated' },
              { name: t('Sort by title'), value: 'title' },
              { name: t('Sort by length'), value: 'length' },
            ]}
            value={sortBy}
            onChange={(v) => setSortBy(v as any)}
          />
        </div>
      </div>
      {list.length ? (
        <div className="grid grid-cols-1 gap-3">
          {list.map((n) => (
            <div key={n.id} className="flex flex-row items-start gap-2 border border-primary-border rounded-lg p-3">
              <div className="flex flex-col grow">
                <span className="text-sm font-semibold text-primary-text">{n.title || t('Untitled')}</span>
                <span className="text-xs text-secondary-text whitespace-pre-wrap mt-1">{n.content}</span>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button text={t('Copy')} size="tiny" onClick={async () => { await navigator.clipboard.writeText(n.content || ''); toast.success(t('Copied')!) }} />
                <Button text={t('Edit')} size="tiny" onClick={() => setEditing(n)} />
                <Button text={t('Delete')} size="tiny" color="flat" onClick={() => onRemove(n.id)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-3 text-center text-sm mt-2 text-primary-text">
          {t('No notes yet.')}
        </div>
      )}
      <div>
        {editing ? (
          <NoteForm initial={editing} onSubmit={onSave} onCancel={() => setEditing(null)} />
        ) : (
          <Button text={t('Create note')} onClick={onCreate} size="small" />
        )}
      </div>
    </div>
  )
}

export default NotesPanel
