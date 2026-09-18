<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { t } from '@/i18n';
import { ToastType, useUiStore } from '@/stores/ui';
import { usePlayerGroupsStore } from '@/stores/player-groups';
import { handleError } from '@/utils/error';
import { useConfirm } from '@/composables/useConfirm';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseLoadingState from '@/components/base/BaseLoadingState.vue';
import BasePagination from '@/components/base/BasePagination.vue';
import { usePagination } from '@/composables/usePagination';
import type { PlayerGroupItem, PlayerGroupSummary } from '@/types/player-group';

const ui = useUiStore();
const playerGroups = usePlayerGroupsStore();
const { confirm } = useConfirm();

const showGroupModal = ref(false);
const editingGroupId = ref<string | null>(null);
const groupForm = ref({ id: '', name: '', note: '' });
const savingGroup = ref(false);

const showPlayersModal = ref(false);
const activeGroupId = ref<string | null>(null);
const activeGroup = ref<PlayerGroupSummary | null>(null);
const playerItems = ref<PlayerGroupItem[]>([]);
const playersLoading = ref(false);
const playerSearch = ref('');
const playerPage = ref(1);
const playerPageSize = ref(20);
const playerTotal = ref(0);
const newPlayers = ref('');
const addingPlayers = ref(false);
const editingItemId = ref<string | null>(null);
const itemDraft = ref('');
const savingItemId = ref<string | null>(null);
const deletingItemId = ref<string | null>(null);
let playerLoadRequest = 0;
let playerSearchTimer: ReturnType<typeof setTimeout> | undefined;

const iconButtonClass =
  '!h-9 !w-9 !shrink-0 !px-0 !py-0 border-none text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
const dangerIconButtonClass =
  '!h-9 !w-9 !shrink-0 !px-0 !py-0 border-none text-slate-400 hover:text-red-500';

const activeGroupTitle = computed(() => {
  const group =
    activeGroup.value ??
    playerGroups.groups.find((candidate) => candidate.id === activeGroupId.value);
  return group?.name || group?.id || '';
});

const { totalPages: playerTotalPages } = usePagination(
  () => playerTotal.value,
  () => playerPage.value,
  () => playerPageSize.value,
);

function openCreateGroup() {
  editingGroupId.value = null;
  groupForm.value = { id: '', name: '', note: '' };
  showGroupModal.value = true;
}

function openEditGroup(group: PlayerGroupSummary) {
  editingGroupId.value = group.id;
  groupForm.value = { id: group.id, name: group.name || '', note: group.note || '' };
  showGroupModal.value = true;
}

async function fetchPlayers(closeOnError = false) {
  const groupId = activeGroupId.value;
  if (!groupId) return;
  const requestId = ++playerLoadRequest;
  playersLoading.value = true;
  try {
    const result = await playerGroups.getItems(groupId, {
      page: playerPage.value,
      pageSize: playerPageSize.value,
      q: playerSearch.value.trim(),
    });
    if (
      requestId === playerLoadRequest &&
      showPlayersModal.value &&
      activeGroupId.value === groupId
    ) {
      activeGroup.value = result.group;
      playerItems.value = result.items;
      playerTotal.value = result.total;
      playerPage.value = result.page;
      playerPageSize.value = result.pageSize;
    }
  } catch (error) {
    if (requestId === playerLoadRequest) {
      if (closeOnError) showPlayersModal.value = false;
      handleError(error, t('common.loadFailed'));
    }
  } finally {
    if (requestId === playerLoadRequest) playersLoading.value = false;
  }
}

async function openPlayers(group: PlayerGroupSummary) {
  if (playerSearchTimer) clearTimeout(playerSearchTimer);
  activeGroupId.value = group.id;
  activeGroup.value = group;
  playerItems.value = [];
  playerSearch.value = '';
  playerPage.value = 1;
  playerTotal.value = group._count.items;
  newPlayers.value = '';
  editingItemId.value = null;
  itemDraft.value = '';
  showPlayersModal.value = true;
  await fetchPlayers(true);
}

function queuePlayerSearch() {
  if (playerSearchTimer) clearTimeout(playerSearchTimer);
  playerSearchTimer = setTimeout(() => {
    playerSearchTimer = undefined;
    playerPage.value = 1;
    void fetchPlayers();
  }, 250);
}

async function setPlayerPage(page: number) {
  playerPage.value = page;
  await fetchPlayers();
}

async function setPlayerPageSize(pageSize: number) {
  playerPageSize.value = pageSize;
  playerPage.value = 1;
  await fetchPlayers();
}

async function saveGroup() {
  savingGroup.value = true;
  try {
    if (editingGroupId.value) {
      const group = await playerGroups.update(editingGroupId.value, {
        name: groupForm.value.name,
        note: groupForm.value.note,
      });
      if (activeGroup.value?.id === group.id) activeGroup.value = group;
    } else {
      await playerGroups.create({
        id: groupForm.value.id,
        name: groupForm.value.name,
        note: groupForm.value.note,
      });
    }
    showGroupModal.value = false;
    ui.toast(t('admin.playerGroups.saved'), ToastType.SUCCESS);
  } catch (error) {
    handleError(error);
  } finally {
    savingGroup.value = false;
  }
}

async function removeGroup(group: PlayerGroupSummary) {
  if (!(await confirm(t('admin.playerGroups.deleteConfirm', { id: group.id })))) return;
  try {
    await playerGroups.remove(group.id);
    if (activeGroupId.value === group.id) showPlayersModal.value = false;
    ui.toast(t('admin.playerGroups.deleted'), ToastType.SUCCESS);
  } catch (error) {
    handleError(error, t('common.deleteFailed'));
  }
}

function parsePlayerNames(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((player) => player.trim())
        .filter(Boolean),
    ),
  );
}

async function addPlayers() {
  if (!activeGroup.value) return;
  const values = parsePlayerNames(newPlayers.value);
  if (!values.length) return;
  addingPlayers.value = true;
  try {
    activeGroup.value = await playerGroups.addItems(activeGroup.value.id, values);
    newPlayers.value = '';
    await fetchPlayers();
    ui.toast(t('admin.playerGroups.itemsSaved'), ToastType.SUCCESS);
  } catch (error) {
    handleError(error);
  } finally {
    addingPlayers.value = false;
  }
}

function startItemEdit(item: PlayerGroupItem) {
  editingItemId.value = item.id;
  itemDraft.value = item.value;
}

function cancelItemEdit() {
  editingItemId.value = null;
  itemDraft.value = '';
}

async function saveItem(item: PlayerGroupItem) {
  if (!activeGroup.value || !itemDraft.value.trim()) return;
  savingItemId.value = item.id;
  try {
    await playerGroups.updateItem(activeGroup.value.id, item.id, itemDraft.value.trim());
    cancelItemEdit();
    await fetchPlayers();
    ui.toast(t('admin.playerGroups.playerRenamed'), ToastType.SUCCESS);
  } catch (error) {
    handleError(error);
  } finally {
    savingItemId.value = null;
  }
}

async function removeItem(item: PlayerGroupItem) {
  if (!activeGroup.value) return;
  if (!(await confirm(t('admin.playerGroups.playerDeleteConfirm', { player: item.value })))) return;
  deletingItemId.value = item.id;
  try {
    await playerGroups.removeItem(activeGroup.value.id, item.id);
    if (editingItemId.value === item.id) cancelItemEdit();
    const nextTotal = Math.max(0, playerTotal.value - 1);
    const nextTotalPages = Math.max(1, Math.ceil(nextTotal / playerPageSize.value));
    if (playerPage.value > nextTotalPages) playerPage.value = nextTotalPages;
    await fetchPlayers();
    ui.toast(t('admin.playerGroups.playerDeleted'), ToastType.SUCCESS);
  } catch (error) {
    handleError(error, t('common.deleteFailed'));
  } finally {
    deletingItemId.value = null;
  }
}

onMounted(async () => {
  try {
    await playerGroups.fetchList();
  } catch (error) {
    handleError(error, t('common.loadFailed'));
  }
});

watch(showPlayersModal, (open) => {
  if (open) return;
  playerLoadRequest += 1;
  playersLoading.value = false;
  if (playerSearchTimer) clearTimeout(playerSearchTimer);
  playerSearchTimer = undefined;
});

onBeforeUnmount(() => {
  playerLoadRequest += 1;
  if (playerSearchTimer) clearTimeout(playerSearchTimer);
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-xl font-semibold text-slate-950 dark:text-white">
        {{ t('admin.playerGroups.title') }}
      </h2>
      <BaseButton size="sm" icon="lucide:plus" @click="openCreateGroup">
        {{ t('admin.playerGroups.create') }}
      </BaseButton>
    </div>

    <div class="admin-settings-list">
      <BaseLoadingState v-if="playerGroups.loading && !playerGroups.loaded" />
      <template v-else>
        <div
          v-for="group in playerGroups.groups"
          :key="group.id"
          class="admin-settings-list-row !flex-col !items-stretch sm:!flex-row sm:!items-center"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h3 class="truncate text-sm font-medium text-slate-900 dark:text-white">
                {{ group.name || group.id }}
              </h3>
              <code class="truncate text-xs text-slate-400">{{ group.id }}</code>
            </div>
            <p v-if="group.note" class="mt-0.5 line-clamp-2 text-xs text-slate-500">
              {{ group.note }}
            </p>
            <p class="mt-1 text-xs text-slate-400">
              {{ t('admin.playerGroups.playerCount', { count: group._count.items }) }}
            </p>
          </div>
          <div class="flex w-full shrink-0 flex-wrap justify-end gap-1 sm:w-auto">
            <BaseButton
              size="sm"
              icon="lucide:users"
              class="flex-1 sm:flex-none"
              @click="openPlayers(group)"
            >
              {{ t('admin.playerGroups.managePlayers') }}
            </BaseButton>
            <BaseButton
              :class="iconButtonClass"
              :title="t('common.edit')"
              :aria-label="t('common.edit')"
              @click="openEditGroup(group)"
            >
              <Icon icon="lucide:pencil" class="h-4 w-4" />
            </BaseButton>
            <BaseButton
              :class="dangerIconButtonClass"
              :title="t('common.delete')"
              :aria-label="t('common.delete')"
              @click="removeGroup(group)"
            >
              <Icon icon="lucide:trash-2" class="h-4 w-4" />
            </BaseButton>
          </div>
        </div>
        <div v-if="!playerGroups.groups.length" class="admin-settings-list-empty">
          {{ t('admin.playerGroups.empty') }}
        </div>
      </template>
    </div>

    <BaseModal
      v-model="showGroupModal"
      :title="editingGroupId ? t('admin.playerGroups.edit') : t('admin.playerGroups.create')"
    >
      <form id="player-group-form" class="space-y-4" @submit.prevent="saveGroup">
        <BaseInput
          v-model="groupForm.id"
          :label="t('admin.playerGroups.id')"
          :disabled="!!editingGroupId"
          maxlength="64"
          pattern="[A-Za-z0-9_-]+"
          required
        />
        <BaseInput v-model="groupForm.name" :label="t('common.name')" maxlength="191" />
        <BaseInput
          v-model="groupForm.note"
          :label="t('admin.playerGroups.note')"
          maxlength="2000"
        />
      </form>
      <template #footer>
        <BaseButton type="button" @click="showGroupModal = false">
          {{ t('common.cancel') }}
        </BaseButton>
        <BaseButton
          filled
          type="submit"
          form="player-group-form"
          :loading="savingGroup"
          :disabled="!groupForm.id.trim()"
        >
          {{ t('common.save') }}
        </BaseButton>
      </template>
    </BaseModal>

    <BaseModal
      v-model="showPlayersModal"
      size="wide"
      :title="t('admin.playerGroups.playersTitle', { name: activeGroupTitle })"
    >
      <div v-if="activeGroup" class="space-y-4">
        <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]">
          <div class="relative">
            <Icon
              icon="lucide:search"
              class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <BaseInput
              v-model="playerSearch"
              :placeholder="t('admin.playerGroups.searchPlayers')"
              class="[&_input]:pl-9"
              maxlength="100"
              @input="queuePlayerSearch"
            />
          </div>
          <form class="flex min-w-0 gap-2" @submit.prevent="addPlayers">
            <BaseInput
              v-model="newPlayers"
              class="min-w-0 flex-1"
              :placeholder="t('admin.playerGroups.itemsPlaceholder')"
            />
            <BaseButton
              filled
              type="submit"
              icon="lucide:user-plus"
              :loading="addingPlayers"
              :disabled="playersLoading || !newPlayers.trim()"
            >
              {{ t('admin.playerGroups.addItems') }}
            </BaseButton>
          </form>
        </div>

        <div
          class="min-h-56 max-h-[38dvh] overflow-y-auto rounded-md border border-slate-200 sm:min-h-72 sm:max-h-[55dvh] dark:border-slate-800"
        >
          <BaseLoadingState v-if="playersLoading" />
          <template v-else>
            <div
              v-for="item in playerItems"
              :key="item.id"
              class="flex min-h-14 items-center gap-3 border-b border-slate-200 px-3 py-2 last:border-b-0 dark:border-slate-800 sm:px-4"
            >
              <form
                v-if="editingItemId === item.id"
                class="flex min-w-0 flex-1 items-center gap-2"
                @submit.prevent="saveItem(item)"
              >
                <BaseInput
                  v-model="itemDraft"
                  class="min-w-0 flex-1"
                  maxlength="16"
                  minlength="3"
                  pattern="[A-Za-z0-9_]{3,16}"
                  required
                />
                <BaseButton
                  :class="iconButtonClass"
                  type="submit"
                  :disabled="savingItemId === item.id"
                  :title="t('common.save')"
                  :aria-label="t('common.save')"
                >
                  <Icon
                    :icon="savingItemId === item.id ? 'lucide:loader-2' : 'lucide:check'"
                    class="h-4 w-4"
                    :class="{ 'animate-spin': savingItemId === item.id }"
                  />
                </BaseButton>
                <BaseButton
                  :class="iconButtonClass"
                  type="button"
                  :title="t('common.cancel')"
                  :aria-label="t('common.cancel')"
                  @click="cancelItemEdit"
                >
                  <Icon icon="lucide:x" class="h-4 w-4" />
                </BaseButton>
              </form>
              <template v-else>
                <span class="min-w-0 flex-1 truncate text-sm text-slate-900 dark:text-white">
                  {{ item.value }}
                </span>
                <BaseButton
                  :class="iconButtonClass"
                  :title="t('admin.playerGroups.renamePlayer')"
                  :aria-label="t('admin.playerGroups.renamePlayer')"
                  @click="startItemEdit(item)"
                >
                  <Icon icon="lucide:pencil" class="h-4 w-4" />
                </BaseButton>
                <BaseButton
                  :class="dangerIconButtonClass"
                  :disabled="deletingItemId === item.id"
                  :title="t('common.delete')"
                  :aria-label="t('common.delete')"
                  @click="removeItem(item)"
                >
                  <Icon
                    :icon="deletingItemId === item.id ? 'lucide:loader-2' : 'lucide:trash-2'"
                    class="h-4 w-4"
                    :class="{ 'animate-spin': deletingItemId === item.id }"
                  />
                </BaseButton>
              </template>
            </div>
          </template>
          <div
            v-if="!playersLoading && !playerItems.length"
            class="flex min-h-56 items-center justify-center px-4 text-center text-sm text-slate-400 sm:min-h-72"
          >
            {{
              playerSearch.trim()
                ? t('admin.playerGroups.noPlayerMatches')
                : t('admin.playerGroups.itemsEmpty')
            }}
          </div>
        </div>
        <BasePagination
          :page="playerPage"
          :total-pages="playerTotalPages"
          :total="playerTotal"
          :page-size="playerPageSize"
          class="!flex-wrap gap-y-2"
          @update:page="setPlayerPage"
          @update:page-size="setPlayerPageSize"
        />
      </div>

      <template #footer>
        <span v-if="activeGroup" class="mr-auto self-center text-xs text-slate-400">
          {{ t('admin.playerGroups.playerCount', { count: activeGroup._count.items }) }}
        </span>
        <BaseButton type="button" @click="showPlayersModal = false">
          {{ t('common.confirm') }}
        </BaseButton>
      </template>
    </BaseModal>
  </div>
</template>
