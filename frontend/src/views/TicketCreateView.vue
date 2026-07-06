<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { apiCreateTicket, apiUpdateTicketBody } from '@/api/tickets'
import { apiUploadAttachment } from '@/api/attachments'
import { useUiStore } from '@/stores/ui'
import { useTicketForm } from '@/composables/useTicketForm'
import { useMarkdownUpload } from '@/composables/useMarkdownUpload'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue'

const router = useRouter()
const ui = useUiStore()
const {
  step,
  templates,
  selectedTemplate,
  selectedTemplateName,
  formValues,
  title,
  allFieldsValid,
  currentTemplateSummary,
  fetchTemplates,
  selectTemplate,
  setFieldValue,
  setCheckboxValue,
  goToStep,
} = useTicketForm()

const mdUpload = useMarkdownUpload()

const files = ref<File[]>([])
const loading = ref(false)
const error = ref('')

onMounted(fetchTemplates)

watch(formValues, () => {
  mdUpload.syncPending(Object.values(formValues.value).join('\n'))
}, { deep: true })

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    files.value.push(...Array.from(input.files))
  }
  input.value = ''
}

function removeFile(index: number) {
  files.value.splice(index, 1)
}

function getActiveTextarea(): HTMLTextAreaElement | null {
  return document.activeElement as HTMLTextAreaElement | null
}

function onTextareaFileDrop(e: DragEvent, fieldId: string) {
  const textarea = getActiveTextarea()
  if (!textarea) return
  const modelValue = { get value() { return formValues.value[fieldId] || '' }, set value(v: string) { setFieldValue(fieldId, v) } }
  mdUpload.handleDrop(e, textarea, modelValue)
}

function onTextareaFilePaste(e: ClipboardEvent, fieldId: string) {
  const textarea = getActiveTextarea()
  if (!textarea) return
  const modelValue = { get value() { return formValues.value[fieldId] || '' }, set value(v: string) { setFieldValue(fieldId, v) } }
  mdUpload.handlePaste(e, textarea, modelValue)
}

async function submit() {
  if (!selectedTemplateName.value || !title.value.trim()) return
  error.value = ''
  loading.value = true
  try {
    const ticket = await apiCreateTicket({
      title: title.value.trim(),
      template: selectedTemplateName.value,
      formData: formValues.value,
    })
    if (files.value.length > 0) {
      await Promise.all(files.value.map(file => apiUploadAttachment(file, { ticketId: ticket.id })))
    }

    // Upload markdown-embedded images and update body
    if (mdUpload.pendingFiles.value.size > 0) {
      const updatedBody = await mdUpload.uploadAndReplace(ticket.body, ticket.id)
      await apiUpdateTicketBody(ticket.id, updatedBody)
    }

    ui.toast('议题已创建', 'success')
    router.push(`/tickets/${ticket.id}`)
  } catch (e: any) {
    error.value = e.message || '创建失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <h1 class="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">新建议题</h1>

    <!-- Step 1: Template Picker -->
    <div v-if="step === 1" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <button
        v-for="t in templates"
        :key="t.name"
        @click="selectTemplate(t.name)"
        class="flex items-center gap-3 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/80 dark:hover:bg-slate-800/20 transition text-left"
      >
        <div>
          <div class="font-medium text-slate-900 dark:text-white text-sm">{{ t.name_i18n }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{{ t.description }}</div>
        </div>
      </button>
    </div>

    <!-- Step 2: Template Form -->
    <form v-else-if="step === 2 && selectedTemplate" @submit.prevent="goToStep(3)" class="space-y-4">
      <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <button type="button" @click="goToStep(1)" class="hover:text-slate-700 dark:hover:text-slate-300">
          <Icon icon="lucide:arrow-left" class="w-4 h-4" />
        </button>
        <span>{{ currentTemplateSummary?.name_i18n }}</span>
      </div>

      <div v-for="field in selectedTemplate.body" :key="field.id || field.attributes.label">
        <!-- markdown -->
        <div v-if="field.type === 'markdown'" class="prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-slate-400">
          <MarkdownRenderer :content="field.attributes.value || ''" />
        </div>

        <!-- input -->
        <BaseInput
          v-else-if="field.type === 'input'"
          :model-value="formValues[field.id || ''] || ''"
          @update:model-value="setFieldValue(field.id || '', $event || '')"
          :label="field.attributes.label || ''"
          :placeholder="field.attributes.placeholder"
        />

        <!-- textarea -->
        <BaseTextarea
          v-else-if="field.type === 'textarea'"
          :model-value="formValues[field.id || ''] || ''"
          @update:model-value="setFieldValue(field.id || '', $event || '')"
          :label="field.attributes.label || ''"
          :placeholder="field.attributes.placeholder"
          :rows="6"
          uploadable
          previewable
          @file-drop="onTextareaFileDrop($event, field.id || '')"
          @file-paste="onTextareaFilePaste($event, field.id || '')"
        />
        <div v-if="field.type === 'textarea' && mdUpload.pendingFiles.value.size > 0" class="mt-1 flex flex-wrap gap-2">
          <div
            v-for="[url, file] in mdUpload.pendingFiles.value"
            :key="url"
            class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <Icon icon="lucide:image" class="w-3 h-3 text-slate-400" />
            <span class="text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{{ file.name }}</span>
            <button type="button" @click="mdUpload.removePending(url)" class="text-slate-400 hover:text-red-500">
              <Icon icon="lucide:x" class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- checkboxes -->
        <fieldset v-else-if="field.type === 'checkboxes'" class="space-y-2">
          <legend class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {{ field.attributes.label }}
          </legend>
          <label
            v-for="option in field.attributes.options"
            :key="typeof option === 'string' ? option : option.label"
            class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer"
          >
            <input
              type="checkbox"
              class="rounded border-slate-300 dark:border-slate-600"
              :checked="(formValues[field.id || ''] || '').split(',').includes(typeof option === 'string' ? option : option.label)"
              @change="setCheckboxValue(field.id || '', typeof option === 'string' ? option : option.label, ($event.target as HTMLInputElement).checked)"
            />
            {{ typeof option === 'string' ? option : option.label }}
          </label>
        </fieldset>

        <!-- dropdown -->
        <BaseSelect
          v-else-if="field.type === 'dropdown'"
          :label="field.attributes.label"
          :placeholder="field.attributes.placeholder || '请选择...'"
          :model-value="formValues[field.id || ''] || ''"
          @update:model-value="setFieldValue(field.id || '', $event)"
          :options="(field.attributes.options || []).map(opt => ({ value: typeof opt === 'string' ? opt : opt.label, label: typeof opt === 'string' ? opt : opt.label }))"
        />
      </div>

      <div class="flex justify-end">
        <BaseButton filled type="submit" :disabled="!allFieldsValid">下一步</BaseButton>
      </div>
    </form>

    <!-- Step 3: Title + Attachments -->
    <form v-else-if="step === 3" @submit.prevent="submit" class="space-y-4">
      <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <button type="button" @click="goToStep(2)" class="hover:text-slate-700 dark:hover:text-slate-300">
          <Icon icon="lucide:arrow-left" class="w-4 h-4" />
        </button>
        <span>{{ currentTemplateSummary?.name_i18n }}</span>
      </div>

      <div>
        <BaseInput v-model="title" label="标题" placeholder="简要描述问题" />
        <p v-if="selectedTemplate?.title_prefix" class="mt-1 text-xs text-slate-400 dark:text-slate-500">
          前缀「{{ selectedTemplate.title_prefix }}」将自动添加到标题
        </p>
      </div>

      <!-- Attachment upload -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">附件</label>
        <div class="flex items-center gap-2">
          <input
            id="file-upload"
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.zip,.log"
            @change="onFileChange"
            class="hidden"
          />
          <label
            for="file-upload"
            class="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer transition"
          >
            <Icon icon="lucide:paperclip" class="w-4 h-4" />
            上传文件
          </label>
        </div>
        <div v-if="files.length > 0" class="space-y-1">
          <div
            v-for="(file, idx) in files"
            :key="idx"
            class="flex items-center justify-between px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 text-sm"
          >
            <div class="flex items-center gap-2 min-w-0">
              <Icon icon="lucide:file" class="w-4 h-4 text-slate-400 shrink-0" />
              <span class="text-slate-700 dark:text-slate-300 truncate">{{ file.name }}</span>
              <span class="text-xs text-slate-400 shrink-0">{{ (file.size / 1024).toFixed(1) }} KB</span>
            </div>
            <button
              type="button"
              @click="removeFile(idx)"
              class="text-slate-400 hover:text-red-500 shrink-0"
            >
              <Icon icon="lucide:x" class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <p v-if="error" class="text-sm text-red-500 dark:text-red-400">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <BaseButton type="button" @click="router.back()">取消</BaseButton>
        <BaseButton filled type="submit" :loading="loading" :disabled="!title.trim()">提交议题</BaseButton>
      </div>
    </form>
  </div>
</template>
