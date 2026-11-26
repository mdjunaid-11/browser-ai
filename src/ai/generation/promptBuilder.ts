import type { ModelMessage } from '../worker/protocol'

export const SYSTEM_PROMPT =
  'You are Browser AI, a friendly and concise AI companion running locally in the user’s browser. ' +
  'Answer the latest user message directly and helpfully. Use short paragraphs or simple lists. ' +
  'If you are unsure or do not know, say so honestly instead of inventing facts. ' +
  'You are a small local model, so keep answers focused.'

const MAX_HISTORY_CHARS = 2200
const MAX_MESSAGE_CHARS = 900

export function truncateText(text: string, maxChars: number): string {
  const clean = text.trim()
  if (clean.length <= maxChars) return clean
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

/**
 * T5 is an encoder–decoder model and does not have a chat template. We build a
 * plain instruction/transcript prompt instead of pretending it supports one.
 */
export function buildSeq2SeqPrompt(
  messages: ModelMessage[],
  contextTurns: number,
): string {
  const conversational = messages.filter(
    (message) => message.role !== 'system' && message.content.trim().length > 0,
  )

  const recent = conversational.slice(-Math.max(2, contextTurns * 2))
  const lines: string[] = [
    'You are Browser AI, a friendly and concise assistant. Answer the latest user message directly. If you do not know something, say so.',
    '',
  ]

  let used = 0
  const history: string[] = []

  for (const message of recent) {
    const prefix = message.role === 'user' ? 'User: ' : 'Assistant: '
    const content = truncateText(message.content, MAX_MESSAGE_CHARS)
    const line = `${prefix}${content}`
    if (used + line.length > MAX_HISTORY_CHARS && history.length > 0) break
    history.push(line)
    used += line.length
  }

  lines.push(...history)

  const last = recent[recent.length - 1]
  if (!last || last.role !== 'user') {
    lines.push('User: Hello')
  }

  lines.push('Assistant:')
  return lines.join('\n')
}

/**
 * Causal chat models use their own chat template when one is available.
 * This fallback is only used when a template is missing.
 */
export function buildCausalMessages(
  messages: ModelMessage[],
  contextTurns: number,
): ModelMessage[] {
  const conversational = messages.filter(
    (message) => message.content.trim().length > 0,
  )
  const recent = conversational.slice(-Math.max(2, contextTurns * 2))
  const trimmed = recent.map((message) => ({
    role: message.role,
    content: truncateText(message.content, MAX_MESSAGE_CHARS),
  }))

  return [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed]
}

export function buildFallbackChatPrompt(messages: ModelMessage[]): string {
  const lines = [SYSTEM_PROMPT, '']
  for (const message of messages) {
    if (message.role === 'system') continue
    lines.push(message.role === 'user' ? `User: ${message.content}` : `Assistant: ${message.content}`)
  }
  lines.push('Assistant:')
  return lines.join('\n')
}

/**
 * Small models sometimes leak the prompt or repeat the conversation format.
 * This removes common artifacts without changing the meaning of the answer.
 */
export function cleanModelOutput(text: string): string {
  let output = text
    .replace(/<\|[^|]+\|>/g, '')
    .replace(/<\/?s>/g, '')
    .replace(/^\s*(Assistant|Browser AI)\s*:\s*/i, '')
    .trim()

  const cutMarkers = [
    '\nUser:',
    '\nHuman:',
    '\n###',
    '\nAssistant:',
    '\nSystem:',
    '\nQ:',
  ]
  for (const marker of cutMarkers) {
    const index = output.indexOf(marker)
    if (index > 0) output = output.slice(0, index)
  }

  output = output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return output
}

export function buildTtsText(text: string, maxChars = 1400): string {
  const clean = text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>~]/g, '')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/\s+/g, ' ')
    .trim()

  if (clean.length <= maxChars) return clean
  const clipped = clean.slice(0, maxChars)
  const lastStop = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('! '),
    clipped.lastIndexOf('? '),
  )
  return (lastStop > maxChars * 0.6 ? clipped.slice(0, lastStop + 1) : clipped).trim()
}
