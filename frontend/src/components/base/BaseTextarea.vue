<script setup lang="ts">
import { ref } from 'vue'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue'

const model = defineModel<string>()

defineProps<{
  label?: string
  placeholder?: string
  rows?: number
  error?: string
  uploadable?: boolean
  previewable?: boolean
}>()

const emit = defineEmits<{
  'file-drop': [e: DragEvent]
  'file-paste': [e: ClipboardEvent]
}>()

const mode = ref<'write' | 'preview'>('write')

function onDragover(e: DragEvent) {
  e.preventDefault()
}

function onDrop(e: DragEvent) {
  emit('file-drop', e)
}

function onPaste(e: ClipboardEvent) {
  emit('file-paste', e)
}
</script>

<template>
  <div class="space-y-1.5">
    <label v-if="label" class="block text-sm font-medium text-slate-700 dark:text-slate-300">{{ label }}</label>
    <div v-if="previewable" class="flex border-b border-slate-200 dark:border-slate-700">
      <button
        type="button"
        class="px-3 py-1.5 text-sm font-medium transition"
        :class="mode === 'write'
          ? 'text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white -mb-px'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
        @click="mode = 'write'"
      >编辑</button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm font-medium transition"
        :class="mode === 'preview'
          ? 'text-slate-900 dark:text-white border-b-2 border-slate-900 dark:border-white -mb-px'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
        @click="mode = 'preview'"
      >预览</button>
    </div>
    <textarea
      v-if="!previewable || mode === 'write'"
      v-model="model"
      :placeholder="placeholder"
      :rows="rows || 4"
      class="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 dark:focus:ring-slate-100/20 dark:focus:border-slate-600 resize-y transition"
      :class="{ 'border-red-400 dark:border-red-500': error, 'rounded-t-none': previewable }"
      @dragover="uploadable ? onDragover($event) : undefined"
      @drop="uploadable ? onDrop($event) : undefined"
      @paste="uploadable ? onPaste($event) : undefined"
    />
    <div
      v-else
      class="min-h-[6rem] px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-t-none overflow-auto"
      :class="{ 'border-red-400 dark:border-red-500': error }"
    >
      <MarkdownRenderer v-if="model" :content="model" />
      <p v-else class="text-sm text-slate-400 dark:text-slate-500 italic">暂无内容可预览</p>
    </div>
    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
  </div>
</template>
