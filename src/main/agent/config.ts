// Model used for every Termless conversation. Overridable for development
// with TERMLESS_MODEL / TERMLESS_EFFORT.
export const AGENT_MODEL = process.env.TERMLESS_MODEL || 'gpt-5.6-terra'
export const AGENT_EFFORT = process.env.TERMLESS_EFFORT || 'low'

// Conversations are kept by Codex so they can be continued later. Tests set
// TERMLESS_EPHEMERAL_THREADS=1 to leave nothing behind.
export const EPHEMERAL_THREADS = process.env.TERMLESS_EPHEMERAL_THREADS === '1'
