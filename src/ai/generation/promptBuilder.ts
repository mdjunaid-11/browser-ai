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

export type PromptStrategy = 'seq2seq-instruction' | 'causal-chat'

export function getPromptStrategy(modelId?: string): PromptStrategy {
  const id = (modelId ?? '').toLowerCase()
  if (id.includes('flan') || id.includes('t5')) return 'seq2seq-instruction'
  return 'causal-chat'
}

function normalizeMessages(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = []
  for (const message of messages) {
    if (!message.content || !message.content.trim()) continue
    const previous = out[out.length - 1]
    if (
      previous &&
      previous.role === message.role &&
      previous.content.trim() === message.content.trim()
    ) {
      continue
    }
    out.push({ ...message, content: message.content.trim() })
  }
  return out
}

export function buildSeq2SeqPrompt(
  messages: ModelMessage[],
  contextTurns: number,
  _modelId?: string,
): string {
  const conversational = messages.filter(
    (message) => message.role !== 'system' && message.content.trim().length > 0,
  )
  const normalized = normalizeMessages(conversational)
  const turns = Math.max(1, Math.min(Number.isFinite(contextTurns) ? contextTurns : 4, 4))
  const recent = normalized.slice(-Math.max(2, turns * 2))

  const lines: string[] = [
    'You are a helpful assistant. Answer the user\'s request directly in one short, clear response. Do not generate dialogue, conversation transcripts, role labels, or imaginary messages. Only provide the answer.',
    '',
  ]

  const history: string[] = []
  let used = 0
  for (const message of recent) {
    const prefix = message.role === 'user' ? 'User' : 'Assistant'
    const content = truncateText(message.content, MAX_MESSAGE_CHARS)
    const line = `${prefix}: ${content}`
    if (used + line.length > MAX_HISTORY_CHARS && history.length > 0) break
    history.push(line)
    used += line.length
  }

  if (history.length > 0) {
    lines.push('Relevant conversation context:')
    lines.push(...history)
    lines.push('')
  }

  const last = recent[recent.length - 1]
  if (!last || last.role !== 'user') {
    lines.push('User: Hello')
    lines.push('')
  }

  lines.push(
    'Now answer the latest user message directly. Do not include "User:", "Assistant:", "Human:", "System:", or any other role label in the answer. Provide only the answer.',
  )
  lines.push('Assistant:')
  return lines.join('\n')
}

export function buildCausalMessages(
  messages: ModelMessage[],
  contextTurns: number,
): ModelMessage[] {
  const conversational = messages.filter(
    (message) => message.content.trim().length > 0,
  )
  const normalized = normalizeMessages(conversational)
  const turns = Math.max(1, Number.isFinite(contextTurns) ? contextTurns : 4)
  const recent = normalized.slice(-Math.max(2, turns * 2))
  const trimmed = recent.map((message) => ({
    role: message.role,
    content: truncateText(message.content, MAX_MESSAGE_CHARS),
  }))

  return [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed]
}

export function buildFallbackChatPrompt(messages: ModelMessage[]): string {
  const lines = [SYSTEM_PROMPT, '']
  for (const message of normalizeMessages(messages)) {
    if (message.role === 'system') continue
    lines.push(
      message.role === 'user'
        ? `User: ${message.content}`
        : `Assistant: ${message.content}`,
    )
  }
  lines.push('Assistant:')
  return lines.join('\n')
}

function stripSpecialTokens(text: string): string {
  return text
    .replace(/<\|[^|]*\|>/g, '')
    .replace(/<\/?s>/gi, '')
    .replace(/\[\/?INST\]/gi, '')
    .replace(/<\/?assistant>/gi, '')
}

function stripLeadingRoleLabel(text: string): string {
  return text.replace(/^\s*(Assistant|Browser AI|Answer|Response|Final)\s*:\s*/i, '')
}

function cutTrailingTurns(text: string): string {
  const cutMarkers = [
    '\nUser:',
    '\nHuman:',
    '\n###',
    '\nAssistant:',
    '\nSystem:',
    '\nQ:',
    '\nA:',
  ]
  let output = text
  for (const marker of cutMarkers) {
    const index = output.indexOf(marker)
    if (index > 0) output = output.slice(0, index)
  }
  return output
}

function collapseRepeatedWords(text: string): string {
  let output = text.replace(/\b([\w'-]{3,})([.!?]?)\s+\1\b/gi, '$1$2')
  output = output.replace(/\b([\w'-]{3,})[.!?]\s*\1\b/gi, '$1.')
  return output
}

function collapseRepeatedSentences(text: string): string {
  let output = text
  for (let i = 0; i < 3; i += 1) {
    const next = output.replace(
      /([^.!?\n]{8,}[.!?])\s+\1(?=\s|$)/gi,
      '$1',
    )
    if (next === output) break
    output = next
  }
  return output
}

export function cleanModelOutput(text: string): string {
  let output = stripSpecialTokens(text)
  output = stripLeadingRoleLabel(output).trim()
  output = cutTrailingTurns(output)
  output = collapseRepeatedWords(output)
  output = collapseRepeatedSentences(output)
  output = output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return output
}

export function hasFakeDialogue(text: string): boolean {
  return /(^|\n)\s*(User|Human|Assistant|System|Conversation)\s*:/i.test(text)
}

export function isMalformedModelOutput(text: string, prompt?: string): boolean {
  const cleaned = cleanModelOutput(text)
  if (!cleaned.trim()) return true
  if (prompt) {
    const promptText = prompt.trim()
    if (promptText && cleaned === promptText) return true
    if (promptText.length > 20 && cleaned.startsWith(promptText.slice(0, 60))) {
      return true
    }
  }
  if (hasFakeDialogue(cleaned)) return true
  if (/(.)\1{7,}/.test(cleaned)) return true
  const roleLabels = cleaned.match(/(^|\n)\s*(User|Human|Assistant|System)\s*:/gi)
  if (roleLabels && roleLabels.length > 0) return true
  return false
}

export interface OutputValidationResult {
  text: string
  valid: boolean
  reason?: string
}

export function validateModelOutput(
  text: string,
  prompt?: string,
): OutputValidationResult {
  const cleaned = cleanModelOutput(text)
  const valid = !isMalformedModelOutput(cleaned, prompt) && cleaned.trim().length > 0
  return {
    text: cleaned,
    valid,
    reason: valid ? undefined : 'malformed',
  }
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

export const normalizeModelOutput = cleanModelOutput
export const validateOutput = validateModelOutput
export const processModelOutput = validateModelOutput
export { getGenerationConfig } from './generationConfig'
