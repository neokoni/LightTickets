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
import { apiCompleteTicketHook, apiSkipTicketHook } from '@/api/tickets';
import { t } from '@/i18n';
import { userDisplayName } from '@/utils/user-display';
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
  canCancel?: boolean;
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

async function skip(hook: TicketCompletionHook) {
  submittingId.value = hook.id;
  try {
    await apiSkipTicketHook(props.ticketId, hook.id);
    ui.toast(t('ticket.completionHook.skipped'), ToastType.SUCCESS);
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

function statusColor(status: TicketCompletionHook['status']): string | undefined {
  switch (status) {
    case 'pending':
      return '#f59e0b';
    case 'completed':
      return '#22c55e';
    case 'skipped':
      return '#4c4c4c';
  }
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
  <section class="space-y-4">
    <article
      v-for="hook in hooks"
      :key="hook.id"
      class="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-4 backdrop-blur sm:px-5 dark:border-slate-800/80 dark:bg-slate-900/70"
      :class="{ 'opacity-60': hook.status === 'skipped' }"
    >
      <header class="flex items-center justify-between gap-3">
        <h3 class="min-w-0 text-base font-semibold leading-6 text-slate-900 dark:text-slate-100">
          {{ hook.title }}
        </h3>
        <BaseBadge class="shrink-0" :color="statusColor(hook.status)">
          {{ statusLabel(hook.status) }}
        </BaseBadge>
      </header>

      <!-- Pending form -->
      <form v-if="hook.status === 'pending'" class="mt-4 space-y-4" @submit.prevent="submit(hook)">
        <div class="grid gap-x-5 gap-y-4 md:grid-cols-2">
          <div
            v-for="field in hook.fields"
            :key="field.id"
            class="min-w-0 space-y-1.5"
            :class="field.type === 'textarea' || field.type === 'checkboxes' ? 'md:col-span-2' : ''"
          >
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
              <legend class="text-sm font-medium leading-5 text-slate-700 dark:text-slate-300">
                {{ fieldLabel(field) }}
                <span
                  v-if="field.validations?.required === true"
                  class="base-field-required"
                  aria-hidden="true"
                  >*</span
                >
              </legend>
              <div class="grid gap-x-5 gap-y-2 sm:grid-cols-2">
                <label
                  v-for="option in optionsFor(field)"
                  :key="option"
                  class="flex cursor-pointer items-center gap-2.5 text-sm leading-5 text-slate-700 dark:text-slate-300"
                >
                  <BaseCheckbox
                    :checked="selectedValues(hook, field).includes(option)"
                    @update:checked="toggleOption(hook, field, option, $event)"
                  />
                  {{ option }}
                </label>
              </div>
              <p v-if="errors[hook.id]?.[field.id]" class="text-xs text-red-500">
                {{ errors[hook.id][field.id] }}
              </p>
            </fieldset>
            <p
              v-if="field.attributes.description"
              class="text-xs text-slate-500 dark:text-slate-400"
            >
              {{ field.attributes.description }}
            </p>
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-1">
          <BaseButton
            v-if="canCancel"
            size="sm"
            type="button"
            :loading="submittingId === hook.id"
            @click="skip(hook)"
          >
            {{ t('ticket.completionHook.skip') }}
          </BaseButton>
          <BaseButton size="sm" filled type="submit" :loading="submittingId === hook.id">
            {{ t('ticket.completionHook.submit') }}
          </BaseButton>
        </div>
      </form>

      <!-- Completed response -->
      <div v-else-if="hook.response" class="mt-4 space-y-4">
        <dl class="space-y-3">
          <div
            v-for="field in hook.fields"
            :key="field.id"
            class="grid min-w-0 gap-1 sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-4"
          >
            <dt class="text-sm font-medium leading-5 text-slate-500 dark:text-slate-400">
              {{ fieldLabel(field) }}
            </dt>
            <dd class="min-w-0 break-words text-sm leading-5 text-slate-700 dark:text-slate-200">
              {{ responseText(field.id ? hook.response[field.id] : undefined) }}
            </dd>
          </div>
        </dl>

        <!-- Command execution results -->
        <div v-if="displayDeliveryResults.length" class="pt-1">
          <div
            class="mb-2.5 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            <Icon icon="lucide:terminal" class="h-4 w-4 text-slate-500" />
            <span>{{ t('ticket.completionHook.deliveryTitle') }}</span>
          </div>
          <ul class="space-y-2.5">
            <li v-for="item in displayDeliveryResults" :key="item.result.hookId" class="min-w-0">
              <div class="flex min-w-0 items-start gap-2">
                <Icon
                  v-if="item.result.success"
                  icon="lucide:circle-check"
                  class="mt-0.5 h-4 w-4 shrink-0 text-green-500"
                />
                <Icon v-else icon="lucide:circle-x" class="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <span
                  class="min-w-0 break-all font-mono text-sm leading-5 text-slate-600 dark:text-slate-300"
                >
                  {{ item.content }}
                </span>
                <span
                  v-if="item.type"
                  class="ml-auto shrink-0 text-xs leading-5 text-slate-400 dark:text-slate-500"
                  >{{ t(`admin.templates.hookType.${item.type}`) ?? item.type }}</span
                >
              </div>
              <p v-if="item.result.error" class="mt-1 pl-6 text-xs leading-5 text-red-500">
                {{ item.result.error }}
              </p>
            </li>
          </ul>
        </div>

        <div
          class="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs leading-5 text-slate-400 dark:text-slate-500"
        >
          <span v-if="hook.completedBy" class="inline-flex items-center gap-1.5">
            <Icon icon="lucide:user" class="h-3.5 w-3.5" />
            {{
              t('ticket.completionHook.completedBy', {
                name: hook.completedBy.minecraftName || userDisplayName(hook.completedBy),
              })
            }}
          </span>
          <span v-if="hook.completedAt" class="inline-flex items-center gap-1.5">
            <Icon icon="lucide:clock" class="h-3.5 w-3.5" />
            {{ t('ticket.completionHook.completedAt', { time: formatDate(hook.completedAt) }) }}
          </span>
        </div>
      </div>
    </article>
  </section>
</template>
