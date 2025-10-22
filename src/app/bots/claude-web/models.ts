// Centralized list of known Claude webapp model slugs (as of 2025-10).
// Source: Anthropic Docs (Web Search / Web Fetch tool pages) and public announcements.
// Use base aliases (without date suffix) where supported; include legacy fallbacks last.

export type ClaudeWebModelInfo = { name: string; slug: string }

export const CLAUDE_WEB_KNOWN_MODELS: ClaudeWebModelInfo[] = [
  { name: 'Sonnet 4.5', slug: 'claude-sonnet-4-5' },
  { name: 'Sonnet 4', slug: 'claude-sonnet-4' },
  { name: 'Sonnet 3.7', slug: 'claude-3-7-sonnet' },
  { name: 'Haiku 4.5', slug: 'claude-haiku-4-5' },
  { name: 'Haiku 3.5', slug: 'claude-3-5-haiku-latest' },
  { name: 'Opus 4.1', slug: 'claude-opus-4-1' },
  { name: 'Opus 4', slug: 'claude-opus-4' },
  { name: 'Sonnet 3.5 (latest)', slug: 'claude-3-5-sonnet-latest' },
  // Legacy fallbacks
  { name: 'Claude 3 Sonnet (legacy)', slug: 'claude-3-sonnet' },
  { name: 'Claude 3 Opus (legacy)', slug: 'claude-3-opus' },
  { name: 'Claude 3.5 Sonnet (legacy)', slug: 'claude-3.5-sonnet' },
  { name: 'Claude 2.1 (legacy)', slug: 'claude-2.1' },
  { name: 'Claude 2.0 (legacy)', slug: 'claude-2.0' },
]

export const CLAUDE_WEB_PREFERRED_MODEL_SLUGS: string[] = CLAUDE_WEB_KNOWN_MODELS
  // Put newest first; legacy items last as defined above
  .map((m) => m.slug)

