import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { isAdminRole, isStaffRole, type User } from '@/types/user';
import {
  apiLogin,
  apiRegister,
  apiRefresh,
  apiLogout,
  apiLinkMinecraft,
  apiUnlinkMinecraft,
  apiUpdateAvatar,
  apiUpdateUsername,
  apiChangePassword,
  apiRequestEmailChange,
  apiVerifyEmailChange,
  apiCancelPendingEmailChange,
  apiUpdateEmailNotifications,
} from '@/api/auth';
import { clearApiSession, setAccessToken } from '@/api/client';
import { useLabelsStore } from '@/stores/labels';
import { useTemplatesStore } from '@/stores/templates';
import { useTicketsStore } from '@/stores/tickets';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loading = ref(true);

  const isAuthenticated = computed(() => !!user.value);
  const isStaff = computed(() => (user.value ? isStaffRole(user.value.role) : false));
  const isAdmin = computed(() => (user.value ? isAdminRole(user.value.role) : false));

  function clearUserSession() {
    user.value = null;
    clearApiSession();
    useLabelsStore().clearSessionState();
    useTemplatesStore().clearSessionState();
    useTicketsStore().clearSessionState();
  }

  async function login(emailOrUsername: string, password: string, turnstileToken?: string) {
    const res = await apiLogin(emailOrUsername, password, turnstileToken);
    user.value = res.user;
    setAccessToken(res.accessToken);
  }

  async function register(
    email: string,
    password: string,
    username: string,
    emailVerificationCode?: string,
    turnstileToken?: string,
  ) {
    const res = await apiRegister(email, password, username, emailVerificationCode, turnstileToken);
    user.value = res.user;
    setAccessToken(res.accessToken);
  }

  async function restore() {
    try {
      const res = await apiRefresh();
      user.value = res.user;
      setAccessToken(res.accessToken);
    } catch {
      clearUserSession();
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    clearUserSession();
    try {
      await apiLogout();
    } catch {
      // Local state is already cleared even if the server session is gone or unreachable.
    }
  }

  function setTokens(accessToken: string, userData: User) {
    user.value = userData;
    setAccessToken(accessToken);
  }

  async function linkMinecraft(code: string) {
    const res = await apiLinkMinecraft(code);
    if (user.value) {
      user.value.minecraftUuid = res.uuid;
      user.value.minecraftName = res.name;
    }
  }

  async function unlinkMinecraft() {
    const updated = await apiUnlinkMinecraft();
    if (user.value) {
      user.value.minecraftUuid = updated.minecraftUuid ?? undefined;
      user.value.minecraftName = updated.minecraftName ?? undefined;
    }
  }

  async function updateAvatar(avatarUrl: string | null) {
    const updated = await apiUpdateAvatar(avatarUrl);
    if (user.value) {
      user.value.avatarUrl = updated.avatarUrl;
    }
  }

  async function updateUsername(username: string) {
    const updated = await apiUpdateUsername(username);
    if (user.value) {
      user.value.username = updated.username;
    }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await apiChangePassword(currentPassword, newPassword);
  }

  async function requestEmailChange(email: string, currentPassword: string) {
    const result = await apiRequestEmailChange(email, currentPassword);
    if (user.value) {
      user.value.pendingEmail = result.pendingEmail;
    }
    return result;
  }

  async function verifyEmailChange(code: string) {
    const updated = await apiVerifyEmailChange(code);
    if (user.value) user.value = updated;
  }

  async function cancelPendingEmailChange() {
    await apiCancelPendingEmailChange();
    if (user.value) user.value.pendingEmail = null;
  }

  async function updateEmailNotifications(receiveEmailNotifications: boolean) {
    const updated = await apiUpdateEmailNotifications(receiveEmailNotifications);
    if (user.value) {
      user.value.receiveEmailNotifications = updated.receiveEmailNotifications;
    }
  }

  return {
    user,
    loading,
    isAuthenticated,
    isStaff,
    isAdmin,
    login,
    register,
    restore,
    logout,
    setTokens,
    linkMinecraft,
    unlinkMinecraft,
    updateAvatar,
    updateUsername,
    changePassword,
    requestEmailChange,
    verifyEmailChange,
    cancelPendingEmailChange,
    updateEmailNotifications,
  };
});
