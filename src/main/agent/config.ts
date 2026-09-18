// Model used for every Termless conversation. Overridable for development
// with TERMLESS_MODEL / TERMLESS_EFFORT.
export const AGENT_MODEL = process.env.TERMLESS_MODEL || 'gpt-5.6-terra'
export const AGENT_EFFORT = process.env.TERMLESS_EFFORT || 'low'
