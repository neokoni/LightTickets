import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { getSiteConfig } from '@/api/setup';
import { siteConfig, setSiteConfigCache, setConnectionError } from '@/stores/site';
import { syncI18nWithDefault } from '@/i18n';
import { setPageTitleKey } from '@/utils/page-title';

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
  routes: [
    {
      path: '/connection-error',
      name: 'connection-error',
      component: () => import('@/views/ConnectionErrorView.vue'),
      meta: { public: true, titleKey: 'connectionError.title' },
    },
    {
      path: '/setup',
      name: 'setup',
      component: () => import('@/views/SetupView.vue'),
      meta: { setup: true, titleKey: 'setup.title' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true, titleKey: 'auth.login.title' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { guest: true, titleKey: 'auth.register.title' },
    },
    {
      path: '/federatedauth/complete',
      name: 'federatedauth-complete',
      component: () => import('@/views/FederatedAuthCompleteView.vue'),
      meta: { public: true, titleKey: 'federatedauth.completing' },
    },
    {
      path: '/federatedauth/register',
      name: 'federatedauth-register',
      component: () => import('@/views/FederatedAuthRegisterView.vue'),
      meta: { guest: true, titleKey: 'federatedauth.createAccount' },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/ForgotPasswordView.vue'),
      meta: { guest: true, titleKey: 'auth.forgot.title' },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/ResetPasswordView.vue'),
      meta: { guest: true, allowAuthenticated: true, titleKey: 'auth.reset.title' },
    },
    {
      path: '/unsubscribe',
      name: 'unsubscribe',
      component: () => import('@/views/UnsubscribeView.vue'),
      meta: { guest: true, allowAuthenticated: true, titleKey: 'unsubscribe.title' },
    },
    {
      path: '/cancel-email-change',
      name: 'cancel-email-change',
      component: () => import('@/views/CancelEmailChangeView.vue'),
      meta: { guest: true, allowAuthenticated: true, titleKey: 'emailChangeCancel.title' },
    },
    {
      path: '/',
      name: 'tickets',
      component: () => import('@/views/TicketListView.vue'),
      meta: { public: true, titleKey: 'nav.tickets' },
    },
    {
      path: '/tickets/new',
      name: 'ticket-create',
      component: () => import('@/views/TicketCreateView.vue'),
      meta: { auth: true, titleKey: 'ticket.create.title' },
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
          meta: { auth: true, admin: true, titleKey: 'admin.nav.labels' },
        },
        {
          path: 'servers',
          name: 'admin-servers',
          component: () => import('@/views/admin/AdminServersView.vue'),
          meta: { auth: true, admin: true, titleKey: 'admin.nav.servers' },
        },
        {
          path: 'templates',
          name: 'admin-templates',
          component: () => import('@/views/admin/AdminTemplatesView.vue'),
          meta: { auth: true, admin: true, titleKey: 'admin.nav.templates' },
        },
        {
          path: 'player-groups',
          name: 'admin-player-groups',
          component: () => import('@/views/admin/AdminPlayerGroupsView.vue'),
          meta: { auth: true, admin: true, titleKey: 'admin.nav.playerGroups' },
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('@/views/admin/AdminUsersView.vue'),
          meta: { auth: true, admin: true, titleKey: 'admin.nav.users' },
        },
        {
          path: 'settings',
          name: 'admin-settings',
          component: () => import('@/views/admin/AdminSettingsView.vue'),
          meta: { auth: true, admin: true, titleKey: 'admin.nav.settings' },
        },
        {
          path: 'mail',
          name: 'admin-mail',
          component: () => import('@/views/admin/AdminMailView.vue'),
          meta: { auth: true, admin: true, titleKey: 'admin.nav.mail' },
        },
        {
          path: 'turnstile',
          name: 'admin-turnstile',
          component: () => import('@/views/admin/AdminTurnstileView.vue'),
          meta: { auth: true, admin: true, titleKey: 'admin.nav.turnstile' },
        },
        {
          path: 'rate-limit',
          name: 'admin-rate-limit',
          component: () => import('@/views/admin/AdminRateLimitView.vue'),
          meta: { auth: true, admin: true, titleKey: 'admin.nav.rateLimit' },
        },
        {
          path: 'federatedauth',
          name: 'admin-federatedauth',
          component: () => import('@/views/admin/AdminFederatedAuthView.vue'),
          meta: { auth: true, admin: true, titleKey: 'admin.nav.federatedauth' },
        },
        {
          path: 'storage',
          name: 'admin-storage',
          component: () => import('@/views/admin/AdminStorageView.vue'),
          meta: { auth: true, admin: true, titleKey: 'admin.nav.storage' },
        },
        {
          path: 'about',
          name: 'admin-about',
          component: () => import('@/views/admin/AdminAboutView.vue'),
          meta: { auth: true, admin: true, titleKey: 'admin.nav.about' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { public: true, titleKey: 'notFound.title' },
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const ui = useUiStore();

  ui.startRouteLoading();

  // 1. Wait for auth restore
  if (auth.loading) {
    await auth.restore();
  }

  // 2. Fetch site config from server if not yet loaded
  if (siteConfig.isSetup === null || to.meta.setup) {
    try {
      const config = await getSiteConfig();
      setSiteConfigCache(config);
      await syncI18nWithDefault(config.defaultLanguage);
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

  if (to.name === 'forgot-password' && !siteConfig.passwordResetEnabled) {
    return { name: 'login' };
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
  if (auth.isAuthenticated && to.meta.guest && !to.meta.allowAuthenticated) {
    return { name: 'tickets' };
  }

  // 7. Admin check
  if (to.meta.admin && !auth.isAdmin) {
    return { name: 'tickets' };
  }
});

router.afterEach((to) => {
  if (typeof to.meta.titleKey === 'string') setPageTitleKey(to.meta.titleKey);
  useUiStore().stopRouteLoading();
});

if (typeof window !== 'undefined') {
  window.addEventListener('auth:session-expired', () => {
    if (router.currentRoute.value.name !== 'login') {
      void router.push({
        name: 'login',
        query: { redirect: router.currentRoute.value.fullPath },
      });
    }
  });
}

router.onError(() => {
  useUiStore().stopRouteLoading();
});

export default router;
