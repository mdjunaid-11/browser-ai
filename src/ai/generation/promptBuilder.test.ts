import { describe, expect, it } from 'vitest'
import {
  buildCausalMessages,
  buildSeq2SeqPrompt,
  buildTtsText,
  cleanModelOutput,
  truncateText,
} from './promptBuilder'

describe('buildSeq2SeqPrompt', () => {
  it('includes recent turns and ends with an assistant cue', () => {
    const prompt = buildSeq2SeqPrompt(
      [
        { role: 'user', content: 'Hello there' },
        { role: 'assistant', content: 'Hi! How can I help?' },
        { role: 'user', content: 'Explain rain in one sentence.' },
      ],
      4,
    )

    expect(prompt).toContain('User: Hello there')
    expect(prompt).toContain('Assistant: Hi! How can I help?')
    expect(prompt).toContain('User: Explain rain in one sentence.')
    expect(prompt.trimEnd().endsWith('Assistant:')).toBe(true)
  })

  it('keeps only the requested number of recent turns', () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `turn-${index}`,
    }))

    const prompt = buildSeq2SeqPrompt(messages, 1)
    expect(prompt).toContain('turn-11')
    expect(prompt).not.toContain('turn-0')
  })

  it('adds a fallback user line when history ends with an assistant message', () => {
    const prompt = buildSeq2SeqPrompt(
      [{ role: 'assistant', content: 'I am ready.' }],
      2,
    )
    expect(prompt).toContain('User: Hello')
  })
})

describe('buildCausalMessages', () => {
  it('prepends a system prompt and trims old history', () => {
    const messages = Array.from({ length: 10 }, (_, index) => ({
      role: 'user' as const,
      content: `message-${index}`,
    }))

    const result = buildCausalMessages(messages, 1)
    expect(result[0].role).toBe('system')
    expect(result.some((message) => message.content === 'message-9')).toBe(true)
    expect(result.some((message) => message.content === 'message-0')).toBe(false)
  })
})

describe('cleanModelOutput', () => {
  it('removes leaked role prefixes and trailing prompt text', () => {
    expect(cleanModelOutput('Assistant: Hello there\nUser: next question')).toBe(
      'Hello there',
    )
  })

  it('strips special tokens and excessive blank lines', () => {
    expect(cleanModelOutput('<|endoftext|>Hi\n\n\n\nfriend')).toBe('Hi\n\nfriend')
  })
})

describe('buildTtsText', () => {
  it('removes code fences and markdown syntax', () => {
    const text = buildTtsText(
      '**Hello** `world`\n```js\nconsole.log(1)\n```\nRead more: https://example.com',
    )
    expect(text).not.toContain('```')
    expect(text).not.toContain('**')
    expect(text).toContain('code block')
    expect(text).toContain('link')
  })

  it('truncates at a sentence boundary when possible', () => {
    const text = buildTtsText('One sentence. Two sentence. Three sentence.', 30)
    expect(text.length).toBeLessThanOrEqual(31)
    expect(text.endsWith('.')).toBe(true)
  })
})

describe('truncateText', () => {
  it('returns short text unchanged', () => {
    expect(truncateText('short', 20)).toBe('short')
  })

  it('adds an ellipsis when clipping', () => {
    const result = truncateText('abcdefghij', 5)
    expect(result).toBe('abcd…')
    expect(result.length).toBe(5)
  })
})
