/* eslint-disable no-console */
import { onMessage, sendMessage } from 'webext-bridge/content-script'
import { type App as VueApp, createApp } from 'vue'

import App from './views/App.vue'
import Tooltip from './views/Tooltip.vue'
import Prompt from './views/Prompt.vue'

import rangy from 'rangy'
import 'rangy/lib/rangy-classapplier'
import 'rangy/lib/rangy-serializer'

import { setupApp } from '~/logic/common-setup'

// Firefox `browser.tabs.executeScript()` requires scripts return a primitive value
import { type Mark } from '~/logic/storage'
import { RangySelection } from 'rangy/lib/rangy-core'

// 用于跟踪已成功恢复到页面上的标记，避免重复操作
const restoredMarkIds = new Set<string>()
let debounceTimer: number,
  tooltipApp: VueApp | any,
  promptApp: VueApp | any,
  currentSelection: RangySelection | null = null

function initialize() {
  rangy.init()
  console.info('[vitesse-webext] Hello world from content script')

  // communication example: send previous tab title from background page
  onMessage('tab-prev', ({ data }) => {
    console.log(`[vitesse-webext] Navigate from page "${data.title}"`)
  })

  // mount component to context window
  const container = document.createElement('div')

  container.id = __NAME__

  const root = document.createElement('div'),
    styleEl = document.createElement('link'),
    shadowDOM = container.attachShadow?.({ mode: __DEV__ ? 'open' : 'closed' }) || container

  styleEl.setAttribute('rel', 'stylesheet')

  styleEl.setAttribute('href', browser.runtime.getURL('dist/contentScripts/style.css'))

  shadowDOM.appendChild(styleEl)

  shadowDOM.appendChild(root)

  // 为工具提示创建一个单独的根
  const tooltipRoot = document.createElement('div'),
    promptRoot = document.createElement('div')

  shadowDOM.appendChild(tooltipRoot)

  shadowDOM.appendChild(promptRoot)

  document.body.appendChild(container)

  const app = createApp(App)

  setupApp(app)

  app.mount(root)

  // 挂载工具提示组件
  const tooltipVueApp = createApp(Tooltip, {
      onHighlight: () => handleHighlightAction(),
      onUnhighlight: () => handleUnhighlightAction(),
      onAddNote: () => handleAddNoteAction()
    }),
    promptVueApp = createApp(Prompt)

  tooltipApp = tooltipVueApp.mount(tooltipRoot)
  promptApp = promptVueApp.mount(promptRoot)

  // 页面加载时，开始恢复高亮
  restoreHighlights()
    .then(() => {
      console.log('restoreHighlights then')

      const hash = window.location.hash
      if (hash.startsWith('#__highlight-mark__')) {
        const markId = hash.substring('#__highlight-mark__'.length)
        console.log('restoreHighlights markId', markId)
        if (markId) {
          setTimeout(() => {
            // 使用一个小的延迟确保高亮渲染和页面布局稳定
            scrollToMark(markId)
            // 清理 URL，避免刷新时再次滚动
            history.replaceState(null, '', window.location.pathname + window.location.search)
          }, 100)
        }
      }
    })
    .catch((error) => {
      console.error('Error during highlight restoration or scrolling:', error)
    })
}

initialize()

window.addEventListener('mousedown', (event) => {
  // 使用 composedPath 来正确处理来自 Shadow DOM 的事件。
  // 如果点击发生在工具提示内部，则不执行任何操作。
  const path = event.composedPath()
  if (path.some((el) => el instanceof HTMLElement && el.classList.contains('webext-tooltip'))) return

  const target = event.target as HTMLElement
  // 如果点击发生在标记之外，则隐藏工具提示。
  // 如果点击发生在标记上，则 mouseup 事件将处理显示工具提示。
  if (!target.closest('span[class*="webext-highlight-"]')) tooltipApp?.hide()
})

window.addEventListener('mouseup', handlePageMouseUp)

function handlePageMouseUp(event: MouseEvent) {
  // 使用 composedPath 来正确处理来自 Shadow DOM 的事件。
  // 如果 mouseup 事件发生在工具提示内部，则忽略它，以防止它干扰按钮点击。
  const path = event.composedPath()

  if (event.button === 2 || path.some((el) => el instanceof HTMLElement && el.classList.contains('webext-tooltip')))
    return

  // 延迟一小段时间确保选区稳定
  setTimeout(() => {
    const selection = rangy.getSelection(),
      targetNode = event.target as Node,
      targetElement = (targetNode.nodeType === Node.ELEMENT_NODE ? targetNode : targetNode.parentNode) as HTMLElement,
      markElement = targetElement?.closest('span[class*="webext-highlight-"]')

    console.log('mouseup', targetElement, selection, markElement)

    if (!selection.isCollapsed) {
      // 情况1：用户选择了新的文本
      currentSelection = selection
      const isHighlighted = isSelectionHighlighted(selection)
      tooltipApp?.show(event.clientX, event.clientY, isHighlighted)
    } else if (markElement) {
      // 情况2：用户在没有进行新选择的情况下点击了现有的标记
      const range = rangy.createRange()
      range.selectNodeContents(markElement)
      selection.removeAllRanges()
      selection.addRange(range)
      currentSelection = selection
      tooltipApp?.show(event.clientX, event.clientY, true)
    } else {
      // 情况3：用户点击了页面的其他地方，并且没有选择文本
      tooltipApp?.hide()
    }
  }, 50)
}

function isSelectionHighlighted(selection: RangySelection): boolean {
  if (selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer

  // 检查容器或其任何父级是否是我们的 <mark> 元素
  let node: Node | null = container
  while (node) {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).tagName === 'SPAN' &&
      (node as HTMLElement).className.includes('webext-highlight-')
    )
      return true

    node = node.parentNode
  }
  return false
}

function handleHighlightAction() {
  if (currentSelection) {
    createHighlight(currentSelection)
    currentSelection = null
  }
}

function handleUnhighlightAction() {
  if (!currentSelection || currentSelection.isCollapsed) return

  const markElement = findMarkElementInSelection(currentSelection)

  console.log('handleUnhighlightAction', markElement)

  if (markElement) {
    const markId = getMarkIdFromElement(markElement)
    if (markId) {
      // 移除页面上的所有相关高亮元素
      const className = `webext-highlight-${markId}`
      document.querySelectorAll(`.${className}`).forEach((el) => {
        const parent = el.parentNode
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el)

          parent.removeChild(el)
        }
      })

      rangy.getSelection().removeAllRanges()
      currentSelection = null

      // 通知背景脚本从存储中删除标记
      sendMessage('remove-mark-by-id', { id: markId, url: getCanonicalUrlForMark() }, 'background')
    }
  }
}

async function handleAddNoteAction() {
  if (!currentSelection || currentSelection.isCollapsed) return

  const markElement = findMarkElementInSelection(currentSelection)

  if (markElement) {
    // 已存在高亮：编辑备注
    const markId = getMarkIdFromElement(markElement)

    if (markId) {
      // 从 background 获取旧备注
      const mark = await sendMessage('get-mark-by-id', { id: markId, url: getCanonicalUrlForMark() }, 'background')
      const oldNote = mark ? mark.note : '',
        note = await promptApp.show('请编辑或添加备注：', oldNote)
      if (note !== null)
        sendMessage('update-mark-note', { id: markId, url: getCanonicalUrlForMark(), note }, 'background')
    }
  } else {
    // 新高亮：创建并添加备注
    const serializedSelection = rangy.serializeSelection(currentSelection, true),
      note = await promptApp.show('请输入备注：', '')
    console.log('handleAddNoteAction', note, currentSelection)
    if (note !== null)
      // 恢复选区
      rangy.deserializeSelection(serializedSelection)
    // 现在使用恢复后的选区创建高亮
    createHighlight(rangy.getSelection(), note)
  }
}

function findMarkElementInSelection(selection: RangySelection): HTMLElement | null {
  if (selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  let node: Node | null = range.commonAncestorContainer
  while (node) {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).tagName === 'SPAN' &&
      (node as HTMLElement).className.includes('webext-highlight-')
    )
      return node as HTMLElement

    node = node.parentNode
  }
  return null
}

function getMarkIdFromElement(element: HTMLElement): string | null {
  const classNames = element.className.split(' ')
  const highlightClass = classNames.find((c) => c.startsWith('webext-highlight-'))
  if (highlightClass) return highlightClass.replace('webext-highlight-', '')

  return null
}

function createHighlight(selection: RangySelection, note?: string) {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  const className = `webext-highlight-${uniqueId}`

  const applier = rangy.createClassApplier(className, {
    elementName: 'span',
    elementAttributes: {
      style: 'background-color: yellow; cursor: pointer;'
    }
  })

  // 序列化选区，用于之后恢复和取消高亮
  const rangySerialized = rangy.serializeSelection(selection, true)
  const selectedText = selection.toString()

  // 应用高亮
  applier.applyToSelection()

  // 清除用户在屏幕上的选区
  selection.removeAllRanges()

  // 准备要存储的数据
  const markData: Mark = {
    id: uniqueId,
    url: getCanonicalUrlForMark(),
    text: selectedText,
    note: note || '', // 暂时硬编码
    color: 'yellow',
    rangySerialized,
    createdAt: Date.now(),
    title: document.title
  }

  // 通过 webext-bridge 将新标记发送到背景脚本进行存储
  sendMessage('add-mark', markData, 'background')
}

onMessage('goto-mark', ({ data }) => {
  scrollToMark(data.markId)
})

onMessage('remove-mark', ({ data: markToRemove }) => {
  if (!markToRemove || !markToRemove.id) return

  const className = `webext-highlight-${markToRemove.id}`

  document.querySelectorAll(`.${className}`).forEach((el) => {
    const parent = el.parentNode
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
    }
  })
})

function scrollToMark(markId: string) {
  // 在滚动前清除任何待定的恢复操作，以防止它们在滚动动画期间改变布局
  clearTimeout(debounceTimer)

  const className = `webext-highlight-${markId}`
  const element = document.querySelector(`.${className}`)
  if (element) {
    element.scrollIntoView({ behavior: 'auto', block: 'center' })
    // 可以给目标元素一个短暂的闪烁效果以提示用户
    document.querySelectorAll(`.${className}`).forEach((el) => {
      if (!(el instanceof HTMLElement)) return
      el.style.transition = 'background-color 0.5s ease-in-out'
      el.style.backgroundColor = 'lightgreen'
      setTimeout(() => {
        el.style.backgroundColor = 'yellow' // TODO: 应该恢复为标记的原始颜色
      }, 1000)
    })
  }
}

/**
 * 获取当前页面的规范化 URL，移除哈希和尾部斜杠
 */
function getCanonicalUrlForMark(): string {
  const urlObj = new URL(window.location.href)
  urlObj.hash = ''
  if (urlObj.pathname.length > 1 && urlObj.pathname.endsWith('/')) urlObj.pathname = urlObj.pathname.slice(0, -1)

  return urlObj.href
}

/**
 * 恢复高亮的主函数
 */
async function restoreHighlights() {
  // 1. 从背景脚本获取当前 URL 的所有标记
  const canonicalUrl = getCanonicalUrlForMark()
  console.log(`[content-script] Requesting marks for: ${canonicalUrl}`)
  const marks = await sendMessage('get-marks-for-url', { url: canonicalUrl }, 'background')

  console.log('restoreHighlights', marks)
  if (!marks || marks.length === 0) return

  // 2. 尝试应用这些标记
  const marksToRestore = marks.filter((mark) => !restoredMarkIds.has(mark.id))
  applyMarks(marksToRestore)

  // 3. 设置一个 DOM 变化观察者，以处理动态加载的内容
  const observer = new MutationObserver((mutations) => {
    // 我们只关心节点添加操作
    const hasAddedNodes = mutations.some((m) => m.addedNodes.length > 0)
    if (!hasAddedNodes) return

    // 使用防抖（debounce）来避免在 DOM 快速变化时频繁执行恢复操作
    debouncedRestore()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

/**
 * 防抖函数，用于在 DOM 稳定一小段时间后再次尝试恢复高亮
 */
function debouncedRestore() {
  clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(async () => {
    const canonicalUrl = getCanonicalUrlForMark(),
      marks = await sendMessage('get-marks-for-url', { url: canonicalUrl }, 'background')
    if (!marks) return
    const marksToRestore = marks.filter((mark) => !restoredMarkIds.has(mark.id))
    if (marksToRestore.length > 0) applyMarks(marksToRestore)
  }, 500)
}

/**
 * 遍历并应用标记到页面上
 */
function applyMarks(marks: Mark[]) {
  for (const mark of marks) {
    const className = `webext-highlight-${mark.id}`
    const applier = rangy.createClassApplier(className, {
      elementName: 'span',
      elementAttributes: { style: `background-color: ${mark.color}; cursor: pointer;` }
    })

    try {
      rangy.deserializeSelection(mark.rangySerialized)
      applier.applyToSelection()
      rangy.getSelection().removeAllRanges()
      // 如果成功，记录下来，不再重复尝试
      restoredMarkIds.add(mark.id)
    } catch (e) {
      // 在动态页面上，部分标记恢复失败是正常现象，MutationObserver 会在后续重试
    }
  }
}
