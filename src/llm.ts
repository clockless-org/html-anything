/**
 * Minimal LLM helper. Picks a provider from environment:
 *
 *   ANTHROPIC_API_KEY  → Claude (default model: claude-haiku-4-5-20251001)
 *   OPENAI_API_KEY     → GPT
 *
 * Converters get only the `ask` method — no streaming, no tool use, no
 * model picking. Keep this small on purpose: converters that need more
 * should be doing LESS LLM work, not more.
 */
import type { LlmHelper } from "./types.js"

export function makeLlm(): LlmHelper | null {
  const anthropic = process.env.ANTHROPIC_API_KEY
  if (anthropic) return makeClaude(anthropic)
  const openai = process.env.OPENAI_API_KEY
  if (openai) return makeOpenAi(openai)
  return null
}

function makeClaude(apiKey: string): LlmHelper {
  return {
    async ask(prompt, opts = {}) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model || "claude-sonnet-4-6",
          max_tokens: opts.maxTokens ?? 16384,
          messages: [{ role: "user", content: prompt }],
        }),
      })
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const json = await res.json() as { content?: Array<{ type: string; text?: string }> }
      return (json.content || []).map(b => b.text || "").join("").trim()
    },
  }
}

function makeOpenAi(apiKey: string): LlmHelper {
  return {
    async ask(prompt, opts = {}) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model || "gpt-5-mini",
          max_tokens: opts.maxTokens ?? 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      })
      if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      return (json.choices?.[0]?.message?.content || "").trim()
    },
  }
}
