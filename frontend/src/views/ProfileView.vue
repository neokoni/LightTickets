<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useAuthStore } from '@/stores/auth';
import { ToastType, useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { activeLanguage, availableLanguages, setLanguage, t } from '@/i18n';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseSelect from '@/components/base/BaseSelect.vue';
import UserAvatar from '@/components/base/UserAvatar.vue';

const auth = useAuthStore();
const ui = useUiStore();

const activeSection = ref<'account' | 'password' | 'minecraft' | 'language'>('account');
const iconButtonClass =
  '!px-0 !py-0 border-none text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';

const navItems = [
  { key: 'account' as const, labelKey: 'profile.account.title', icon: 'lucide:user' },
  { key: 'password' as const, labelKey: 'profile.password.title', icon: 'lucide:lock' },
  { key: 'minecraft' as const, labelKey: 'profile.minecraft.title', icon: 'lucide:gamepad-2' },
  { key: 'language' as const, labelKey: 'settings.language.personal', icon: 'lucide:languages' },
];

const mobileNavOptions = computed(() =>
  navItems.map((item) => ({
    value: item.key,
    label: t(item.labelKey),
    icon: item.icon,
  })),
);

const selectedProfileSection = computed({
  get: () => activeSection.value,
  set: (section: string) => {
    if (navItems.some((item) => item.key === section)) {
      activeSection.value = section as typeof activeSection.value;
    }
  },
});

const mcCode = ref('');
const linking = ref(false);
const unlinking = ref(false);
const confirmUnlink = ref(false);

const avatarInput = ref(auth.user?.avatarUrl || '');
const savingAvatar = ref(false);

const editingUsername = ref(false);
const usernameInput = ref(auth.user?.username || '');
const savingUsername = ref(false);

const editingEmail = ref(false);
const emailInput = ref(auth.user?.email || '');
const savingEmail = ref(false);

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const savingPassword = ref(false);

async function saveUsername() {
  const val = usernameInput.value.trim();
  if (!val || val.length < 2 || val.length > 32) {
    ui.toast(t('profile.account.usernameLength'), ToastType.ERROR);
    return;
  }
  if (val === auth.user?.username) return;
  savingUsername.value = true;
  try {
    await auth.updateUsername(val);
    ui.toast(t('profile.account.usernameUpdated'), ToastType.SUCCESS);
    editingUsername.value = false;
  } catch (e) {
    handleError(e, t('common.updateFailed'));
  } finally {
    savingUsername.value = false;
  }
}

async function saveEmail() {
  const val = emailInput.value.trim();
  if (!val || !val.includes('@')) {
    ui.toast(t('profile.account.invalidEmail'), ToastType.ERROR);
    return;
  }
  if (val === auth.user?.email) return;
  savingEmail.value = true;
  try {
    await auth.updateEmail(val);
    ui.toast(t('profile.account.emailUpdated'), ToastType.SUCCESS);
    editingEmail.value = false;
  } catch (e) {
    handleError(e, t('common.updateFailed'));
  } finally {
    savingEmail.value = false;
  }
}

async function saveAvatar() {
  savingAvatar.value = true;
  try {
    await auth.updateAvatar(avatarInput.value.trim() || null);
    ui.toast(t('profile.account.avatarUpdated'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.updateFailed'));
  } finally {
    savingAvatar.value = false;
  }
}

async function clearAvatar() {
  savingAvatar.value = true;
  try {
    await auth.updateAvatar(null);
    avatarInput.value = '';
    ui.toast(t('profile.account.avatarCleared'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.updateFailed'));
  } finally {
    savingAvatar.value = false;
  }
}

async function linkMc() {
  if (!mcCode.value.trim()) return;
  linking.value = true;
  try {
    await auth.linkMinecraft(mcCode.value.trim());
    ui.toast(t('profile.minecraft.linked'), ToastType.SUCCESS);
    mcCode.value = '';
  } catch (e) {
    handleError(e, t('profile.minecraft.linkFailed'));
  } finally {
    linking.value = false;
  }
}

async function unlinkMc() {
  unlinking.value = true;
  try {
    await auth.unlinkMinecraft();
    ui.toast(t('profile.minecraft.unlinked'), ToastType.SUCCESS);
    confirmUnlink.value = false;
  } catch (e) {
    handleError(e, t('profile.minecraft.unlinkFailed'));
  } finally {
    unlinking.value = false;
  }
}

async function changePassword() {
  if (!currentPassword.value || !newPassword.value) {
    ui.toast(t('profile.password.required'), ToastType.ERROR);
    return;
  }
  if (newPassword.value.length < 8) {
    ui.toast(t('profile.password.minLength'), ToastType.ERROR);
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    ui.toast(t('auth.passwordMismatch'), ToastType.ERROR);
    return;
  }
  savingPassword.value = true;
  try {
    await auth.changePassword(currentPassword.value, newPassword.value);
    ui.toast(t('profile.password.updated'), ToastType.SUCCESS);
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (e) {
    handleError(e, t('common.updateFailed'));
  } finally {
    savingPassword.value = false;
  }
}

async function changeLanguage(languageId: string) {
  await setLanguage(languageId);
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
    <div class="md:hidden">
      <BaseSelect v-model="selectedProfileSection" :options="mobileNavOptions" variant="subtle" />
    </div>

    <nav class="settings-side-nav settings-side-nav-desktop">
      <BaseButton
        v-for="item in navItems"
        :key="item.key"
        class="settings-side-nav-item"
        :data-active="activeSection === item.key"
        @click="activeSection = item.key"
      >
        <Icon :icon="item.icon" class="w-4 h-4" />
        {{ t(item.labelKey) }}
      </BaseButton>
    </nav>

    <div class="space-y-6">
      <!-- Account Info -->
      <template v-if="activeSection === 'account'">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {{ t('profile.account.title') }}
        </h2>

        <div class="flex items-start gap-4">
          <div class="w-16 h-16 shrink-0">
            <UserAvatar :username="auth.user?.username || '?'" :avatar-url="auth.user?.avatarUrl" />
          </div>
          <div class="space-y-0.5 flex-1 min-w-0">
            <template v-if="!editingUsername">
              <div class="flex items-center gap-2">
                <p class="font-semibold text-slate-900 dark:text-white">
                  {{ auth.user?.username }}
                </p>
                <BaseButton :class="iconButtonClass" @click="editingUsername = true">
                  <Icon icon="lucide:pencil" class="w-3.5 h-3.5" />
                </BaseButton>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center gap-2 max-w-lg">
                <BaseInput
                  v-model="usernameInput"
                  :placeholder="t('profile.account.usernamePlaceholder')"
                  class="flex-1 !py-1 !text-sm"
                />
                <BaseButton
                  size="sm"
                  :loading="savingUsername"
                  :disabled="usernameInput.trim() === auth.user?.username"
                  @click="saveUsername"
                  >{{ t('common.confirm') }}</BaseButton
                >
                <BaseButton
                  size="sm"
                  @click="
                    editingUsername = false;
                    usernameInput = auth.user?.username || '';
                  "
                  >{{ t('common.cancel') }}</BaseButton
                >
              </div>
            </template>
            <template v-if="!editingEmail">
              <div class="flex items-center gap-2">
                <p class="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                  {{ t('user.email') }}: {{ auth.user?.email }}
                </p>
                <BaseButton :class="iconButtonClass" @click="editingEmail = true">
                  <Icon icon="lucide:pencil" class="w-3.5 h-3.5" />
                </BaseButton>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center gap-2 max-w-lg">
                <BaseInput
                  v-model="emailInput"
                  placeholder="your@email.com"
                  class="flex-1 !py-1 !text-sm"
                />
                <BaseButton
                  size="sm"
                  :loading="savingEmail"
                  :disabled="emailInput.trim() === auth.user?.email"
                  @click="saveEmail"
                  >{{ t('common.confirm') }}</BaseButton
                >
                <BaseButton
                  size="sm"
                  @click="
                    editingEmail = false;
                    emailInput = auth.user?.email || '';
                  "
                  >{{ t('common.cancel') }}</BaseButton
                >
              </div>
            </template>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-mono">
              ID: {{ auth.user?.id }}
            </p>
          </div>
        </div>

        <div class="space-y-4 max-w-lg">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-slate-900 dark:text-white">{{
              t('profile.account.avatarUrl')
            }}</label>
            <div class="flex gap-2">
              <BaseInput v-model="avatarInput" placeholder="https://xxxx" class="flex-1" />
              <BaseButton size="sm" :loading="savingAvatar" @click="saveAvatar">{{
                t('common.save')
              }}</BaseButton>
              <BaseButton
                v-if="auth.user?.avatarUrl"
                size="sm"
                :loading="savingAvatar"
                @click="clearAvatar"
                >{{ t('common.clear') }}</BaseButton
              >
            </div>
          </div>
        </div>
      </template>

      <!-- Change Password -->
      <template v-if="activeSection === 'password'">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {{ t('profile.password.title') }}
        </h2>

        <div class="space-y-4 max-w-lg">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-slate-900 dark:text-white">{{
              t('profile.password.current')
            }}</label>
            <BaseInput
              v-model="currentPassword"
              type="password"
              :placeholder="t('profile.password.currentPlaceholder')"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-medium text-slate-900 dark:text-white">{{
              t('profile.password.new')
            }}</label>
            <BaseInput
              v-model="newPassword"
              type="password"
              :placeholder="t('profile.password.minLength')"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-medium text-slate-900 dark:text-white">{{
              t('profile.password.confirmNew')
            }}</label>
            <BaseInput
              v-model="confirmPassword"
              type="password"
              :placeholder="t('profile.password.confirmPlaceholder')"
            />
          </div>

          <BaseButton size="sm" :loading="savingPassword" @click="changePassword">{{
            t('profile.password.update')
          }}</BaseButton>
        </div>
      </template>

      <!-- MC Binding -->
      <template v-if="activeSection === 'minecraft'">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {{ t('profile.minecraft.title') }}
        </h2>

        <div v-if="auth.user?.minecraftName" class="space-y-3 max-w-lg">
          <div class="flex items-center gap-3">
            <Icon icon="lucide:gamepad-2" class="w-5 h-5 text-green-500" />
            <div>
              <p class="font-medium text-slate-900 dark:text-white">
                {{ auth.user.minecraftName }}
              </p>
              <p class="text-xs text-slate-500">UUID: {{ auth.user.minecraftUuid }}</p>
            </div>
          </div>
          <template v-if="!confirmUnlink">
            <BaseButton size="sm" variant="danger" @click="confirmUnlink = true">{{
              t('profile.minecraft.unlink')
            }}</BaseButton>
          </template>
          <template v-else>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              {{ t('profile.minecraft.unlinkConfirm') }}
            </p>
            <div class="flex gap-2">
              <BaseButton size="sm" variant="danger" :loading="unlinking" @click="unlinkMc">{{
                t('profile.minecraft.confirmUnlink')
              }}</BaseButton>
              <BaseButton size="sm" :disabled="unlinking" @click="confirmUnlink = false">{{
                t('common.cancel')
              }}</BaseButton>
            </div>
          </template>
        </div>

        <div v-else class="space-y-3 max-w-lg">
          <p class="text-sm text-slate-500 dark:text-slate-400">
            {{ t('profile.minecraft.codeHelp') }}
          </p>
          <form class="flex gap-2" @submit.prevent="linkMc">
            <BaseInput
              v-model="mcCode"
              :placeholder="t('profile.minecraft.codePlaceholder')"
              class="flex-1"
            />
            <BaseButton type="submit" :loading="linking" :disabled="!mcCode.trim()">{{
              t('profile.minecraft.link')
            }}</BaseButton>
          </form>
        </div>
      </template>

      <!-- Language -->
      <template v-if="activeSection === 'language'">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {{ t('settings.language.personal') }}
        </h2>

        <div class="space-y-4 max-w-lg">
          <BaseSelect
            :model-value="activeLanguage"
            :label="t('settings.language.personal')"
            :options="
              availableLanguages.map((language) => ({
                value: language.id,
                label: language.displayName,
              }))
            "
            @update:model-value="changeLanguage($event || 'zh-CN')"
          />
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {{ t('profile.language.cookieHelp') }}
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
