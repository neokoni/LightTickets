import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import type { Ticket, TicketStatus } from '@/types/ticket'
import type { PaginatedResponse } from '@/types/api'
import { apiGetTickets, apiGetTicket, apiUpdateTicket, apiApproveTicket, apiRejectTicket, apiCloseTicket, apiReopenTicket, type TicketFilters } from '@/api/tickets'

export const useTicketsStore = defineStore('tickets', () => {
  const tickets = ref<Ticket[]>([])
  const total = ref(0)
  const currentTicket = ref<Ticket | null>(null)
  const loading = ref(false)

  const filters = reactive<TicketFilters>({
    page: 1,
    pageSize: 20,
    status: undefined,
    type: undefined,
    search: '',
  })

  async function fetchList() {
    loading.value = true
    try {
      const res: PaginatedResponse<Ticket> = await apiGetTickets(filters)
      tickets.value = res.tickets
      total.value = res.total
    } finally {
      loading.value = false
    }
  }

  async function fetchDetail(id: number) {
    currentTicket.value = await apiGetTicket(id)
  }

  async function updateStatus(id: number, status: TicketStatus) {
    const updated = await apiUpdateTicket(id, { status })
    if (currentTicket.value?.id === id) currentTicket.value = updated
    const idx = tickets.value.findIndex(t => t.id === id)
    if (idx !== -1) tickets.value[idx] = updated
  }

  async function approve(id: number) {
    const updated = await apiApproveTicket(id)
    if (currentTicket.value?.id === id) currentTicket.value = updated
  }

  async function reject(id: number, reason?: string) {
    const updated = await apiRejectTicket(id, reason)
    if (currentTicket.value?.id === id) currentTicket.value = updated
  }

  async function closeTicket(id: number) {
    const updated = await apiCloseTicket(id)
    if (currentTicket.value?.id === id) currentTicket.value = updated
    const idx = tickets.value.findIndex(t => t.id === id)
    if (idx !== -1) tickets.value[idx] = updated
  }

  async function reopenTicket(id: number) {
    const updated = await apiReopenTicket(id)
    if (currentTicket.value?.id === id) currentTicket.value = updated
    const idx = tickets.value.findIndex(t => t.id === id)
    if (idx !== -1) tickets.value[idx] = updated
  }

  function setFilter(key: keyof TicketFilters, value: string | number | undefined) {
    ;(filters as Record<string, unknown>)[key] = value
    filters.page = 1
  }

  return { tickets, total, currentTicket, loading, filters, fetchList, fetchDetail, updateStatus, approve, reject, closeTicket, reopenTicket, setFilter }
})
