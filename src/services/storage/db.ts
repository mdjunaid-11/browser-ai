import type { ChatMessage, Conversation } from '../../types'

const DB_NAME = 'browser-ai'
const DB_VERSION = 1
const CONVERSATIONS = 'conversations'
const MESSAGES = 'messages'

let dbPromise: Promise<IDBDatabase> | null = null
let memoryMode = false

const memoryConversations = new Map<string, Conversation>()
const memoryMessages = new Map<string, ChatMessage>()

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New conversation'
  if (clean.length <= 46) return clean
  return `${clean.slice(0, 45).trimEnd()}…`
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      memoryMode = true
      reject(new Error('IndexedDB is unavailable in this browser.'))
      return
    }

    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      memoryMode = true
      reject(error)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CONVERSATIONS)) {
        const store = db.createObjectStore(CONVERSATIONS, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains(MESSAGES)) {
        const store = db.createObjectStore(MESSAGES, { keyPath: 'id' })
        store.createIndex('conversationId', 'conversationId')
        store.createIndex('createdAt', 'createdAt')
      }
    }

    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }

    request.onerror = () => {
      memoryMode = true
      reject(request.error ?? new Error('Could not open IndexedDB.'))
    }
  })

  return dbPromise
}

export function isPersistenceAvailable(): boolean {
  return !memoryMode && typeof indexedDB !== 'undefined'
}

export function isMemoryFallback(): boolean {
  return memoryMode
}

export async function listConversations(): Promise<Conversation[]> {
  if (memoryMode) {
    return [...memoryConversations.values()].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    )
  }

  try {
    const db = await openDB()
    const tx = db.transaction(CONVERSATIONS, 'readonly')
    const store = tx.objectStore(CONVERSATIONS)
    const rows = await requestToPromise(store.getAll() as IDBRequest<Conversation[]>)
    await transactionDone(tx)
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    memoryMode = true
    return [...memoryConversations.values()].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    )
  }
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  if (memoryMode) {
    memoryConversations.set(conversation.id, conversation)
    return
  }

  try {
    const db = await openDB()
    const tx = db.transaction(CONVERSATIONS, 'readwrite')
    tx.objectStore(CONVERSATIONS).put(conversation)
    await transactionDone(tx)
  } catch {
    memoryMode = true
    memoryConversations.set(conversation.id, conversation)
  }
}

export async function getConversation(
  id: string,
): Promise<Conversation | null> {
  if (memoryMode) return memoryConversations.get(id) ?? null

  try {
    const db = await openDB()
    const tx = db.transaction(CONVERSATIONS, 'readonly')
    const result = await requestToPromise(
      tx.objectStore(CONVERSATIONS).get(id) as IDBRequest<Conversation | undefined>,
    )
    await transactionDone(tx)
    return result ?? null
  } catch {
    memoryMode = true
    return memoryConversations.get(id) ?? null
  }
}

export async function deleteConversation(id: string): Promise<void> {
  if (memoryMode) {
    memoryConversations.delete(id)
    for (const [messageId, message] of memoryMessages) {
      if (message.conversationId === id) memoryMessages.delete(messageId)
    }
    return
  }

  try {
    const db = await openDB()
    const tx = db.transaction([CONVERSATIONS, MESSAGES], 'readwrite')
    tx.objectStore(CONVERSATIONS).delete(id)

    const messageStore = tx.objectStore(MESSAGES)
    const index = messageStore.index('conversationId')
    const cursorRequest = index.openCursor(IDBKeyRange.only(id))
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }

    await transactionDone(tx)
  } catch {
    memoryMode = true
    memoryConversations.delete(id)
    for (const [messageId, message] of memoryMessages) {
      if (message.conversationId === id) memoryMessages.delete(messageId)
    }
  }
}

export async function clearAllData(): Promise<void> {
  memoryConversations.clear()
  memoryMessages.clear()

  if (memoryMode) return

  try {
    const db = await openDB()
    const tx = db.transaction([CONVERSATIONS, MESSAGES], 'readwrite')
    tx.objectStore(CONVERSATIONS).clear()
    tx.objectStore(MESSAGES).clear()
    await transactionDone(tx)
  } catch {
    memoryMode = true
  }
}

export async function listMessages(
  conversationId: string,
): Promise<ChatMessage[]> {
  if (memoryMode) {
    return [...memoryMessages.values()]
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  try {
    const db = await openDB()
    const tx = db.transaction(MESSAGES, 'readonly')
    const index = tx.objectStore(MESSAGES).index('conversationId')
    const rows = await requestToPromise(
      index.getAll(IDBKeyRange.only(conversationId)) as IDBRequest<ChatMessage[]>,
    )
    await transactionDone(tx)
    return rows.sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    memoryMode = true
    return [...memoryMessages.values()]
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }
}

export async function saveMessage(message: ChatMessage): Promise<void> {
  if (memoryMode) {
    memoryMessages.set(message.id, message)
    return
  }

  try {
    const db = await openDB()
    const tx = db.transaction(MESSAGES, 'readwrite')
    tx.objectStore(MESSAGES).put(message)
    await transactionDone(tx)
  } catch {
    memoryMode = true
    memoryMessages.set(message.id, message)
  }
}

export async function deleteMessage(id: string): Promise<void> {
  if (memoryMode) {
    memoryMessages.delete(id)
    return
  }

  try {
    const db = await openDB()
    const tx = db.transaction(MESSAGES, 'readwrite')
    tx.objectStore(MESSAGES).delete(id)
    await transactionDone(tx)
  } catch {
    memoryMode = true
    memoryMessages.delete(id)
  }
}

export async function countMessages(conversationId: string): Promise<number> {
  if (memoryMode) {
    return [...memoryMessages.values()].filter(
      (message) => message.conversationId === conversationId,
    ).length
  }

  try {
    const db = await openDB()
    const tx = db.transaction(MESSAGES, 'readonly')
    const index = tx.objectStore(MESSAGES).index('conversationId')
    const count = await requestToPromise(
      index.count(IDBKeyRange.only(conversationId)),
    )
    await transactionDone(tx)
    return count
  } catch {
    memoryMode = true
    return [...memoryMessages.values()].filter(
      (message) => message.conversationId === conversationId,
    ).length
  }
}
