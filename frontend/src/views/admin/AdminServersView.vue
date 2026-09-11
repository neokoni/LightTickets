<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import {
  apiCreateServer,
  apiCreateServerApiKey,
  apiDeleteServer,
  apiDeleteServerApiKey,
  apiGetServerApiKeys,
  apiGetServers,
  apiRegenerateServerApiKey,
  apiUpdateServer,
  apiUpdateServerApiKey,
} from '@/api/servers';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseLoadingState from '@/components/base/BaseLoadingState.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseMultiSelect from '@/components/base/BaseMultiSelect.vue';
import BaseSelect from '@/components/base/BaseSelect.vue';
import { useConfirm } from '@/composables/useConfirm';
import { t } from '@/i18n';
import { ToastType, useUiStore } from '@/stores/ui';
import { ServerApiKeyType, type Server, type ServerApiKey } from '@/types/user';
import { handleError } from '@/utils/error';

const ui = useUiStore();
const { confirm } = useConfirm();
const servers = ref<Server[]>([]);
const apiKeys = ref<ServerApiKey[]>([]);
const loading = ref(false);
const showServerModal = ref(false);
const showKeyModal = ref(false);
const editingServer = ref<Server | null>(null);
const editingKey = ref<ServerApiKey | null>(null);
const serverForm = ref({ serverId: '', identifyId: '', alias: '' });
const keyForm = ref<{ title: string; type: ServerApiKeyType; serverIds: string[] }>({
  title: '',
  type: ServerApiKeyType.PAPER_FOLIA,
  serverIds: [],
});
const visibleKeyIds = ref(new Set<string>());
const copiedId = ref<string | null>(null);

const serverOptions = computed(() =>
  servers.value.map((server) => ({
    value: server.id,
    label: server.alias ? `${server.alias} (${server.serverId})` : server.serverId,
  })),
);
const keyTypeOptions = computed(() => [
  { value: ServerApiKeyType.PAPER_FOLIA, label: t('admin.servers.paperFolia') },
  { value: ServerApiKeyType.VELOCITY, label: t('admin.servers.velocity') },
]);
const paperServerId = computed({
  get: () => keyForm.value.serverIds[0] ?? '',
  set: (value: string) => {
    keyForm.value.serverIds = value ? [value] : [];
  },
});
const iconButtonClass =
  '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
const dangerIconButtonClass = '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-red-500';

async function fetchAll() {
  loading.value = true;
  try {
    [servers.value, apiKeys.value] = await Promise.all([apiGetServers(), apiGetServerApiKeys()]);
  } catch (error) {
    handleError(error, t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function openCreateServer() {
  editingServer.value = null;
  serverForm.value = { serverId: '', identifyId: '', alias: '' };
  showServerModal.value = true;
}

function openEditServer(server: Server) {
  editingServer.value = server;
  serverForm.value = {
    serverId: server.serverId,
    identifyId: server.identifyId ?? '',
    alias: server.alias ?? '',
  };
  showServerModal.value = true;
}

async function saveServer() {
  const data = {
    serverId: serverForm.value.serverId.trim(),
    identifyId: serverForm.value.identifyId.trim() || undefined,
    alias: serverForm.value.alias.trim() || undefined,
  };
  try {
    if (editingServer.value) {
      const updated = await apiUpdateServer(editingServer.value.id, {
        serverId: data.serverId,
        identifyId: data.identifyId ?? null,
        alias: data.alias ?? null,
      });
      servers.value = servers.value.map((server) => (server.id === updated.id ? updated : server));
      ui.toast(t('admin.servers.updated'), ToastType.SUCCESS);
    } else {
      servers.value.push(await apiCreateServer(data));
      ui.toast(t('admin.servers.created'), ToastType.SUCCESS);
    }
    showServerModal.value = false;
  } catch (error) {
    handleError(error, t('common.saveFailed'));
  }
}

async function removeServer(server: Server) {
  if (!(await confirm(t('admin.servers.deleteConfirm')))) return;
  try {
    await apiDeleteServer(server.id);
    servers.value = servers.value.filter((candidate) => candidate.id !== server.id);
    ui.toast(t('admin.servers.deleted'), ToastType.SUCCESS);
  } catch (error) {
    handleError(error);
  }
}

function openCreateKey() {
  editingKey.value = null;
  keyForm.value = { title: '', type: ServerApiKeyType.PAPER_FOLIA, serverIds: [] };
  showKeyModal.value = true;
}

function openEditKey(key: ServerApiKey) {
  editingKey.value = key;
  keyForm.value = {
    title: key.title ?? '',
    type: key.type,
    serverIds: key.servers.map((server) => server.id),
  };
  showKeyModal.value = true;
}

function onKeyTypeChanged() {
  if (keyForm.value.type === ServerApiKeyType.PAPER_FOLIA) {
    keyForm.value.serverIds = keyForm.value.serverIds.slice(0, 1);
  }
}

async function saveKey() {
  const payload = {
    title: keyForm.value.title.trim() || null,
    type: keyForm.value.type,
    serverIds: keyForm.value.serverIds,
  };
  try {
    if (editingKey.value) {
      const updated = await apiUpdateServerApiKey(editingKey.value.id, payload);
      apiKeys.value = apiKeys.value.map((key) =>
        key.id === updated.id ? { ...updated, apiKey: key.apiKey } : key,
      );
      ui.toast(t('admin.servers.keyUpdated'), ToastType.SUCCESS);
    } else {
      const created = await apiCreateServerApiKey(payload);
      apiKeys.value.push(created);
      visibleKeyIds.value = new Set([...visibleKeyIds.value, created.id]);
      ui.toast(t('admin.servers.keyCreated'), ToastType.SUCCESS);
    }
    showKeyModal.value = false;
  } catch (error) {
    handleError(error, t('common.saveFailed'));
  }
}

async function regenerateKey(key: ServerApiKey) {
  if (!(await confirm(t('admin.servers.regenerateKeyConfirm')))) return;
  try {
    const { apiKey } = await apiRegenerateServerApiKey(key.id);
    key.apiKey = apiKey;
    visibleKeyIds.value = new Set([...visibleKeyIds.value, key.id]);
    ui.toast(t('admin.servers.keyRegenerated'), ToastType.SUCCESS);
  } catch (error) {
    handleError(error);
  }
}

async function removeKey(key: ServerApiKey) {
  if (!(await confirm(t('admin.servers.deleteKeyConfirm')))) return;
  try {
    await apiDeleteServerApiKey(key.id);
    apiKeys.value = apiKeys.value.filter((candidate) => candidate.id !== key.id);
    ui.toast(t('admin.servers.keyDeleted'), ToastType.SUCCESS);
  } catch (error) {
    handleError(error);
  }
}

function toggleKeyVisibility(id: string) {
  const next = new Set(visibleKeyIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  visibleKeyIds.value = next;
}

function maskApiKey(apiKey: string) {
  return '•'.repeat(Math.min(Math.max(apiKey.length, 16), 32));
}

async function copyKey(key: ServerApiKey) {
  if (!key.apiKey) return;
  try {
    await navigator.clipboard.writeText(key.apiKey);
    copiedId.value = key.id;
    setTimeout(() => {
      if (copiedId.value === key.id) copiedId.value = null;
    }, 2000);
    ui.toast(t('admin.servers.keyCopied'), ToastType.SUCCESS);
  } catch {
    ui.toast(t('common.copyFailed'), ToastType.ERROR);
  }
}

onMounted(fetchAll);
</script>

<template>
  <div class="space-y-8">
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {{ t('admin.servers.title') }}
          </h2>
          <p class="mt-1 text-sm text-slate-500">{{ t('admin.servers.serverHelp') }}</p>
        </div>
        <BaseButton size="sm" icon="lucide:plus" @click="openCreateServer">
          {{ t('admin.servers.add') }}
        </BaseButton>
      </div>
      <BaseLoadingState v-if="loading" />
      <div v-else class="admin-settings-list">
        <div v-for="server in servers" :key="server.id" class="admin-settings-list-row">
          <div class="min-w-0">
            <h3 class="font-medium text-slate-900 dark:text-white">
              {{ server.alias || server.serverId }}
            </h3>
            <p class="text-xs text-slate-500">
              <code>{{ server.serverId }}</code>
              <template v-if="server.identifyId">
                · {{ t('admin.servers.identifyId') }} <code>{{ server.identifyId }}</code>
              </template>
            </p>
          </div>
          <div class="flex gap-1">
            <BaseButton :class="iconButtonClass" @click="openEditServer(server)">
              <Icon icon="lucide:pencil" class="h-4 w-4" />
            </BaseButton>
            <BaseButton :class="dangerIconButtonClass" @click="removeServer(server)">
              <Icon icon="lucide:trash-2" class="h-4 w-4" />
            </BaseButton>
          </div>
        </div>
        <div v-if="!servers.length" class="admin-settings-list-empty">
          {{ t('admin.servers.empty') }}
        </div>
      </div>
    </section>

    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {{ t('admin.servers.apiKeysTitle') }}
          </h2>
          <p class="mt-1 text-sm text-slate-500">{{ t('admin.servers.apiKeysHelp') }}</p>
        </div>
        <BaseButton
          size="sm"
          icon="lucide:key-round"
          :disabled="!servers.length"
          @click="openCreateKey"
        >
          {{ t('admin.servers.addKey') }}
        </BaseButton>
      </div>
      <div class="admin-settings-list">
        <div v-for="key in apiKeys" :key="key.id" class="admin-settings-list-row !items-start">
          <div class="min-w-0 space-y-1">
            <h3 class="font-medium text-slate-900 dark:text-white">
              {{
                key.title ||
                (key.type === ServerApiKeyType.PAPER_FOLIA
                  ? t('admin.servers.paperFolia')
                  : t('admin.servers.velocity'))
              }}
            </h3>
            <p class="text-xs text-slate-500">
              {{ key.servers.map((server) => server.alias || server.serverId).join(', ') }}
            </p>
            <div v-if="key.apiKey" class="flex min-w-0 items-center gap-2 pt-2">
              <code class="max-w-lg break-all text-xs text-slate-600 dark:text-slate-300">
                {{ visibleKeyIds.has(key.id) ? key.apiKey : maskApiKey(key.apiKey) }}
              </code>
              <BaseButton :class="iconButtonClass" @click="toggleKeyVisibility(key.id)">
                <Icon
                  :icon="visibleKeyIds.has(key.id) ? 'lucide:eye-off' : 'lucide:eye'"
                  class="h-4 w-4"
                />
              </BaseButton>
              <BaseButton :class="iconButtonClass" @click="copyKey(key)">
                <Icon
                  :icon="copiedId === key.id ? 'lucide:check' : 'lucide:clipboard'"
                  class="h-4 w-4"
                />
              </BaseButton>
            </div>
          </div>
          <div class="flex gap-1">
            <BaseButton :class="iconButtonClass" @click="openEditKey(key)">
              <Icon icon="lucide:pencil" class="h-4 w-4" />
            </BaseButton>
            <BaseButton :class="iconButtonClass" @click="regenerateKey(key)">
              <Icon icon="lucide:refresh-cw" class="h-4 w-4" />
            </BaseButton>
            <BaseButton :class="dangerIconButtonClass" @click="removeKey(key)">
              <Icon icon="lucide:trash-2" class="h-4 w-4" />
            </BaseButton>
          </div>
        </div>
        <div v-if="!apiKeys.length" class="admin-settings-list-empty">
          {{ t('admin.servers.keysEmpty') }}
        </div>
      </div>
    </section>

    <BaseModal
      v-model="showServerModal"
      :title="editingServer ? t('admin.servers.editTitle') : t('admin.servers.add')"
    >
      <form class="space-y-4" @submit.prevent="saveServer">
        <BaseInput
          v-model="serverForm.serverId"
          :label="t('admin.servers.serverId')"
          required
          placeholder="survival"
        />
        <BaseInput
          v-model="serverForm.identifyId"
          :label="t('admin.servers.identifyId')"
          :placeholder="t('admin.servers.identifyIdPlaceholder')"
        />
        <BaseInput v-model="serverForm.alias" :label="t('admin.servers.alias')" />
        <div class="flex justify-end gap-2">
          <BaseButton type="button" @click="showServerModal = false">{{
            t('common.cancel')
          }}</BaseButton>
          <BaseButton filled type="submit" :disabled="!serverForm.serverId.trim()">{{
            t('common.save')
          }}</BaseButton>
        </div>
      </form>
    </BaseModal>

    <BaseModal
      v-model="showKeyModal"
      :title="editingKey ? t('admin.servers.editKey') : t('admin.servers.addKey')"
    >
      <form class="space-y-4" @submit.prevent="saveKey">
        <BaseInput v-model="keyForm.title" :label="t('admin.servers.keyTitle')" />
        <BaseSelect
          v-model="keyForm.type"
          :label="t('admin.servers.keyType')"
          :options="keyTypeOptions"
          required
          @update:model-value="onKeyTypeChanged"
        />
        <BaseSelect
          v-if="keyForm.type === ServerApiKeyType.PAPER_FOLIA"
          v-model="paperServerId"
          :label="t('admin.servers.boundServer')"
          :options="serverOptions"
          required
        />
        <BaseMultiSelect
          v-else
          v-model="keyForm.serverIds"
          :label="t('admin.servers.allowedServers')"
          :options="serverOptions"
          :placeholder="t('admin.servers.selectServers')"
          :empty-text="t('admin.servers.empty')"
          :no-results-text="t('common.noResults')"
          :all-selected-text="t('admin.servers.allServersSelected')"
          :remove-title="t('admin.servers.removeServerSelection')"
          selected-icon="lucide:server"
          required
        />
        <div class="flex justify-end gap-2">
          <BaseButton type="button" @click="showKeyModal = false">{{
            t('common.cancel')
          }}</BaseButton>
          <BaseButton filled type="submit" :disabled="!keyForm.serverIds.length">{{
            t('common.save')
          }}</BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
