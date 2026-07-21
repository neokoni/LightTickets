<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Icon } from '@iconify/vue';
import {
  apiCreateFederatedAuthProvider,
  apiDeleteFederatedAuthProvider,
  apiListFederatedAuthProviders,
  apiTestFederatedAuthProvider,
  apiUnlinkFederatedAuthProvider,
  apiUpdateFederatedAuthProvider,
} from '@/api/federatedauth';
import type {
  FederatedAuthProtocol,
  FederatedAuthProvider,
  FederatedAuthProviderPayload,
  FederatedAuthSecretMode,
} from '@/types/federatedauth';
import { siteConfig } from '@/stores/site';
import { ToastType, useUiStore } from '@/stores/ui';
import { useConfirm } from '@/composables/useConfirm';
import { handleError } from '@/utils/error';
import { t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseLoadingState from '@/components/base/BaseLoadingState.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseSelect from '@/components/base/BaseSelect.vue';
import BaseTextarea from '@/components/base/BaseTextarea.vue';
import BaseToggle from '@/components/base/BaseToggle.vue';

interface ProviderForm {
  slug: string;
  name: string;
  iconUrl: string;
  protocol: FederatedAuthProtocol;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  subjectPath: string;
  usernamePath: string;
  emailPath: string;
  avatarPath: string;
  authorizationParams: string;
  pkce: boolean;
  secretMode: FederatedAuthSecretMode;
  accessTokenPath: string;
  enabled: boolean;
  allowRegistration: boolean;
}

const ui = useUiStore();
const { confirm } = useConfirm();
const providers = ref<FederatedAuthProvider[]>([]);
const loading = ref(true);
const saving = ref(false);
const testingId = ref<string | null>(null);
const modalOpen = ref(false);
const advancedOpen = ref(false);
const editing = ref<FederatedAuthProvider | null>(null);
const iconButtonClass =
  '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
const dangerIconButtonClass = '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-red-500';

const form = reactive<ProviderForm>({
  slug: '',
  name: '',
  iconUrl: '',
  protocol: 'oidc',
  issuer: '',
  authorizationEndpoint: '',
  tokenEndpoint: '',
  userInfoEndpoint: '',
  redirectUri: '',
  clientId: '',
  clientSecret: '',
  scope: 'openid profile email',
  subjectPath: 'sub',
  usernamePath: 'preferred_username',
  emailPath: 'email',
  avatarPath: 'picture',
  authorizationParams: '{}',
  pkce: true,
  secretMode: 'basic',
  accessTokenPath: 'access_token',
  enabled: false,
  allowRegistration: false,
});

const protocolOptions = computed(() => [
  { value: 'oidc', label: t('admin.federatedauth.oidc') },
  { value: 'oauth', label: t('admin.federatedauth.oauth') },
]);
const secretModeOptions = computed(() => [
  { value: 'basic', label: 'client_secret_basic' },
  { value: 'post', label: 'client_secret_post' },
  { value: 'bcrypt', label: t('admin.federatedauth.bcrypt') },
]);

function syncPublicProviders() {
  siteConfig.federatedAuthProviders = providers.value
    .filter((provider) => provider.enabled)
    .map(({ slug, name, iconUrl, allowRegistration }) => ({
      slug,
      name,
      iconUrl,
      allowRegistration,
    }));
}

async function load() {
  loading.value = true;
  try {
    providers.value = await apiListFederatedAuthProviders();
    syncPublicProviders();
  } catch (error) {
    handleError(error, t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function suggestedRedirect(slug: string): string {
  if (!siteConfig.siteUrl || !slug) return '';
  return `${siteConfig.siteUrl.replace(/\/$/, '')}/api/auth/federatedauth/${slug}/callback`;
}

function reset(provider?: FederatedAuthProvider) {
  editing.value = provider ?? null;
  advancedOpen.value = false;
  Object.assign(form, {
    slug: provider?.slug ?? '',
    name: provider?.name ?? '',
    iconUrl: provider?.iconUrl ?? '',
    protocol: provider?.protocol ?? 'oidc',
    issuer: provider?.issuer ?? '',
    authorizationEndpoint: provider?.authorizationEndpoint ?? '',
    tokenEndpoint: provider?.tokenEndpoint ?? '',
    userInfoEndpoint: provider?.userInfoEndpoint ?? '',
    redirectUri: provider?.redirectUri ?? '',
    clientId: provider?.clientId ?? '',
    clientSecret: '',
    scope: provider?.scope ?? 'openid profile email',
    subjectPath: provider?.subjectPath ?? 'sub',
    usernamePath: provider?.usernamePath ?? 'preferred_username',
    emailPath: provider?.emailPath ?? 'email',
    avatarPath: provider?.avatarPath ?? 'picture',
    authorizationParams: JSON.stringify(provider?.authorizationParams ?? {}, null, 2),
    pkce: provider?.pkce ?? true,
    secretMode: provider?.secretMode ?? 'basic',
    accessTokenPath: provider?.accessTokenPath ?? 'access_token',
    enabled: provider?.enabled ?? false,
    allowRegistration: provider?.allowRegistration ?? false,
  });
  modalOpen.value = true;
}

function changeProtocol(value: string | undefined) {
  if (value !== 'oidc' && value !== 'oauth') return;
  form.protocol = value;
  if (value === 'oidc') {
    form.scope = 'openid profile email';
    form.subjectPath = 'sub';
    form.usernamePath = 'preferred_username';
    form.emailPath = 'email';
    form.avatarPath = 'picture';
    if (form.secretMode === 'bcrypt') form.secretMode = 'basic';
  } else {
    form.scope = 'profile email';
    form.subjectPath = 'id';
    form.usernamePath = 'username';
    form.emailPath = 'email';
    form.avatarPath = 'avatar_url';
  }
}

function httpUrl(value: string, field: string, optional = false): string | null {
  const normalized = value.trim();
  if (!normalized && optional) return null;
  try {
    const url = new window.URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return normalized;
  } catch {
    throw new Error(t('admin.federatedauth.invalidUrl', { field }));
  }
}

function payload(): FederatedAuthProviderPayload {
  let authorizationParams: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(form.authorizationParams || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    authorizationParams = Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => {
        if (typeof value !== 'string') throw new Error();
        return [key, value];
      }),
    );
  } catch {
    throw new Error(t('admin.federatedauth.invalidParams'));
  }
  const redirectUri = httpUrl(
    form.redirectUri || suggestedRedirect(form.slug),
    t('admin.federatedauth.redirectUri'),
  )!;
  return {
    slug: form.slug.trim(),
    name: form.name.trim(),
    iconUrl: httpUrl(form.iconUrl, t('admin.federatedauth.iconUrl'), true),
    protocol: form.protocol,
    issuer: form.protocol === 'oidc' ? httpUrl(form.issuer, 'Issuer') : null,
    authorizationEndpoint:
      form.protocol === 'oauth'
        ? httpUrl(form.authorizationEndpoint, t('admin.federatedauth.authorizationEndpoint'))
        : null,
    tokenEndpoint:
      form.protocol === 'oauth'
        ? httpUrl(form.tokenEndpoint, t('admin.federatedauth.tokenEndpoint'))
        : null,
    userInfoEndpoint:
      form.protocol === 'oauth'
        ? httpUrl(form.userInfoEndpoint, t('admin.federatedauth.userInfoEndpoint'))
        : null,
    redirectUri,
    clientId: form.clientId.trim(),
    ...(form.clientSecret && { clientSecret: form.clientSecret }),
    scope: form.scope.trim(),
    subjectPath: form.subjectPath.trim(),
    usernamePath: form.usernamePath.trim() || null,
    emailPath: form.emailPath.trim() || null,
    avatarPath: form.avatarPath.trim() || null,
    authorizationParams,
    pkce: form.pkce,
    secretMode: form.secretMode,
    accessTokenPath: form.accessTokenPath.trim(),
    enabled: form.enabled,
    allowRegistration: form.allowRegistration,
  };
}

async function save() {
  saving.value = true;
  try {
    const data = payload();
    if (editing.value) await apiUpdateFederatedAuthProvider(editing.value.id, data);
    else await apiCreateFederatedAuthProvider(data);
    modalOpen.value = false;
    await load();
    ui.toast(t('admin.federatedauth.saved'), ToastType.SUCCESS);
  } catch (error) {
    handleError(error, t('common.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function testProvider(provider: FederatedAuthProvider) {
  testingId.value = provider.id;
  try {
    await apiTestFederatedAuthProvider(provider.id);
    ui.toast(t('admin.federatedauth.testSuccess'), ToastType.SUCCESS);
  } catch (error) {
    handleError(error, t('admin.federatedauth.testFailed'));
  } finally {
    testingId.value = null;
  }
}

async function remove(provider: FederatedAuthProvider) {
  if (
    !(await confirm({
      message: t('admin.federatedauth.deleteConfirm', { provider: provider.name }),
      danger: true,
    }))
  )
    return;
  try {
    await apiDeleteFederatedAuthProvider(provider.id);
    await load();
  } catch (error) {
    handleError(error, t('common.deleteFailed'));
  }
}

async function unlinkAll(provider: FederatedAuthProvider) {
  if (
    !(await confirm({
      message: t('admin.federatedauth.unlinkAllConfirm', {
        provider: provider.name,
        count: provider.identityCount,
      }),
      danger: true,
    }))
  )
    return;
  try {
    const result = await apiUnlinkFederatedAuthProvider(provider.id);
    await load();
    ui.toast(t('admin.federatedauth.unlinkedAll', { count: result.unlinked }), ToastType.SUCCESS);
  } catch (error) {
    handleError(error, t('admin.federatedauth.unlinkAllFailed'));
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
        {{ t('admin.federatedauth.title') }}
      </h2>
      <BaseButton size="sm" icon="lucide:plus" @click="reset()">
        {{ t('admin.federatedauth.create') }}
      </BaseButton>
    </div>

    <BaseLoadingState v-if="loading" />
    <div v-else class="admin-settings-list">
      <div v-for="provider in providers" :key="provider.id" class="admin-settings-list-row">
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <img
              v-if="provider.iconUrl"
              :src="provider.iconUrl"
              :alt="provider.name"
              class="h-6 w-6 rounded object-contain"
            />
            <span class="font-medium text-slate-900 dark:text-white">{{ provider.name }}</span>
            <code class="text-xs text-slate-400">{{ provider.slug }}</code>
            <span class="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
              {{ provider.protocol.toUpperCase() }}
            </span>
          </div>
          <div class="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500">
            <span class="shrink-0">
              {{ t('admin.federatedauth.bindings', { count: provider.identityCount }) }}
            </span>
            <span aria-hidden="true">·</span>
            <code class="min-w-0 truncate text-slate-400">
              {{ provider.issuer ?? provider.authorizationEndpoint }}
            </code>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <BaseButton
            :class="iconButtonClass"
            :loading="testingId === provider.id"
            :title="t('admin.federatedauth.test')"
            @click="testProvider(provider)"
          >
            <Icon v-if="testingId !== provider.id" icon="lucide:plug" class="h-4 w-4" />
          </BaseButton>
          <BaseButton :class="iconButtonClass" :title="t('common.edit')" @click="reset(provider)">
            <Icon icon="lucide:pencil" class="h-4 w-4" />
          </BaseButton>
          <BaseButton
            v-if="provider.identityCount > 0"
            :class="dangerIconButtonClass"
            :title="t('admin.federatedauth.unlinkAll')"
            @click="unlinkAll(provider)"
          >
            <Icon icon="lucide:unlink" class="h-4 w-4" />
          </BaseButton>
          <BaseButton
            :class="dangerIconButtonClass"
            :title="
              provider.identityCount ? t('admin.federatedauth.deleteBlocked') : t('common.delete')
            "
            :disabled="provider.identityCount > 0"
            @click="remove(provider)"
          >
            <Icon icon="lucide:trash-2" class="h-4 w-4" />
          </BaseButton>
        </div>
      </div>
      <p v-if="!providers.length" class="admin-settings-list-empty">
        {{ t('admin.federatedauth.empty') }}
      </p>
    </div>

    <BaseModal
      v-model="modalOpen"
      :title="editing ? t('admin.federatedauth.edit') : t('admin.federatedauth.create')"
    >
      <form class="max-h-[70vh] space-y-4 overflow-y-auto pr-1" @submit.prevent="save">
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseInput
            v-model="form.slug"
            :label="t('admin.federatedauth.slug')"
            :disabled="!!editing?.identityCount"
          />
          <BaseInput v-model="form.name" :label="t('admin.federatedauth.name')" />
        </div>
        <BaseInput v-model="form.iconUrl" :label="t('admin.federatedauth.iconUrl')" />
        <BaseSelect
          v-model="form.protocol"
          :label="t('admin.federatedauth.protocol')"
          :options="protocolOptions"
          :disabled="!!editing?.identityCount"
          @update:model-value="changeProtocol"
        />
        <BaseInput v-if="form.protocol === 'oidc'" v-model="form.issuer" label="Issuer" />
        <template v-else>
          <BaseInput
            v-model="form.authorizationEndpoint"
            :label="t('admin.federatedauth.authorizationEndpoint')"
          />
          <BaseInput v-model="form.tokenEndpoint" :label="t('admin.federatedauth.tokenEndpoint')" />
          <BaseInput
            v-model="form.userInfoEndpoint"
            :label="t('admin.federatedauth.userInfoEndpoint')"
          />
        </template>
        <BaseInput
          v-model="form.redirectUri"
          :label="t('admin.federatedauth.redirectUri')"
          :placeholder="suggestedRedirect(form.slug)"
        />
        <BaseInput v-model="form.clientId" label="Client ID" />
        <BaseInput
          v-model="form.clientSecret"
          label="Client Secret"
          type="password"
          :placeholder="editing?.clientSecretSet ? t('admin.federatedauth.keepSecret') : ''"
        />
        <BaseInput v-model="form.scope" label="Scope" />

        <BaseButton
          type="button"
          size="sm"
          :aria-expanded="advancedOpen"
          aria-controls="federatedauth-advanced-options"
          @click="advancedOpen = !advancedOpen"
        >
          {{ t('admin.federatedauth.advanced') }}
          <Icon :icon="advancedOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'" />
        </BaseButton>
        <div
          v-show="advancedOpen"
          id="federatedauth-advanced-options"
          class="space-y-4"
          :aria-hidden="!advancedOpen"
          :inert="advancedOpen ? undefined : true"
        >
          <div class="grid gap-3 sm:grid-cols-2">
            <BaseInput v-model="form.subjectPath" :label="t('admin.federatedauth.subjectPath')" />
            <BaseInput v-model="form.usernamePath" :label="t('admin.federatedauth.usernamePath')" />
            <BaseInput v-model="form.emailPath" :label="t('admin.federatedauth.emailPath')" />
            <BaseInput v-model="form.avatarPath" :label="t('admin.federatedauth.avatarPath')" />
          </div>
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium">PKCE</p>
              <p class="text-xs text-slate-500">{{ t('admin.federatedauth.pkceHelp') }}</p>
            </div>
            <BaseToggle v-model="form.pkce" />
          </div>
          <BaseSelect
            v-model="form.secretMode"
            :label="t('admin.federatedauth.secretMode')"
            :options="secretModeOptions"
          />
          <BaseInput
            v-model="form.accessTokenPath"
            :label="t('admin.federatedauth.accessTokenPath')"
          />
          <BaseTextarea
            v-model="form.authorizationParams"
            :label="t('admin.federatedauth.authorizationParams')"
            :rows="4"
          />
        </div>

        <div class="flex items-center justify-between gap-4">
          <span class="text-sm">{{ t('admin.federatedauth.enabled') }}</span>
          <BaseToggle v-model="form.enabled" />
        </div>
        <div class="flex items-center justify-between gap-4">
          <span class="text-sm">{{ t('admin.federatedauth.allowRegistration') }}</span>
          <BaseToggle v-model="form.allowRegistration" />
        </div>
        <BaseButton filled type="submit" class="w-full" :loading="saving">
          {{ t('common.save') }}
        </BaseButton>
      </form>
    </BaseModal>
  </div>
</template>
