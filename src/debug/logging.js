export const DEBUG_LOGS_KEY = 'nimfeed_debug_logs'

export function isDebugLogsEnabled() {
  if (!import.meta.env.DEV) return false
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(DEBUG_LOGS_KEY) !== '0'
}

export function setDebugLogsEnabled(enabled) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEBUG_LOGS_KEY, enabled ? '1' : '0')
}
