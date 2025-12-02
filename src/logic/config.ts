import { ref } from 'vue'

// --- Colors ---
export const highlightColors = [
  '#FFFF00', // yellow
  '#99FF99', // green
  '#FF9999', // red
  '#99CCFF', // blue
  '#FFCC99' // orange
]

export const defaultHighlightColor = ref(highlightColors[0])

export const highlightDefaultStyle = (color: string | Ref<string> = defaultHighlightColor.value) =>
  `box-shadow: inset 0 -5px 0 0 ${color}; cursor: pointer;`

// --- Shortcuts ---
export const shortcuts = {
  openSidePanel: 'Alt+S'
}

// --- Cleanup ---
export const CLEANUP_DAYS_THRESHOLD = 30
