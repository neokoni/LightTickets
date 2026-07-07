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
  apiUpdateEmail,
} from '@/api/auth';
import { setAccessToken } from '@/api/client';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loading = ref(true);

  const isAuthenticated = computed(() => !!user.value);
  const isStaff = computed(() => (user.value ? isStaffRole(user.value.role) : false));
  const isAdmin = computed(() => (user.value ? isAdminRole(user.value.role) : false));

  async function login(emailOrUsername: string, password: string) {
    const res = await apiLogin(emailOrUsername, password);
    user.value = res.user;
    setAccessToken(res.accessToken);
  }

  async function register(email: string, password: string, username: string) {
    const res = await apiRegister(email, password, username);
    user.value = res.user;
    setAccessToken(res.accessToken);
  }

  async function restore() {
    try {
      const res = await apiRefresh();
      user.value = res.user;
      setAccessToken(res.accessToken);
    } catch {
      user.value = null;
      setAccessToken(null);
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    try {
      if (user.value) await apiLogout();
    } catch {
      // Local state should still be cleared if the session is already gone.
    }
    user.value = null;
    setAccessToken(null);
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

  async function updateEmail(email: string) {
    const updated = await apiUpdateEmail(email);
    if (user.value) {
      user.value.email = updated.email;
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
    updateEmail,
  };
});
