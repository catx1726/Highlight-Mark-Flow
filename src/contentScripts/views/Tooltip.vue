<template>
  <div
    v-if="visible"
    @mousedown.prevent
    class="webext-tooltip"
    :style="{ top: `${position.y}px`, left: `${position.x}px` }"
  >
    <textarea v-model="noteValue" placeholder="添加备注或者仅高亮..." ref="textareaRef"></textarea>
    <div class="webext-tooltip-buttons">
      <button @click="onSaveClick">保存</button>
      <button v-if="isHighlighted" @click="onDeleteClick" class="delete-button">删除</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick } from 'vue'

const visible = ref(false)
const position = reactive({ x: 0, y: 0 })
const isHighlighted = ref(false)
const noteValue = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const emit = defineEmits(['save', 'delete'])

function onSaveClick() {
  emit('save', noteValue.value)
  hide()
}

function onDeleteClick() {
  emit('delete')
  hide()
}

function show(x: number, y: number, highlighted: boolean, initialNote = '') {
  position.x = x
  position.y = y
  isHighlighted.value = highlighted
  noteValue.value = initialNote
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

<style>
.webext-tooltip {
  position: fixed;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  z-index: 2147483647; /* Max z-index */
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.webext-tooltip button {
  background-color: #f0f0f0;
  background-color: #007bff;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  color: white;
  font-family: sans-serif;
  font-size: 14px;
}
.webext-tooltip button:hover {
  background-color: #0056b3;
}
.webext-tooltip textarea {
  min-width: 250px;
  min-height: 60px;
  border: 1px solid #ccc;
  border-radius: 3px;
  padding: 4px;
  font-family: sans-serif;
  font-size: 14px;
}
.webext-tooltip-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.webext-tooltip .delete-button {
  background-color: #dc3545;
}
.webext-tooltip .delete-button:hover {
  background-color: #c82333;
}
</style>
