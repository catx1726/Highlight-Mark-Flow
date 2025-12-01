<template>
  <div v-if="visible" class="webext-prompt-overlay" @click.self="handleCancel">
    <div class="webext-prompt-dialog" @mousedown.prevent>
      <h3>{{ title }}</h3>
      <textarea v-model="inputValue" ref="textareaRef" @keydown.enter.prevent="handleConfirm"></textarea>
      <div class="webext-prompt-buttons">
        <button @click="handleCancel">取消</button>
        <button @click="handleConfirm" @mousedown.prevent class="confirm-button">确认</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'

const visible = ref(false)
const title = ref('')
const inputValue = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// Store the resolve function of the promise
let resolvePromise: (value: string | null) => void

function show(promptTitle: string, initialValue = ''): Promise<string | null> {
  title.value = promptTitle
  inputValue.value = initialValue
  visible.value = true

  nextTick(() => {
    textareaRef.value?.focus()
    textareaRef.value?.select()
  })

  return new Promise((resolve) => {
    resolvePromise = resolve
  })
}

function hide() {
  visible.value = false
  inputValue.value = ''
  title.value = ''
}

function handleConfirm() {
  if (resolvePromise) {
    resolvePromise(inputValue.value)
  }
  hide()
}

function handleCancel() {
  if (resolvePromise) {
    resolvePromise(null)
  }
  hide()
}

defineExpose({ show })
</script>

<style>
.webext-prompt-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2147483647; /* Max z-index */
}

.webext-prompt-dialog {
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.webext-prompt-dialog h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.webext-prompt-dialog textarea {
  width: 100%;
  min-height: 80px;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  resize: vertical;
  box-sizing: border-box;
}

.webext-prompt-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.webext-prompt-buttons button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.webext-prompt-buttons button.confirm-button {
  background-color: #007bff;
  color: white;
}

.webext-prompt-buttons button.confirm-button:hover {
  background-color: #0056b3;
}

.webext-prompt-buttons button:not(.confirm-button) {
  background-color: #f0f0f0;
  color: #333;
}

.webext-prompt-buttons button:not(.confirm-button):hover {
  background-color: #e0e0e0;
}
</style>
