<template>
  <div v-if="visible" class="tooltip-card" :style="{ top: `${position.y}px`, left: `${position.x}px` }">
    <div class="tooltip-content">
      <textarea
        ref="textareaRef"
        v-model="noteValue"
        class="tooltip-textarea"
        placeholder="你正在想些什么"
        @keydown.enter.prevent="onSaveClick"
        @keydown.esc="hide"
      />
      <div class="tooltip-actions">
        <button v-if="isHighlighted" class="action-button delete-button" @click="onDeleteClick">删除</button>
        <button class="action-button save-button" @click="onSaveClick">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue'
import { defaultHighlightColor, highlightColors } from '~/logic/config'

const visible = ref(false)
const position = reactive({ x: 0, y: 0 })
const isHighlighted = ref(false)
const noteValue = ref('')
const selectedColor = ref(defaultHighlightColor.value)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const emit = defineEmits<{
  (e: 'save', note: string, color: string): void
  (e: 'delete'): void
}>()

function onSaveClick() {
  emit('save', noteValue.value, selectedColor.value)
  hide()
}

function onDeleteClick() {
  emit('delete')
  hide()
}

/**
 * 显示工具提示，并根据屏幕边界自动调整位置。
 */
function show(x: number, y: number, highlighted: boolean, initialNote = '', initialColor?: string) {
  // 工具提示的预估尺寸，用于边界检测
  const tooltipWidth = 300
  const tooltipHeight = 160
  const margin = 10

  // 确保工具提示不会超出窗口右侧
  if (x + tooltipWidth > window.innerWidth) x = window.innerWidth - tooltipWidth - margin

  // 确保工具提示不会超出窗口底部
  if (y + tooltipHeight > window.innerHeight) y = window.innerHeight - tooltipHeight - margin

  // 确保工具提示不会超出窗口左侧或顶部
  if (x < margin) x = margin
  if (y < margin) y = margin

  position.x = x
  position.y = y
  isHighlighted.value = highlighted
  noteValue.value = initialNote
  selectedColor.value = initialColor || defaultHighlightColor.value
  visible.value = true

  nextTick(() => {
    textareaRef.value?.focus()
  })
}

function hide() {
  visible.value = false
}

// Expose functions to the parent component
defineExpose({ show, hide })
</script>

<style scoped>
.tooltip-card {
  position: fixed;
  z-index: 2147483647; /* Max z-index */
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  transition: opacity 0.2s ease;
}

.tooltip-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tooltip-colors {
  display: flex;
  gap: 8px;
}

.color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: border-color 0.2s ease;
}

.color-swatch.is-selected {
  border-color: #4285f4; /* Google Blue */
}

.tooltip-textarea {
  min-width: 250px;
  min-height: 60px;
  border: 1px solid #dadce0;
  border-radius: 4px;
  padding: 8px;
  font-size: 14px;
  resize: vertical;
}
.tooltip-textarea:focus {
  outline: 2px solid #4285f4;
  border-color: transparent;
}

.tooltip-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.action-button {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.save-button {
  background-color: #4285f4;
  color: white;
}
.save-button:hover {
  background-color: #357ae8;
}

.delete-button {
  background-color: #ea4335;
  color: white;
}
.delete-button:hover {
  background-color: #e03324;
}
</style>
