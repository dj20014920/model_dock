import Browser from 'webextension-polyfill'
import { enforceFreeSlotsOrThrow } from './limits'

export interface Note {
  id: string
  title: string
  content: string
  updatedAt: number
}

export async function loadNotes(): Promise<Note[]> {
  const { notes } = await Browser.storage.local.get('notes')
  return (notes || []) as Note[]
}

export async function saveNote(note: Note) {
  const notes = await loadNotes()
  const idx = notes.findIndex((n) => n.id === note.id)
  if (idx >= 0) {
    notes[idx] = note
  } else {
    enforceFreeSlotsOrThrow(notes.length)
    notes.unshift(note)
  }
  await Browser.storage.local.set({ notes })
}

export async function removeNote(id: string) {
  const notes = await loadNotes()
  await Browser.storage.local.set({ notes: notes.filter((n) => n.id !== id) })
}

