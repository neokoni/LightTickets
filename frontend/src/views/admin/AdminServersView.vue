<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import {
  apiGetServers,
  apiCreateServer,
  apiRegenerateKey,
  apiUpdateServer,
  apiDeleteServer,
} from '@/api/servers';
import { ToastType, useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { useConfirm } from '@/composables/useConfirm';
import { t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import type { Server } from '@/types/user';

const ui = useUiStore();
const { confirm } = useConfirm();
const servers = ref<Server[]>([]);
const showModal = ref(false);
const form = ref({ name: '', address: '', description: '' });
const showEditModal = ref(false);
const editingServer = ref<Server | null>(null);
const editForm = ref({ name: '', address: '', description: '' });

async function fetchServers() {
  servers.value = await apiGetServers();
}

async function create() {
  try {
    const server = await apiCreateServer(form.value);
    servers.value.push(server);
    showModal.value = false;
    form.value = { name: '', address: '', description: '' };
    ui.toast(t('admin.servers.created'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.createFailed'));
  }
}

async function regenerate(id: string) {
  try {
    const { apiKey } = await apiRegenerateKey(id);
    const idx = servers.value.findIndex((s) => s.id === id);
    if (idx !== -1) servers.value[idx].apiKey = apiKey;
    ui.toast(t('admin.servers.keyRegenerated'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e);
  }
}

function startEdit(server: Server) {
  editingServer.value = server;
  editForm.value = {
    name: server.name,
    address: server.address || '',
    description: server.description || '',
  };
  showEditModal.value = true;
}

async function saveEdit() {
  if (!editingServer.value) return;
  try {
    const updated = await apiUpdateServer(editingServer.value.id, {
      name: editForm.value.name.trim(),
      address: editForm.value.address.trim() || null,
      description: editForm.value.description.trim() || null,
    });
    const idx = servers.value.findIndex((s) => s.id === updated.id);
    if (idx !== -1) servers.value[idx] = updated;
    showEditModal.value = false;
    editingServer.value = null;
    ui.toast(t('admin.servers.updated'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.saveFailed'));
  }
}

async function remove(id: string) {
  if (!(await confirm(t('admin.servers.deleteConfirm')))) return;
  try {
    await apiDeleteServer(id);
    servers.value = servers.value.filter((s) => s.id !== id);
    ui.toast(t('admin.servers.deleted'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.deleteFailed'));
  }
}

const copiedId = ref<string | null>(null);
const iconButtonClass =
  '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
const dangerIconButtonClass = '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-red-500';
const copyButtonClass =
  '!absolute !right-3 !top-1/2 !-translate-y-1/2 !w-8 !h-8 !px-1.5 !py-1.5 border-none ' +
  'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 ' +
  'opacity-0 group-hover:opacity-100 transition-opacity';

async function copyToClipboard(server: Server) {
  try {
    await navigator.clipboard.writeText(server.apiKey);
    copiedId.value = server.id;
    setTimeout(() => {
      if (copiedId.value === server.id) {
        copiedId.value = null;
      }
    }, 2000);
    ui.toast(t('admin.servers.keyCopied'), ToastType.SUCCESS);
  } catch {
    ui.toast(t('common.copyFailed'), ToastType.ERROR);
  }
}

onMounted(fetchServers);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
        {{ t('admin.servers.title') }}
      </h2>
      <BaseButton size="sm" icon="lucide:plus" @click="showModal = true">{{
        t('admin.servers.add')
      }}</BaseButton>
    </div>

    <div class="space-y-3">
      <div
        v-for="server in servers"
        :key="server.id"
        class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-2"
      >
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-medium text-slate-900 dark:text-white">{{ server.name }}</h3>
            <div
              v-if="server.address || server.description"
              class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"
            >
              <span v-if="server.address">{{ server.address }}</span>
              <span v-if="server.description">{{ server.description }}</span>
            </div>
          </div>
          <div class="flex gap-1">
            <BaseButton
              :class="iconButtonClass"
              :title="t('admin.servers.rename')"
              @click="startEdit(server)"
            >
              <Icon icon="lucide:pencil" class="w-4 h-4" />
            </BaseButton>
            <BaseButton
              :class="iconButtonClass"
              :title="t('admin.servers.regenerateKey')"
              @click="regenerate(server.id)"
            >
              <Icon icon="lucide:refresh-cw" class="w-4 h-4" />
            </BaseButton>
            <BaseButton
              :class="dangerIconButtonClass"
              :title="t('common.delete')"
              @click="remove(server.id)"
            >
              <Icon icon="lucide:trash-2" class="w-4 h-4" />
            </BaseButton>
          </div>
        </div>
        <div class="relative flex items-center gap-2 group">
          <code
            class="flex-1 px-3 py-3 pr-12 text-xs bg-slate-100 dark:bg-slate-800 rounded-md font-mono truncate"
            >{{ server.apiKey }}</code
          >
          <BaseButton
            :class="[
              copyButtonClass,
              copiedId === server.id
                ? 'text-green-500 dark:text-green-400'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            ]"
            :title="t('admin.servers.copyKey')"
            @click="copyToClipboard(server)"
          >
            <Icon
              :icon="copiedId === server.id ? 'lucide:check' : 'lucide:clipboard-copy'"
              class="w-[18px] h-[18px]"
            />
          </BaseButton>
        </div>
      </div>
      <div
        v-if="!servers.length"
        class="py-8 text-center text-sm text-slate-500 dark:text-slate-400"
      >
        {{ t('admin.servers.empty') }}
      </div>
    </div>

    <BaseModal v-model="showModal" :title="t('admin.servers.add')">
      <form class="space-y-4" @submit.prevent="create">
        <BaseInput
          v-model="form.name"
          :label="t('common.name')"
          :placeholder="t('admin.servers.namePlaceholder')"
        />
        <BaseInput
          v-model="form.address"
          :label="t('common.addressOptional')"
          placeholder="play.example.com"
        />
        <BaseInput v-model="form.description" :label="t('common.descriptionOptional')" />
        <div class="flex justify-end gap-2">
          <BaseButton type="button" @click="showModal = false">{{ t('common.cancel') }}</BaseButton>
          <BaseButton filled type="submit" :disabled="!form.name.trim()">{{
            t('common.create')
          }}</BaseButton>
        </div>
      </form>
    </BaseModal>

    <BaseModal v-model="showEditModal" :title="t('admin.servers.editTitle')">
      <form class="space-y-4" @submit.prevent="saveEdit">
        <BaseInput
          v-model="editForm.name"
          :label="t('common.name')"
          :placeholder="t('admin.servers.namePlaceholder')"
        />
        <BaseInput
          v-model="editForm.address"
          :label="t('common.addressOptional')"
          placeholder="play.example.com"
        />
        <BaseInput v-model="editForm.description" :label="t('common.descriptionOptional')" />
        <div class="flex justify-end gap-2">
          <BaseButton type="button" @click="showEditModal = false">{{
            t('common.cancel')
          }}</BaseButton>
          <BaseButton filled type="submit" :disabled="!editForm.name.trim()">{{
            t('common.save')
          }}</BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
