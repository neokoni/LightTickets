import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getSetupStatus } from '@/api/setup'

let setupChecked: boolean | null = null

const router = createRouter({
  history: createWebHistory(),
  routes: [
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
      meta: { auth: true },
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
      meta: { auth: true },
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
        { path: 'labels', name: 'admin-labels', component: () => import('@/views/admin/AdminLabelsView.vue') },
        { path: 'servers', name: 'admin-servers', component: () => import('@/views/admin/AdminServersView.vue') },
        { path: 'users', name: 'admin-users', component: () => import('@/views/admin/AdminUsersView.vue') },
        { path: 'settings', name: 'admin-settings', component: () => import('@/views/admin/AdminSettingsView.vue') },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (auth.loading) {
    await auth.restore()
  }

  // Setup guard: if not set up, only allow setup page
  if (setupChecked === null && to.name !== 'setup') {
    try {
      const status = await getSetupStatus()
      setupChecked = status.isSetup
      if (!setupChecked) {
        return { name: 'setup' }
      }
    } catch {
      return { name: 'setup' }
    }
  }

  if (to.meta.setup && setupChecked) {
    return { name: 'tickets' }
  }

  if (to.meta.auth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guest && auth.isAuthenticated) {
    return { name: 'tickets' }
  }

  if (to.meta.admin && !auth.isAdmin) {
    return { name: 'tickets' }
  }
})

export default router
