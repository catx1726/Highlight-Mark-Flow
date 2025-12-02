// 移除 watch, CLEANUP_DAYS_THRESHOLD
import { onMessage, sendMessage } from 'webext-bridge/background'
import type { Tabs } from 'webextension-polyfill'
// src/background/main.ts
import {
  type Mark,
  marksByUrl,
  dataReady,
  type RemoveMarkPayload,
  type UpdateMarkNotePayload,
  GetMarkByIdPayload
} from '~/logic/storage'
// only on dev mode
if (import.meta.hot) {
  // @ts-expect-error for background HMR
  import('/@vite/client')
  // load latest content script
  import('./contentScriptHMR')
}

// remove or turn this off if you don't use side panel
const USE_SIDE_PANEL = true

// to toggle the sidepanel with the action button in chromium:
if (USE_SIDE_PANEL) {
  // @ts-expect-error missing types
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => console.error(error))
}

browser.runtime.onInstalled.addListener((): void => {
  // eslint-disable-next-line no-console
  console.log('Extension installed')
})

let previousTabId = 0

// communication example: send previous tab title from background page
// see shim.d.ts for type declaration
browser.tabs.onActivated.addListener(async ({ tabId }) => {
  if (!previousTabId) {
    previousTabId = tabId
    return
  }

  let tab: Tabs.Tab

  try {
    tab = await browser.tabs.get(previousTabId)
    previousTabId = tabId
  } catch {
    return
  }

  // eslint-disable-next-line no-console
  console.log('previous tab', tab)
  sendMessage('tab-prev', { title: tab.title }, { context: 'content-script', tabId })
})

onMessage('get-current-tab', async () => {
  try {
    const tab = await browser.tabs.get(previousTabId)
    return {
      title: tab?.title
    }
  } catch {
    return {
      title: undefined
    }
  }
})

onMessage('add-mark', async ({ data }) => {
  console.log('Adding new mark:', data)
  const { url } = data
  if (!marksByUrl.value[url]) marksByUrl.value[url] = []

  marksByUrl.value[url].push(data)
})

onMessage('remove-mark', async ({ data: markToRemove }) => {
  const { url, id } = markToRemove
  if (marksByUrl.value[url]) {
    marksByUrl.value[url] = marksByUrl.value[url].filter((m) => m.id !== id)

    // 如果该 URL 下已无标记，则删除此 URL 条目
    if (marksByUrl.value[url].length === 0) delete marksByUrl.value[url]
  }
})

onMessage('get-marks-for-url', async ({ data }) => {
  console.log(`[background] Received get-marks-for-url for: ${data.url}`)
  await dataReady
  console.log(`[background] Storage is ready. dataReady.value is: ${dataReady}`)
  const { url } = data
  const result = marksByUrl.value[url] || []
  console.log(`[background] Returning ${result.length} marks for ${url}`)
  return result
})

onMessage<RemoveMarkPayload>('remove-mark-by-id', async ({ data }) => {
  const { url, id } = data
  if (marksByUrl.value[url]) {
    marksByUrl.value[url] = marksByUrl.value[url].filter((m) => m.id !== id)

    if (marksByUrl.value[url].length === 0) delete marksByUrl.value[url]
  }
})

onMessage<UpdateMarkNotePayload>('update-mark-note', async ({ data }) => {
  const { url, id, note } = data
  if (marksByUrl.value[url]) {
    const markToUpdate = marksByUrl.value[url].find((m) => m.id === id)
    if (markToUpdate) markToUpdate.note = note
  }
})

onMessage<GetMarkByIdPayload>('get-mark-by-id', async ({ data }) => {
  const { url, id } = data
  if (marksByUrl.value[url]) {
    return marksByUrl.value[url].find((m) => m.id === id)
  }
  return undefined
})

onMessage('get-storage-usage', async () => {
  const usage = await browser.storage.local.getBytesInUse()

  // 1. 尝试从 browser.storage.local 获取 QUOTA_BYTES
  // 仅 Chrome/Edge (5MB) 会有值，Firefox 为 undefined
  const rawQuota = (browser.storage.local as any).QUOTA_BYTES

  let quota: number | null

  if (typeof rawQuota === 'number') {
    // 2. 如果 rawQuota 是数字 (Chrome/Edge)，则使用它
    quota = rawQuota
  } else {
    // 3. 如果 rawQuota 不存在 (Firefox)，则返回 null，
    //    表示浏览器没有提供官方的 API 常量来获取此限制。
    //    (如果您想硬编码 10MB 的 Firefox 限制，可以改为 10 * 1024 * 1024)
    quota = 10 * 1024 * 1024
  }

  return { usage, quota }
})

onMessage('cleanup-old-marks', async ({ data }) => {
  const { days } = data
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000
  const allMarks = marksByUrl.value // <-- 修正
  const keptMarks = Object.values(allMarks)
    .flat()
    .filter((mark: Mark) => mark.createdAt > threshold) // <-- 为 mark 显式添加类型

  // 重新构建以 URL 分组的 marks 对象
  marksByUrl.value = keptMarks.reduce((acc, mark) => {
    // <-- 修正
    if (!acc[mark.url]) acc[mark.url] = []
    acc[mark.url].push(mark)
    return acc
  }, {} as Record<string, Mark[]>) // <-- 为初始值添加类型断言
})

onMessage('cleanup-useless-marks', () => {
  const allMarks = marksByUrl.value // <-- 修正
  const keptMarks = Object.values(allMarks)
    .flat()
    .filter((mark: Mark) => mark.note && mark.note.trim() !== '') // <-- 为 mark 显式添加类型

  marksByUrl.value = keptMarks.reduce((acc, mark) => {
    // <-- 修正
    if (!acc[mark.url]) acc[mark.url] = []
    acc[mark.url].push(mark)
    return acc
  }, {} as Record<string, Mark[]>) // <-- 为初始值添加类型断言
})

onMessage<{ tabId: number }>('open-sidepanel', async ({ data }) => {
  console.log('[vitesse-webext] Opening side panel', data)

  const { tabId } = data

  if (!tabId) {
    console.error('Tab ID missing for opening side panel.')
    return { success: false, error: 'Tab ID missing' }
  }

  try {
    // 1. Chrome/Chromium 兼容性检查和调用
    // @ts-expect-error missing types

    if (browser.sidePanel && typeof (browser.sidePanel as any).open === 'function') {
      // Chrome (MV3)
      // @ts-expect-error missing types
      await (browser.sidePanel as any).open({ tabId })
      return { success: true, browser: 'Chrome' }
    }

    // 2. Firefox 兼容性检查和调用
    // Firefox 使用 sidebarAction
    else if (browser.sidebarAction && typeof browser.sidebarAction.open === 'function') {
      // Firefox 的 open() 不需要 tabId，它会在当前窗口（Popup 所在的窗口）打开
      await browser.sidebarAction.open()
      return { success: true, browser: 'Firefox' }
    }

    // 3. Fallback
    return { success: false, error: 'Side panel/Sidebar API not found.' }
  } catch (e) {
    console.error('Failed to open side panel/sidebar:', e)
    // 返回一个明确的错误信息
    return { success: false, error: `API call failed: ${(e as Error).message}` }
  }
})
