<template>
  <div
    v-if="visible"
    @mousedown.prevent
    class="webext-tooltip"
    :style="{ top: `${position.y}px`, left: `${position.x}px` }"
  >
    <button @click="onHighlightClick">{{ isHighlighted ? '取消高亮' : '高亮' }}</button>
    <button @click="onAddNoteClick" @mousedown.prevent>备注</button>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'

const visible = ref(false)
const position = reactive({ x: 0, y: 0 })
const isHighlighted = ref(false)

const emit = defineEmits(['highlight', 'unhighlight', 'add-note'])

function onHighlightClick() {
  if (isHighlighted.value) emit('unhighlight')
  else emit('highlight')

  hide()
}

function onAddNoteClick() {
  emit('add-note')
  hide()
}

function show(x: number, y: number, highlighted: boolean) {
  position.x = x
  position.y = y
  isHighlighted.value = highlighted
  visible.value = true
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
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 8px;
  z-index: 2147483647; /* Max z-index */
  display: flex;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.webext-tooltip button {
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  color: #333;
  font-family: sans-serif;
  font-size: 14px;
}
.webext-tooltip button:hover {
  background-color: #e0e0e0;
}
</style>
