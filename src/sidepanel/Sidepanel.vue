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
const copiedMarkId = ref<string | null>(null)

const storageUsage = ref(0)
const storageQuota = ref(0)

const storageUsagePercent = computed(() => {
  if (!storageQuota.value) return 0
  return (storageUsage.value / storageQuota.value) * 100
})

onMounted(() => {
  getStorageUsage()
})

async function removeAllMarksForUrl(url: string) {
  if (confirm(`确定要删除此页面下的所有标记吗？此操作不可撤销。`)) {
    await sendMessage('remove-marks-by-url', { url }, 'background')
    // 删除后，广播刷新以更新所有内容脚本
    await broadcastRefresh()
  }
}

function openOptionsPage() {
  browser.runtime.openOptionsPage()
}

async function copyMarkText(mark: Mark) {
  try {
    await navigator.clipboard.writeText('引文：' + mark.text + '\n' + '备注：' + mark.note)
    copiedMarkId.value = mark.id
    setTimeout(() => {
      copiedMarkId.value = null
    }, 2000)
  } catch (err) {
    console.error('Failed to copy: ', err)
  }
}

async function editMark(mark: Mark) {
  editingMarkId.value = mark.id
  editingNote.value = mark.note
  await nextTick()
  currentEditingRef.value?.focus()
}

async function saveNote(mark: Mark) {
  if (editingMarkId.value === mark.id) {
    await sendMessage('update-mark-details', { id: mark.id, url: mark.url, note: editingNote.value }, 'background')
    editingMarkId.value = null
    editingNote.value = ''
  }
}

async function broadcastRefresh() {
  const tabs = await browser.tabs.query({ status: 'complete' })
  for (const tab of tabs) {
    // 只向有权限访问的 http/https 页面发送消息
    if (tab.id && tab.url && tab.url.startsWith('http')) {
      sendMessage('refresh-highlights', {}, { context: 'content-script', tabId: tab.id }).catch(() => {
        /* content script 可能未注入，忽略错误 */
      })
    }
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
  // 核心修正：在发送之前，将 mark 转换为纯 JavaScript 对象
  const rawMark = toRaw(mark)

  // 1. 发送给 Background Script
  await sendMessage('remove-mark', rawMark, 'background')

  // Also use the robust tab finding logic for removing marks from the page
  const allTabs = await browser.tabs.query({ currentWindow: true }),
    targetUrl = getNormalizedUrlForTabMatching(rawMark.url) // Use rawMark.url for safety

  const tab = allTabs.find((t) => {
    if (!t.url) return false
    try {
      return getNormalizedUrlForTabMatching(t.url) === targetUrl
    } catch (e) {
      return false
    }
  })

  // 2. 发送给 Content Script
  if (tab?.id) sendMessage('remove-mark', rawMark, { context: 'content-script', tabId: tab.id })
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
    // 清理之后需要再次更新页面标记
    await broadcastRefresh()
  }
}

async function cleanupUselessMarks() {
  if (confirm('确定要清理所有没有备注的标记吗？此操作不可撤销。')) {
    await sendMessage('cleanup-useless-marks', {}, 'background')
    await getStorageUsage()
    // 清理之后需要再次更新页面标记
    await broadcastRefresh()
  }
}

function exportToMarkdown(urlMarks: Mark[], pageTitle: string) {
  let pageURL = urlMarks[0]?.url,
    markdown = `
  # [${pageTitle}](${pageURL})
  ---
  `
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
  <main class="min-h-screen bg-gray-100 p-[16px] pb-[144px] font-sans relative text-gray-800">
    <button
      class="absolute top-[16px] right-[16px] p-[8px] text-gray-500 hover:text-gray-800"
      title="打开设置"
      @click="openOptionsPage"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-[24px] w-[24px]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>
    <h1 class="text-xl font-bold text-center text-gray-800 my-4">标记管理</h1>
    <div class="space-y-6">
      <div
        v-if="Object.keys(marksByUrl).length === 0"
        class="flex flex-col items-center justify-center text-gray-500 pt-[40px] rounded-lg bg-white p-[24px] shadow-md"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-[64px] h-[64px] text-gray-300"
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
        <p class="mt-[16px]">还没有任何标记</p>
        <p class="text-[14px] text-gray-400">在网页上选中文本试试看</p>
      </div>
      <div v-else>
        <section
          v-for="[url, urlMarks] in Object.entries(marksByUrl)"
          :key="url"
          class="bg-white rounded-lg shadow-md p-[16px] mb-[16px]"
        >
          <header class="flex justify-between items-center pb-[8px] mb-[8px] border-b border-gray-200">
            <h2 class="text-base font-semibold text-gray-700 truncate flex-1 min-w-0" :title="url">
              {{ getPageTitle(urlMarks) }}
            </h2>
            <div class="flex items-center gap-[8px]">
              <button
                class="action-button rounded-md bg-gray-200 px-[12px] py-[4px] text-xs font-medium text-gray-700 hover:bg-gray-300"
                @click="exportToMarkdown(urlMarks, getPageTitle(urlMarks))"
              >
                导出
              </button>
              <button
                class="action-button rounded-md bg-red-100 px-[12px] py-[4px] text-xs font-medium text-red-700 hover:bg-red-200"
                title="删除此页面的所有标记"
                @click="removeAllMarksForUrl(url)"
              >
                全部删除
              </button>
            </div>
          </header>
          <ul class="space-y-2">
            <li v-for="mark in urlMarks" :key="mark.id" class="group">
              <div class="flex items-start justify-between">
                <div class="flex-1 cursor-pointer" @click="gotoMark(mark)">
                  <p class="text-[14px] font-medium text-gray-800">
                    {{ mark.text }}
                  </p>
                  <div v-if="editingMarkId === mark.id" class="mt-[8px]">
                    <textarea
                      v-model="editingNote"
                      :ref="setEditingRef"
                      class="w-full border-gray-300 rounded-md p-[8px] text-[14px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      @keydown.enter.prevent="saveNote(mark)"
                      @keydown.esc="cancelEdit"
                    />
                    <div class="flex justify-end gap-[8px] mt-[8px]">
                      <button
                        class="action-button rounded-md bg-gray-200 px-[12px] py-[4px].5 text-[14px] font-medium text-gray-800 hover:bg-gray-300"
                        @click.stop="cancelEdit"
                      >
                        取消
                      </button>
                      <button
                        class="action-button rounded-md bg-blue-600 px-[12px] py-[4px].5 text-[14px] font-medium text-white hover:bg-blue-700"
                        @click.stop="saveNote(mark)"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                  <p v-else class="text-[14px] text-gray-500 mt-[4px] hover:text-blue-600" @click.stop="editMark(mark)">
                    {{ mark.note.length > 0 ? mark.note : '点击添加备注...' }}
                  </p>
                </div>
                <div class="flex items-center ml-[8px] space-x-1 flex-shrink-0">
                  <button
                    class="p-[4px] text-gray-400 hover:text-blue-600 rounded-full"
                    title="复制文本"
                    @click.stop="copyMarkText(mark)"
                  >
                    <svg
                      v-if="copiedMarkId === mark.id"
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-[20px] h-[20px] text-green-500 transition-colors"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <svg
                      v-else
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-[20px] h-[20px]"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                      <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h6a2 2 0 00-2-2H5z" />
                    </svg>
                  </button>
                  <button
                    class="p-[4px] text-gray-400 hover:text-red-600 rounded-full transition-colors"
                    title="删除标记"
                    @click="removeMark(mark)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-[20px] h-[20px]"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <div class="fixed bottom-0 left-0 right-0 z-10 w-full border-t bg-white/80 p-[16px] shadow-lg backdrop-blur-sm">
      <h2 class="text-[18px] font-semibold text-gray-700 mb-[8px]">存储管理</h2>
      <div class="text-[14px] text-gray-600">
        <p>
          已用空间: {{ (storageUsage / 1024).toFixed(2) }} KB /
          <span v-if="storageQuota">{{ (storageQuota / 1024 / 1024).toFixed(2) }} MB</span>
          <span v-else>无已知限制</span>
        </p>
        <div class="w-full bg-gray-200 rounded-full h-[10px] mt-[4px]">
          <div class="bg-blue-600 h-[10px] rounded-full" :style="{ width: `${storageUsagePercent}%` }"></div>
        </div>
      </div>
      <div class="mt-[16px] flex gap-[8px]">
        <button
          class="action-button rounded-md bg-red-100 px-[12px] py-[4px] text-[14px] font-medium text-red-800 hover:bg-red-200"
          @click="cleanupOldMarks"
        >
          清理 {{ CLEANUP_DAYS_THRESHOLD }} 天前的标记
        </button>
        <button
          class="action-button rounded-md bg-yellow-100 px-[12px] py-[4px] text-[14px] font-medium text-yellow-800 hover:bg-yellow-200"
          @click="cleanupUselessMarks"
        >
          清理无备注的标记
        </button>
      </div>
    </div>
  </main>
</template>
