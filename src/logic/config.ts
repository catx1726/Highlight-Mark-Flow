import { defaultSettings } from './settings'

export const highlightDefaultStyle = (color: string | Ref<string> = defaultSettings.defaultHighlightColor) =>
  `box-shadow: inset 0 -5px 0 0 ${color}; cursor: pointer;`

// --- Shortcuts ---
export const shortcuts = {
  openSidePanel: 'Alt+S'
}

// --- Cleanup ---
export const CLEANUP_DAYS_THRESHOLD = 30
