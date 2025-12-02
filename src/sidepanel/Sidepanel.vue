<!-- src/sidepanel/Sidepanel.vue -->
<script setup lang="ts">
import { sendMessage } from 'webext-bridge/popup'
import { computed, nextTick, onMounted, ref } from 'vue'
import { CLEANUP_DAYS_THRESHOLD } from '~/logic/config'
import type { Mark } from '~/logic/storage'
import { marksByUrl } from '~/logic/storage'

const editingMarkId = ref<string | null>(null)
const editingNote = ref('')
const currentEditingRef = ref<HTMLTextAreaElement | null>(null)

const storageUsage = ref(0)
const storageQuota = ref(0)

const storageUsagePercent = computed(() => {
  if (!storageQuota.value) return 0
  return (storageUsage.value / storageQuota.value) * 100
})

onMounted(() => {
  getStorageUsage()
})

async function editMark(mark: Mark) {
  editingMarkId.value = mark.id
  editingNote.value = mark.note
  await nextTick()
  currentEditingRef.value?.focus()
}

async function saveNote(mark: Mark) {
  if (editingMarkId.value === mark.id) {
    await sendMessage('update-mark-note', { id: mark.id, url: mark.url, note: editingNote.value }, 'background')
    editingMarkId.value = null
    editingNote.value = ''
  }
}

function cancelEdit() {
  editingMarkId.value = null
  editingNote.value = ''
}

function setEditingRef(el: Element | null) {
  // 只有当元素存在且是 textarea 时，才赋值给 currentEditingRef
  if (el instanceof HTMLTextAreaElement) {
    currentEditingRef.value = el
  } else {
    // 清除引用
    currentEditingRef.value = null
  }
}

function getHostname(url: string) {
  return new URL(url).hostname
}

function getNormalizedUrlForTabMatching(url: string | URL): string {
  const urlObj = typeof url === 'string' ? new URL(url) : url
  let path = urlObj.pathname
  // 移除路径末尾的斜杠（根路径 / 除外）
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  return urlObj.origin + path
}

function getPageTitle(marks: Mark[]) {
  if (!marks || marks.length === 0) return '未知页面'

  // 默认使用第一个标记的标题作为页面标题
  return marks[0]?.title || getHostname(marks[0]?.url)
}

async function gotoMark(mark: Mark) {
  // A more robust way to find the tab, ignoring query parameters and hash
  const allTabs = await browser.tabs.query({ currentWindow: true }),
    targetUrl = getNormalizedUrlForTabMatching(mark.url)

  let tab = allTabs.find((t) => {
    if (!t.url) return false
    try {
      return getNormalizedUrlForTabMatching(t.url) === targetUrl
    } catch (e) {
      return false
    }
  })

  if (tab?.id) {
    // 如果找到了，激活它并发送消息
    await browser.tabs.update(tab.id, { active: true })
    sendMessage('goto-mark', { markId: mark.id }, { context: 'content-script', tabId: tab.id })
  } else {
    // 如果找不到，新建一个 Tab 并用 hash 传递要跳转的标记 ID
    const urlWithHash = new URL(mark.url)

    urlWithHash.hash = `__highlight-mark__${mark.id}`

    tab = await browser.tabs.create({ url: urlWithHash.href, active: true })
  }

  if (!tab?.id) {
    console.error('无法创建或找到 Tab。')
    return
  }
}

async function removeMark(mark: Mark) {
  await sendMessage('remove-mark', mark, 'background')

  // Also use the robust tab finding logic for removing marks from the page
  const allTabs = await browser.tabs.query({ currentWindow: true }),
    targetUrl = getNormalizedUrlForTabMatching(mark.url)

  const tab = allTabs.find((t) => {
    if (!t.url) return false
    try {
      return getNormalizedUrlForTabMatching(t.url) === targetUrl
    } catch (e) {
      return false
    }
  })
  if (tab?.id) sendMessage('remove-mark', mark, { context: 'content-script', tabId: tab.id })
}

async function getStorageUsage() {
  const { usage, quota } = await sendMessage('get-storage-usage', {}, 'background')
  storageUsage.value = usage
  storageQuota.value = quota
}

async function cleanupOldMarks() {
  if (confirm(`确定要清理 ${CLEANUP_DAYS_THRESHOLD} 天前的所有标记吗？此操作不可撤销。`)) {
    await sendMessage('cleanup-old-marks', { days: CLEANUP_DAYS_THRESHOLD }, 'background')
    await getStorageUsage()
    // TODO 清理之后需要再次更新页面标记
  }
}

async function cleanupUselessMarks() {
  if (confirm('确定要清理所有没有备注的标记吗？此操作不可撤销。')) {
    await sendMessage('cleanup-useless-marks', {}, 'background')
    await getStorageUsage()
    // TODO 清理之后需要再次更新页面标记
  }
}

function exportToMarkdown(urlMarks: Mark[], pageTitle: string) {
  // TODO 导出的内容应该携带 url，方便跳转到对应页面
  let markdown = `# ${pageTitle}\n\n`

  for (const mark of urlMarks) {
    // 使用 ">" 引用块来表示高亮文本
    markdown += `> ${mark.text.replace(/>/g, '\\>')}\n\n`
    if (mark.note) markdown += `${mark.note}\n\n`

    markdown += '---\n\n'
  }

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  // 移除文件名中的非法字符
  const safeFileName = pageTitle.replace(/[/\\?%*:|"<>]/g, '-')
  a.download = `${safeFileName}.md`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <main class="p-4 bg-gray-50 min-h-screen font-sans">
    <h1 class="text-xl font-bold text-center text-gray-800 my-4">标记管理</h1>
    <div class="space-y-6 pb-30">
      <div
        v-if="Object.keys(marksByUrl).length === 0"
        class="flex flex-col items-center justify-center text-gray-500 pt-10"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-16 h-16 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
          />
        </svg>
        <p class="mt-4">还没有任何标记</p>
        <p class="text-sm text-gray-400">在网页上选中文本试试看</p>
      </div>
      <div v-else>
        <section
          v-for="[url, urlMarks] in Object.entries(marksByUrl)"
          :key="url"
          class="bg-white rounded-lg shadow-sm p-4 mb-4"
        >
          <header class="flex justify-between items-center pb-2 mb-2 border-b border-gray-200">
            <h2 class="text-base font-semibold text-gray-700 truncate flex-1 min-w-0" :title="url">
              {{ getPageTitle(urlMarks) }}
            </h2>
            <button
              class="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md"
              @click="exportToMarkdown(urlMarks, getPageTitle(urlMarks))"
            >
              导出
            </button>
          </header>
          <ul class="space-y-2">
            <li v-for="mark in urlMarks" :key="mark.id" class="group">
              <div class="flex items-start justify-between">
                <div class="flex-1 cursor-pointer" @click="gotoMark(mark)">
                  <p class="font-medium text-gray-800">
                    {{ mark.text }}
                  </p>
                  <div v-if="editingMarkId === mark.id" class="mt-2">
                    <textarea
                      v-model="editingNote"
                      :ref="setEditingRef"
                      class="w-full border-gray-300 rounded-md shadow-sm p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                      @keydown.enter.prevent="saveNote(mark)"
                      @keydown.esc="cancelEdit"
                    />
                    <div class="flex justify-end gap-2 mt-2">
                      <button
                        class="text-xs px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md"
                        @click.stop="cancelEdit"
                      >
                        取消
                      </button>
                      <button
                        class="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                        @click.stop="saveNote(mark)"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                  <p v-else class="text-sm text-gray-500 mt-1 hover:text-blue-600" @click.stop="editMark(mark)">
                    {{ mark.note.length > 0 ? mark.note : '点击添加备注...' }}
                  </p>
                </div>
                <button
                  class="ml-2 p-1 text-gray-400 hover:text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除标记"
                  @click="removeMark(mark)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fill-rule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <div class="fixed bottom-0 left-0 right-0 z-10 p-4 bg-white border-t shadow-lg" style="width: 100%">
      <h2 class="text-lg font-semibold text-gray-700 mb-2">存储管理</h2>
      <div class="text-sm text-gray-600">
        <p>
          已用空间: {{ (storageUsage / 1024).toFixed(2) }} KB /
          <span v-if="storageQuota">{{ (storageQuota / 1024 / 1024).toFixed(2) }} MB</span>
          <span v-else>无已知限制</span>
        </p>
        <div class="w-full bg-gray-200 rounded-full h-2.5 mt-1">
          <div class="bg-blue-600 h-2.5 rounded-full" :style="{ width: `${storageUsagePercent}%` }"></div>
        </div>
      </div>
      <div class="mt-4 flex gap-2">
        <button
          class="text-xs px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 rounded-md"
          @click="cleanupOldMarks"
        >
          清理 {{ CLEANUP_DAYS_THRESHOLD }} 天前的标记
        </button>
        <button
          class="text-xs px-3 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-md"
          @click="cleanupUselessMarks"
        >
          清理无备注的标记
        </button>
      </div>
    </div>
  </main>
</template>
