<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import BaseBadge from '@/components/base/BaseBadge.vue';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseCheckbox from '@/components/base/BaseCheckbox.vue';
import BaseCombobox from '@/components/base/BaseCombobox.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseSelect from '@/components/base/BaseSelect.vue';
import BaseTextarea from '@/components/base/BaseTextarea.vue';
import { apiCompleteTicketHook } from '@/api/tickets';
import { t } from '@/i18n';
import { ToastType, useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { formatDate } from '@/utils/date';
import type {
  CompletionHookValue,
  HookDelivery,
  TemplateField,
  TicketCompletionHook,
} from '@/types/ticket';

const props = defineProps<{
  ticketId: number;
  hooks: TicketCompletionHook[];
  deliveries?: HookDelivery[];
}>();

const emit = defineEmits<{ completed: [] }>();
const ui = useUiStore();
const textResponses = reactive<Record<string, Record<string, string>>>({});
const multiResponses = reactive<Record<string, Record<string, string[]>>>({});
const errors = reactive<Record<string, Record<string, string>>>({});
const submittingId = ref<string | null>(null);

function valuesFor(hook: TicketCompletionHook): Record<string, CompletionHookValue> {
  ensureResponses(hook);
  return Object.fromEntries(
    hook.fields.flatMap((field) => {
      if (!field.id) return [];
      return [
        [
          field.id,
          field.type === 'checkboxes'
            ? multiResponses[hook.id][field.id]
            : textResponses[hook.id][field.id],
        ],
      ];
    }),
  );
}

function ensureResponses(hook: TicketCompletionHook): void {
  textResponses[hook.id] ??= {};
  multiResponses[hook.id] ??= {};
  for (const field of hook.fields) {
    if (!field.id) continue;
    if (field.type === 'checkboxes') multiResponses[hook.id][field.id] ??= [];
    else textResponses[hook.id][field.id] ??= '';
  }
}

function textValuesFor(hook: TicketCompletionHook): Record<string, string> {
  ensureResponses(hook);
  return textResponses[hook.id];
}

function optionsFor(field: TemplateField): string[] {
  return (field.attributes.options ?? []).map((option) =>
    typeof option === 'string' ? option : option.label,
  );
}

function selectedValues(hook: TicketCompletionHook, field: TemplateField): string[] {
  if (!field.id) return [];
  ensureResponses(hook);
  return multiResponses[hook.id][field.id];
}

function toggleOption(
  hook: TicketCompletionHook,
  field: TemplateField,
  option: string,
  checked: boolean,
) {
  if (!field.id) return;
  const selected = selectedValues(hook, field);
  multiResponses[hook.id][field.id] = checked
    ? Array.from(new Set([...selected, option]))
    : selected.filter((item) => item !== option);
}

function fieldLabel(field: TemplateField): string {
  return field.attributes.label || field.id || '';
}

function validate(hook: TicketCompletionHook): boolean {
  const hookErrors: Record<string, string> = {};
  const values = valuesFor(hook);
  for (const field of hook.fields) {
    if (!field.id || !field.validations?.required) continue;
    const value = values[field.id];
    if ((Array.isArray(value) && value.length === 0) || (!Array.isArray(value) && !value?.trim())) {
      hookErrors[field.id] = t('ticket.completionHook.required');
    }
  }
  errors[hook.id] = hookErrors;
  return Object.keys(hookErrors).length === 0;
}

async function submit(hook: TicketCompletionHook) {
  if (!validate(hook)) return;
  submittingId.value = hook.id;
  try {
    await apiCompleteTicketHook(props.ticketId, hook.id, valuesFor(hook));
    ui.toast(t('ticket.completionHook.completed'), ToastType.SUCCESS);
    emit('completed');
  } catch (error) {
    handleError(error);
  } finally {
    submittingId.value = null;
  }
}

function responseText(value: CompletionHookValue | undefined): string {
  return Array.isArray(value) ? value.join(', ') : value || t('ticket.completionHook.emptyValue');
}

function statusLabel(status: TicketCompletionHook['status']): string {
  return t(`ticket.completionHook.status.${status}`);
}

const displayDeliveryResults = computed(() =>
  (props.deliveries ?? []).flatMap((delivery) =>
    delivery.results.map((result) => {
      const idx = parseInt(result.hookId.split(':').pop() || '', 10);
      const hook = delivery.hooks[idx];
      return {
        result,
        type: hook?.type ?? '',
        content: hook?.content ?? result.hookId,
      };
    }),
  ),
);
</script>

<template>
  <section class="space-y-3">
    <article
      v-for="hook in hooks"
      :key="hook.id"
      class="space-y-4 rounded-xl border border-slate-200/80 bg-white/70 px-5 py-4 backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/70"
      :class="{ 'opacity-60': hook.status === 'cancelled' }"
    >
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <Icon icon="lucide:list-checks" class="h-4 w-4 text-slate-500" />
          <h3 class="text-sm font-semibold text-slate-900 dark:text-white">{{ hook.title }}</h3>
        </div>
        <BaseBadge v-if="hook.status === 'pending'" color="#f59e0b">
          {{ statusLabel(hook.status) }}
        </BaseBadge>
      </header>

      <form v-if="hook.status === 'pending'" class="space-y-4" @submit.prevent="submit(hook)">
        <div v-for="field in hook.fields" :key="field.id" class="space-y-1.5">
          <BaseInput
            v-if="field.type === 'input' && field.id"
            v-model="textValuesFor(hook)[field.id]"
            :label="fieldLabel(field)"
            :required="field.validations?.required === true"
            :placeholder="field.attributes.placeholder"
            :error="errors[hook.id]?.[field.id]"
          />
          <BaseTextarea
            v-else-if="field.type === 'textarea' && field.id"
            v-model="textValuesFor(hook)[field.id]"
            :label="fieldLabel(field)"
            :required="field.validations?.required === true"
            :placeholder="field.attributes.placeholder"
            :error="errors[hook.id]?.[field.id]"
            :rows="3"
          />
          <BaseSelect
            v-else-if="field.type === 'dropdown' && field.id"
            v-model="textValuesFor(hook)[field.id]"
            :label="fieldLabel(field)"
            :required="field.validations?.required === true"
            :options="optionsFor(field).map((option) => ({ value: option, label: option }))"
            :placeholder="t('common.selectPlaceholder')"
            :error="errors[hook.id]?.[field.id]"
          />
          <BaseCombobox
            v-else-if="field.type === 'select_input' && field.id"
            v-model="textValuesFor(hook)[field.id]"
            :label="fieldLabel(field)"
            :required="field.validations?.required === true"
            :options="optionsFor(field).map((option) => ({ value: option, label: option }))"
            :placeholder="field.attributes.placeholder || t('common.selectOrInputPlaceholder')"
            :error="errors[hook.id]?.[field.id]"
          />
          <fieldset v-else-if="field.type === 'checkboxes' && field.id" class="space-y-2">
            <legend class="text-sm font-medium text-slate-700 dark:text-slate-300">
              {{ fieldLabel(field) }}
              <span
                v-if="field.validations?.required === true"
                class="base-field-required"
                aria-hidden="true"
                >*</span
              >
            </legend>
            <label
              v-for="option in optionsFor(field)"
              :key="option"
              class="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
            >
              <BaseCheckbox
                :checked="selectedValues(hook, field).includes(option)"
                @update:checked="toggleOption(hook, field, option, $event)"
              />
              {{ option }}
            </label>
            <p v-if="errors[hook.id]?.[field.id]" class="text-xs text-red-500">
              {{ errors[hook.id][field.id] }}
            </p>
          </fieldset>
          <p v-if="field.attributes.description" class="text-xs text-slate-500 dark:text-slate-400">
            {{ field.attributes.description }}
          </p>
        </div>
        <div class="flex justify-end">
          <BaseButton filled type="submit" :loading="submittingId === hook.id">
            {{ t('ticket.completionHook.submit') }}
          </BaseButton>
        </div>
      </form>

      <div v-else-if="hook.response" class="space-y-2 text-sm">
        <div
          v-for="field in hook.fields"
          :key="field.id"
          class="flex flex-wrap justify-between gap-2"
        >
          <span class="text-slate-500 dark:text-slate-400">{{ fieldLabel(field) }}</span>
          <span class="text-slate-700 dark:text-slate-300">{{
            responseText(field.id ? hook.response[field.id] : undefined)
          }}</span>
        </div>
        <div class="space-y-1 border-t border-slate-200 pt-2 dark:border-slate-800">
          <p v-if="hook.completedBy" class="text-xs text-slate-500 dark:text-slate-400">
            {{
              t('ticket.completionHook.completedBy', {
                name: hook.completedBy.minecraftName || hook.completedBy.username,
              })
            }}
          </p>
          <p v-if="hook.completedAt" class="text-xs text-slate-500 dark:text-slate-400">
            {{ t('ticket.completionHook.completedAt', { time: formatDate(hook.completedAt) }) }}
          </p>
          <!-- Command execution results for this hook's delivery -->
          <div
            v-if="displayDeliveryResults.length"
            class="space-y-1.5 border-t border-slate-200 pt-2 dark:border-slate-800"
          >
            <div class="flex items-center gap-2">
              <Icon icon="lucide:terminal" class="h-3.5 w-3.5 text-slate-500" />
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {{ t('ticket.completionHook.deliveryTitle') }}
              </span>
            </div>
            <div
              v-for="item in displayDeliveryResults"
              :key="item.result.hookId"
              class="flex items-start gap-2"
            >
              <Icon
                v-if="item.result.success"
                icon="lucide:circle-check"
                class="mt-0.5 h-4 w-4 shrink-0 text-green-500"
              />
              <Icon v-else icon="lucide:circle-x" class="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div class="min-w-0">
                <p class="break-all text-xs text-slate-600 dark:text-slate-400">
                  <span class="font-mono">{{ item.content }}</span>
                  <span
                    v-if="item.type"
                    class="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  >
                    {{ t(`admin.templates.hookType.${item.type}`) ?? item.type }}
                  </span>
                </p>
                <p
                  v-if="item.result.error"
                  class="break-all text-xs text-red-600 dark:text-red-400"
                >
                  {{ item.result.error }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  </section>
</template>
