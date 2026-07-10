<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { apiCreateTicket } from '@/api/tickets';
import { ToastType, useUiStore } from '@/stores/ui';
import { useTicketForm } from '@/composables/useTicketForm';
import { useMarkdownUpload } from '@/composables/useMarkdownUpload';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseTextarea from '@/components/base/BaseTextarea.vue';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseCheckbox from '@/components/base/BaseCheckbox.vue';
import BaseSelect from '@/components/base/BaseSelect.vue';
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue';
import { t } from '@/i18n';

const router = useRouter();
const ui = useUiStore();
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
} = useTicketForm();

const mdUpload = useMarkdownUpload();

const loading = ref(false);
const error = ref('');
const templateButtonClass =
  '!justify-start !items-start !p-4 border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/80 dark:hover:bg-slate-800/20 text-left';
const iconButtonClass = '!px-0 !py-0 border-none text-slate-400 hover:text-red-500';
const backButtonClass =
  '!px-0 !py-0 border-none text-slate-500 hover:text-slate-700 dark:hover:text-slate-300';

onMounted(fetchTemplates);

watch(
  formValues,
  () => {
    mdUpload.syncPending(Object.values(formValues.value).join('\n'));
  },
  { deep: true },
);

function getEventTextarea(e: DragEvent | ClipboardEvent): HTMLTextAreaElement | null {
  if (e.target instanceof HTMLTextAreaElement) return e.target;
  if (document.activeElement instanceof HTMLTextAreaElement) return document.activeElement;
  return null;
}

function onTextareaFileDrop(e: DragEvent, fieldId: string) {
  const textarea = getEventTextarea(e);
  if (!textarea) return;
  const modelValue = {
    get value() {
      return formValues.value[fieldId] || '';
    },
    set value(v: string) {
      setFieldValue(fieldId, v);
    },
  };
  mdUpload.handleDrop(e, textarea, modelValue);
}

function onTextareaFilePaste(e: ClipboardEvent, fieldId: string) {
  const textarea = getEventTextarea(e);
  if (!textarea) return;
  const modelValue = {
    get value() {
      return formValues.value[fieldId] || '';
    },
    set value(v: string) {
      setFieldValue(fieldId, v);
    },
  };
  mdUpload.handlePaste(e, textarea, modelValue);
}

async function submit() {
  if (!selectedTemplateName.value || !title.value.trim()) return;
  error.value = '';
  loading.value = true;
  try {
    let submittedFormData = formValues.value;
    let attachmentIds: string[] = [];
    if (mdUpload.pendingFiles.value.size > 0) {
      const replaced = await mdUpload.uploadAndReplace(
        JSON.stringify(formValues.value),
        undefined,
        (attachmentId) => attachmentIds.push(attachmentId),
      );
      submittedFormData = JSON.parse(replaced) as Record<string, string>;
    }

    const ticket = await apiCreateTicket({
      title: title.value.trim(),
      template: selectedTemplateName.value,
      formData: submittedFormData,
      attachmentIds,
    });

    ui.toast(t('ticket.create.created'), ToastType.SUCCESS);
    router.push(`/tickets/${ticket.id}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('common.createFailed');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <h1 class="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
      {{ t('ticket.create.title') }}
    </h1>

    <!-- Step 1: Template Picker -->
    <div v-if="step === 1" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <BaseButton
        v-for="template in templates"
        :key="template.name"
        :class="templateButtonClass"
        @click="selectTemplate(template.name)"
      >
        <div>
          <div class="font-medium text-slate-900 dark:text-white text-sm">
            {{ template.name_i18n }}
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {{ template.description }}
          </div>
        </div>
      </BaseButton>
    </div>

    <!-- Step 2: Ticket Form -->
    <form v-else-if="step === 2 && selectedTemplate" class="space-y-4" @submit.prevent="submit">
      <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <BaseButton type="button" :class="backButtonClass" @click="goToStep(1)">
          <Icon icon="lucide:arrow-left" class="w-4 h-4" />
        </BaseButton>
        <span>{{ currentTemplateSummary?.name_i18n }}</span>
      </div>

      <div>
        <BaseInput
          v-model="title"
          :label="t('ticket.create.fieldTitle')"
          :placeholder="t('ticket.create.titlePlaceholder')"
        />
        <p
          v-if="selectedTemplate?.title_prefix"
          class="mt-1 text-xs text-slate-400 dark:text-slate-500"
        >
          {{ t('ticket.create.titlePrefixHelp', { prefix: selectedTemplate.title_prefix }) }}
        </p>
      </div>

      <div v-for="field in selectedTemplate.body" :key="field.id || field.attributes.label">
        <!-- markdown -->
        <div
          v-if="field.type === 'markdown'"
          class="prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-slate-400"
        >
          <MarkdownRenderer :content="field.attributes.value || ''" />
        </div>

        <!-- input -->
        <BaseInput
          v-else-if="field.type === 'input'"
          :model-value="formValues[field.id || ''] || ''"
          :label="field.attributes.label || ''"
          :placeholder="field.attributes.placeholder"
          @update:model-value="setFieldValue(field.id || '', String($event || ''))"
        />

        <!-- textarea -->
        <BaseTextarea
          v-else-if="field.type === 'textarea'"
          :model-value="formValues[field.id || ''] || ''"
          :label="field.attributes.label || ''"
          :placeholder="field.attributes.placeholder"
          :rows="6"
          uploadable
          previewable
          @update:model-value="setFieldValue(field.id || '', $event || '')"
          @file-drop="onTextareaFileDrop($event, field.id || '')"
          @file-paste="onTextareaFilePaste($event, field.id || '')"
        />

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
            <BaseCheckbox
              :checked="
                (formValues[field.id || ''] || '')
                  .split(',')
                  .includes(typeof option === 'string' ? option : option.label)
              "
              @update:checked="
                setCheckboxValue(
                  field.id || '',
                  typeof option === 'string' ? option : option.label,
                  $event,
                )
              "
            />
            {{ typeof option === 'string' ? option : option.label }}
          </label>
        </fieldset>

        <!-- dropdown -->
        <BaseSelect
          v-else-if="field.type === 'dropdown'"
          :label="field.attributes.label"
          :placeholder="field.attributes.placeholder || t('common.selectPlaceholderWithDots')"
          :model-value="formValues[field.id || ''] || ''"
          :options="
            (field.attributes.options || []).map((opt) => ({
              value: typeof opt === 'string' ? opt : opt.label,
              label: typeof opt === 'string' ? opt : opt.label,
            }))
          "
          @update:model-value="setFieldValue(field.id || '', $event || '')"
        />
      </div>

      <div v-if="mdUpload.pendingFiles.value.size > 0" class="flex flex-wrap gap-2">
        <div
          v-for="[url, file] in mdUpload.pendingFiles.value"
          :key="url"
          class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
        >
          <Icon icon="lucide:image" class="w-3 h-3 text-slate-400" />
          <span class="text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{{
            file.name
          }}</span>
          <BaseButton type="button" :class="iconButtonClass" @click="mdUpload.removePending(url)">
            <Icon icon="lucide:x" class="w-3 h-3" />
          </BaseButton>
        </div>
      </div>

      <p v-if="error" class="text-sm text-red-500 dark:text-red-400">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <BaseButton type="button" @click="router.back()">{{ t('common.cancel') }}</BaseButton>
        <BaseButton
          filled
          type="submit"
          :loading="loading"
          :disabled="!allFieldsValid || !title.trim()"
        >
          {{ t('ticket.create.submit') }}
        </BaseButton>
      </div>
    </form>
  </div>
</template>
