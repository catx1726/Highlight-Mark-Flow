import { useWebExtensionStorage } from '~/composables/useWebExtensionStorage'

export const defaultSettings = {
  defaultHighlightColor: '#FFFF00', // yellow
  highlightColors: [
    '#FFFF00', // yellow
    '#99FF99', // green
    '#FF9999', // red
    '#99CCFF', // blue
    '#FFCC99' // orange
  ],
  blacklist: [] as string[],
  shortcutSave: 'Alt+S',
  shortcutDelete: 'Alt+D'
}

export const { data: settings, dataReady: settingsReady } = useWebExtensionStorage('webext-settings', defaultSettings)
