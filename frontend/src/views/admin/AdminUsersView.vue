<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { apiFetch } from '@/api/client';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { usePagination } from '@/composables/usePagination';
import { handleError } from '@/utils/error';
import { useConfirm } from '@/composables/useConfirm';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseSelect from '@/components/base/BaseSelect.vue';
import BasePagination from '@/components/base/BasePagination.vue';
import UserAvatar from '@/components/base/UserAvatar.vue';
import { ROLE, ROLE_META, type User } from '@/types/user';
import type { Role } from '@/types/ticket';

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
}

const ui = useUiStore();
const auth = useAuthStore();
const { confirm } = useConfirm();
const users = ref<User[]>([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const dangerTextButtonClass =
  '!px-0 !py-0 border-none text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300';

const { totalPages } = usePagination(
  () => total.value,
  () => page.value,
  () => pageSize.value,
);

const roleOptions = [
  { value: ROLE.PLAYER, label: ROLE_META[ROLE.PLAYER].label },
  { value: ROLE.STAFF, label: ROLE_META[ROLE.STAFF].label },
  { value: ROLE.ADMIN, label: ROLE_META[ROLE.ADMIN].label },
];

let fetchSeq = 0;

async function fetchUsers() {
  const seq = ++fetchSeq;
  try {
    const res = await apiFetch<UsersResponse>(
      `/users?page=${page.value}&pageSize=${pageSize.value}`,
    );
    if (seq !== fetchSeq) return;
    users.value = res.users;
    total.value = res.total;
  } catch (e) {
    if (seq !== fetchSeq) return;
    handleError(e, '加载失败');
  }
}

async function setPage(p: number) {
  page.value = p;
  await fetchUsers();
}

async function setPageSize(s: number) {
  pageSize.value = s;
  page.value = 1;
  await fetchUsers();
}

async function changeRole(userId: number, role: Role) {
  try {
    await apiFetch(`/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    const idx = users.value.findIndex((u) => u.id === userId);
    if (idx !== -1) users.value[idx].role = role;
    ui.toast('角色已更新', 'success');
  } catch (e) {
    handleError(e);
  }
}

async function deleteUser(userId: number) {
  if (!(await confirm('确定要删除该用户吗？此操作不可撤销。'))) return;
  try {
    await apiFetch(`/users/${userId}`, { method: 'DELETE' });
    ui.toast('用户已删除', 'success');
    await fetchUsers();
    if (users.value.length === 0 && page.value > 1) {
      page.value--;
      await fetchUsers();
    }
  } catch (e) {
    handleError(e);
  }
}

onMounted(fetchUsers);
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">用户管理</h2>

    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 dark:border-slate-800">
          <th
            class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            用户名
          </th>
          <th
            class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            邮箱
          </th>
          <th
            class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            MC
          </th>
          <th
            class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            角色
          </th>
          <th
            class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            操作
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">
        <tr
          v-for="user in users"
          :key="user.id"
          class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
        >
          <td class="px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 shrink-0">
                <UserAvatar :username="user.username" :avatar-url="user.avatarUrl" />
              </div>
              <span class="font-medium text-slate-900 dark:text-white">{{ user.username }}</span>
            </div>
          </td>
          <td class="px-4 py-3 text-slate-600 dark:text-slate-400">{{ user.email }}</td>
          <td class="px-4 py-3 text-slate-600 dark:text-slate-400">
            {{ user.minecraftName || '-' }}
          </td>
          <td class="px-4 py-3 min-w-[120px]">
            <BaseSelect
              :model-value="user.role"
              :options="roleOptions"
              @update:model-value="changeRole(user.id, $event as Role)"
            />
          </td>
          <td class="px-4 py-3 text-right space-x-3">
            <BaseButton
              v-if="user.id !== auth.user?.id"
              :class="dangerTextButtonClass"
              @click="deleteUser(user.id)"
            >
              删除
            </BaseButton>
            <span class="text-xs text-slate-400">{{ user.createdAt?.slice(0, 10) }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="!users.length" class="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
      暂无用户
    </div>

    <BasePagination
      :page="page"
      :total-pages="totalPages"
      :total="total"
      :page-size="pageSize"
      @update:page="setPage"
      @update:page-size="setPageSize"
    />
  </div>
</template>
