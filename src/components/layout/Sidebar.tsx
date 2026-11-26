import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AnimalId,
  Conversation,
  ModelRuntimeStatus,
} from '../../types'
import { cn } from '../../utils/cn'
import { formatRelativeTime } from '../../utils/format'
import { getModelById, formatModelSize } from '../../ai/models/modelRegistry'
import { describeRuntimeStatus } from '../../ai/models/modelManager'
import { AnimalAvatar } from '../avatar/AnimalAvatar'
import { BrandWordmark } from '../ui/Brand'
import { Icon } from '../ui/Icon'

interface SidebarProps {
  open: boolean
  onClose: () => void
  conversations: Conversation[]
  activeId: string | null
  avatar: AnimalId
  modelId: string
  modelStatus?: ModelRuntimeStatus
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onOpenSettings: () => void
  onOpenSetup: () => void
  onClearAll: () => void
}

export function Sidebar({
  open,
  onClose,
  conversations,
  activeId,
  avatar,
  modelId,
  modelStatus,
  onNew,
  onSelect,
  onDelete,
  onRename,
  onOpenSettings,
  onOpenSetup,
  onClearAll,
}: SidebarProps) {
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const model = getModelById(modelId)

  useEffect(() => {
    if (editingId) {
      const timer = window.setTimeout(() => inputRef.current?.select(), 30)
      return () => window.clearTimeout(timer)
    }
  }, [editingId])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase()
    if (!clean) return conversations
    return conversations.filter(
      (conversation) =>
        conversation.title.toLowerCase().includes(clean) ||
        conversation.preview.toLowerCase().includes(clean),
    )
  }, [conversations, query])

  const commitRename = () => {
    if (editingId) onRename(editingId, editingTitle)
    setEditingId(null)
  }

  const downloading =
    modelStatus?.state === 'downloading' || modelStatus?.state === 'loading'

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm animate-fade-in md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'glass fixed inset-y-0 left-0 z-40 flex w-[86%] max-w-[19rem] flex-col border-r border-[var(--border)] transition-transform duration-300 ease-out md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Conversations"
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
          <BrandWordmark />
          <button
            type="button"
            className="btn-icon md:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={() => {
              onNew()
              onClose()
            }}
            className="btn btn-primary w-full"
          >
            <Icon name="plus" size={16} />
            New conversation
          </button>
        </div>

        <div className="px-3 pt-3">
          <div className="relative">
            <Icon
              name="message"
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="input !py-1.5 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="scrollbar-thin mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Icon
                name="message"
                size={22}
                className="mx-auto text-[var(--text-subtle)] opacity-60"
              />
              <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">
                {query ? 'No matches' : 'No conversations yet'}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-subtle)]">
                {query
                  ? 'Try a different search.'
                  : 'Your chats will appear here, stored only on this device.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((conversation) => {
                const active = conversation.id === activeId
                const editing = editingId === conversation.id
                return (
                  <li key={conversation.id}>
                    {editing ? (
                      <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-1.5">
                        <input
                          ref={inputRef}
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') commitRename()
                            if (event.key === 'Escape') setEditingId(null)
                          }}
                          onBlur={commitRename}
                          className="input !py-1 text-xs"
                          aria-label="Conversation title"
                          maxLength={80}
                        />
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'group relative flex items-center rounded-xl transition',
                          active
                            ? 'bg-[var(--accent-soft)]'
                            : 'hover:bg-[var(--surface-hover)]',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(conversation.id)
                            onClose()
                          }}
                          className="min-w-0 flex-1 rounded-xl py-2 pl-2.5 pr-24 text-left sm:pr-2.5"
                        >
                          <span
                            className={cn(
                              'block truncate text-xs font-semibold',
                              active
                                ? 'text-[var(--text)]'
                                : 'text-[var(--text-secondary)]',
                            )}
                          >
                            {conversation.title}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-subtle)]">
                            <span>{formatRelativeTime(conversation.updatedAt)}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {conversation.messageCount}{' '}
                              {conversation.messageCount === 1 ? 'message' : 'messages'}
                            </span>
                          </span>
                        </button>
                        <div className="absolute right-1 flex items-center gap-0.5 touch-visible-actions transition">
                          <button
                            type="button"
                            className="btn-icon h-6 w-6"
                            onClick={() => {
                              setEditingId(conversation.id)
                              setEditingTitle(conversation.title)
                            }}
                            aria-label={`Rename ${conversation.title}`}
                            title="Rename"
                          >
                            <Icon name="edit" size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon h-6 w-6 hover:text-rose-300"
                            onClick={() => onDelete(conversation.id)}
                            aria-label={`Delete ${conversation.title}`}
                            title="Delete"
                          >
                            <Icon name="trash" size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[var(--border-subtle)] p-3">
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-2">
            <AnimalAvatar animal={avatar} state="idle" size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-[var(--text)]">
                {model?.label ?? 'Local model'}
              </p>
              <p className="truncate text-[10px] text-[var(--text-subtle)]">
                {model ? `${formatModelSize(model.approxSizeMB)} · ` : ''}
                {describeRuntimeStatus(modelStatus)}
              </p>
            </div>
            {downloading && (
              <span className="shrink-0 text-[10px] tabular-nums text-[var(--accent)]">
                {Math.round((modelStatus?.progress ?? 0) * 100)}%
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className="btn btn-ghost btn-sm justify-start"
              onClick={onOpenSetup}
            >
              <Icon name="sparkles" size={14} />
              Setup
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm justify-start"
              onClick={onOpenSettings}
            >
              <Icon name="settings" size={14} />
              Settings
            </button>
          </div>

          {conversations.length > 0 && (
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-medium text-[var(--text-subtle)] transition hover:bg-rose-500/10 hover:text-rose-300"
              onClick={onClearAll}
            >
              <Icon name="trash" size={11} />
              Delete all conversations
            </button>
          )}

          <p className="mt-2 px-1 text-[10px] leading-relaxed text-[var(--text-subtle)]">
            Conversations never leave this browser.
          </p>
        </div>
      </aside>
    </>
  )
}
