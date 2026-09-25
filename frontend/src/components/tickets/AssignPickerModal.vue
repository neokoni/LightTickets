<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseCheckbox from '@/components/base/BaseCheckbox.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import UserAvatar from '@/components/base/UserAvatar.vue';
import { t } from '@/i18n';
import { ROLE_META, type AssignableUser } from '@/types/user';
import type { Role } from '@/types/ticket';

const props = defineProps<{
  users: AssignableUser[];
  selectedIds: number[];
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [ids: number[]];
}>();

const open = defineModel<boolean>('open', { default: false });
const search = ref('');
const selection = ref<number[]>([]);

watch(open, (value) => {
  if (value) {
    selection.value = [...props.selectedIds];
    search.value = '';
  }
});

const filteredUsers = computed(() => {
  if (!search.value) return props.users;
  const query = search.value.toLowerCase();
  return props.users.filter((user) => user.username.toLowerCase().includes(query));
});

function toggle(userId: number) {
  const index = selection.value.indexOf(userId);
  if (index >= 0) {
    selection.value.splice(index, 1);
  } else {
    selection.value.push(userId);
  }
}
</script>

<template>
  <BaseModal v-model="open" :title="t('ticket.assignees.assign')">
    <div class="space-y-3">
      <div class="relative">
        <Icon
          icon="lucide:search"
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
        />
        <BaseInput
          v-model="search"
          :placeholder="t('ticket.assignees.searchUser')"
          class="[&_input]:pl-9"
        />
      </div>

      <div class="max-h-64 overflow-y-auto space-y-0.5 -mx-1">
        <label
          v-for="u in filteredUsers"
          :key="u.id"
          class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-200/75 dark:hover:bg-slate-800 transition"
        >
          <BaseCheckbox :checked="selection.includes(u.id)" @update:checked="toggle(u.id)" />
          <div class="w-7 h-7 shrink-0">
            <UserAvatar :username="u.username" :avatar-url="u.avatarUrl" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm text-slate-900 dark:text-white truncate">
              {{ u.username }}
            </div>
            <div class="text-[11px] text-slate-400 dark:text-slate-500">
              {{ t(ROLE_META[u.role as Role].labelKey) }}
            </div>
          </div>
        </label>
        <div v-if="!filteredUsers.length" class="py-4 text-center text-sm text-slate-400">
          {{ t('ticket.assignees.noMatches') }}
        </div>
      </div>
    </div>

    <template #footer>
      <span class="text-xs text-slate-400 dark:text-slate-500 mr-auto self-center">{{
        t('ticket.assignees.selectedCount', { count: selection.length })
      }}</span>
      <BaseButton size="sm" @click="open = false">{{ t('common.cancel') }}</BaseButton>
      <BaseButton size="sm" :filled="true" :loading="saving" @click="emit('save', [...selection])">
        {{ t('common.confirm') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
