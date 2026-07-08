import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { getSiteConfig } from '@/api/setup';
import { siteConfig, setSiteConfigCache, setConnectionError } from '@/stores/site';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/connection-error',
      name: 'connection-error',
      component: () => import('@/views/ConnectionErrorView.vue'),
      meta: { public: true },
    },
    {
      path: '/setup',
      name: 'setup',
      component: () => import('@/views/SetupView.vue'),
      meta: { setup: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      name: 'tickets',
      component: () => import('@/views/TicketListView.vue'),
      meta: { public: true },
    },
    {
      path: '/tickets/new',
      name: 'ticket-create',
      component: () => import('@/views/TicketCreateView.vue'),
      meta: { auth: true },
    },
    {
      path: '/tickets/:id',
      name: 'ticket-detail',
      component: () => import('@/views/TicketDetailView.vue'),
      meta: { public: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { auth: true },
    },
    {
      path: '/admin',
      component: () => import('@/views/admin/AdminLayout.vue'),
      meta: { auth: true, admin: true },
      children: [
        { path: '', redirect: '/admin/labels' },
        {
          path: 'labels',
          name: 'admin-labels',
          component: () => import('@/views/admin/AdminLabelsView.vue'),
          meta: { auth: true, admin: true, title: '标签管理' },
        },
        {
          path: 'servers',
          name: 'admin-servers',
          component: () => import('@/views/admin/AdminServersView.vue'),
          meta: { auth: true, admin: true, title: '服务器管理' },
        },
        {
          path: 'templates',
          name: 'admin-templates',
          component: () => import('@/views/admin/AdminTemplatesView.vue'),
          meta: { auth: true, admin: true, title: '模板管理' },
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('@/views/admin/AdminUsersView.vue'),
          meta: { auth: true, admin: true, title: '用户管理' },
        },
        {
          path: 'settings',
          name: 'admin-settings',
          component: () => import('@/views/admin/AdminSettingsView.vue'),
          meta: { auth: true, admin: true, title: '平台设置' },
        },
        {
          path: 'storage',
          name: 'admin-storage',
          component: () => import('@/views/admin/AdminStorageView.vue'),
          meta: { auth: true, admin: true, title: '存储设置' },
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  // 1. Wait for auth restore
  if (auth.loading) {
    await auth.restore();
  }

  // 2. Fetch site config from server if not yet loaded
  if (siteConfig.isSetup === null || to.meta.setup) {
    try {
      const config = await getSiteConfig();
      setSiteConfigCache(config);
    } catch {
      setConnectionError(true);
    }
  }

  // 2b. Connection error: redirect to error page
  if (siteConfig.connectionError && to.name !== 'connection-error') {
    return { name: 'connection-error' };
  }
  if (!siteConfig.connectionError && to.name === 'connection-error') {
    return { name: 'tickets' };
  }

  // 3. Setup page protection: if already setup, redirect away from /setup
  if (to.meta.setup && siteConfig.isSetup) {
    return { name: 'tickets' };
  }

  // 4. If not setup, only allow setup page
  if (!siteConfig.isSetup && to.name !== 'setup') {
    return { name: 'setup' };
  }

  // 5. requireLogin check
  const requireLogin = siteConfig.requireLogin === true;

  if (!auth.isAuthenticated) {
    // requireLogin ON: all non-guest routes require auth
    if (requireLogin && !to.meta.guest && !to.meta.setup) {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
    // requireLogin OFF: only meta.auth routes require auth
    if (!requireLogin && to.meta.auth) {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
  }

  // 6. Already logged in visiting guest routes → go home
  if (auth.isAuthenticated && to.meta.guest) {
    return { name: 'tickets' };
  }

  // 7. Admin check
  if (to.meta.admin && !auth.isAdmin) {
    return { name: 'tickets' };
  }
});

export default router;
