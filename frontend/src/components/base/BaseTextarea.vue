<script setup lang="ts">
import { ref, useAttrs } from 'vue';
import { Icon } from '@iconify/vue';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue';
import BaseSlidingTabs from '@/components/base/BaseSlidingTabs.vue';
import { t } from '@/i18n';
import { UPLOAD_TYPES, type FileSelectPayload } from '@/types/upload';

const model = defineModel<string>();
const attrs = useAttrs();
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);

defineProps<{
  label?: string;
  placeholder?: string;
  rows?: number;
  error?: string;
  uploadable?: boolean;
  previewable?: boolean;
  required?: boolean;
}>();

const emit = defineEmits<{
  'file-drop': [e: DragEvent];
  'file-paste': [e: ClipboardEvent];
  'file-select': [payload: FileSelectPayload];
}>();

const mode = ref<'write' | 'preview'>('write');

function onDragover(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function onDragleave() {
  isDragging.value = false;
}

function onDrop(e: DragEvent) {
  isDragging.value = false;
  emit('file-drop', e);
}

function onPaste(e: ClipboardEvent) {
  emit('file-paste', e);
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length && textareaRef.value) {
    emit('file-select', { files: Array.from(input.files), textarea: textareaRef.value });
  }
  input.value = '';
}
</script>

<template>
  <div class="space-y-1.5">
    <label v-if="label" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
      {{ label }}<span v-if="required" class="base-field-required" aria-hidden="true">*</span>
    </label>
    <BaseSlidingTabs
      v-if="previewable"
      :active-key="mode"
      class="flex border-b border-slate-200 text-slate-900 dark:border-slate-700 dark:text-white"
    >
      <button
        type="button"
        class="px-3 py-1.5 text-sm font-medium transition"
        data-sliding-tab="write"
        :class="{
          'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300':
            mode !== 'write',
        }"
        @click="mode = 'write'"
      >
        {{ t('common.edit') }}
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-sm font-medium transition"
        data-sliding-tab="preview"
        :class="{
          'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300':
            mode !== 'preview',
        }"
        @click="mode = 'preview'"
      >
        {{ t('common.preview') }}
      </button>
    </BaseSlidingTabs>
    <div v-if="!previewable || mode === 'write'" class="-m-0.5 p-0.5">
      <textarea
        ref="textareaRef"
        v-model="model"
        v-bind="attrs"
        :placeholder="placeholder"
        :rows="rows || 4"
        :required="required"
        class="w-full px-3 py-2 text-sm !rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-900/25 focus:border-slate-500 dark:focus:ring-slate-100/25 dark:focus:border-slate-500 resize-y transition"
        :class="[
          { 'border-red-400 dark:border-red-500': error },
          isDragging &&
            '!border-slate-500 dark:!border-slate-400 ring-2 ring-slate-900/15 dark:ring-slate-100/15',
        ]"
        @dragover="uploadable ? onDragover($event) : undefined"
        @dragleave="uploadable ? onDragleave() : undefined"
        @drop="uploadable ? onDrop($event) : undefined"
        @paste="uploadable ? onPaste($event) : undefined"
      />
    </div>
    <div
      v-else
      class="min-h-[6rem] px-3 py-2 !rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-auto"
      :class="{ 'border-red-400 dark:border-red-500': error }"
    >
      <MarkdownRenderer v-if="model" :content="model" />
      <p v-else class="text-sm text-slate-400 dark:text-slate-500 italic">
        {{ t('common.noPreviewContent') }}
      </p>
    </div>
    <template v-if="uploadable && (!previewable || mode === 'write')">
      <input
        ref="fileInputRef"
        type="file"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        :accept="UPLOAD_TYPES.join(',')"
        multiple
        @change="onFileSelect"
      />
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
        @click="fileInputRef?.click()"
      >
        <Icon icon="lucide:paperclip" class="h-3.5 w-3.5" aria-hidden="true" />
        {{ t('common.attachmentUploadHint') }}
      </button>
    </template>
    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
  </div>
</template>
