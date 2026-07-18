import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import type { Ticket, TicketStatus, TicketFilters } from '@/types/ticket';
import type { PaginatedResponse } from '@/types/api';
import {
  apiGetTickets,
  apiGetTicket,
  apiUpdateTicket,
  apiCloseTicket,
  apiReopenTicket,
  apiUpdateTicketTitle,
  apiUpdateTicketBody,
} from '@/api/tickets';

export const useTicketsStore = defineStore('tickets', () => {
  const tickets = ref<Ticket[]>([]);
  const total = ref(0);
  const currentTicket = ref<Ticket | null>(null);
  const loading = ref(false);
  const detailLoading = ref(false);
  let detailRequestId = 0;

  const filters = reactive<TicketFilters>({
    page: 1,
    pageSize: 20,
    statuses: undefined,
    type: undefined,
    labelId: undefined,
    serverId: undefined,
    hasServer: undefined,
    authorName: undefined,
    search: '',
  });

  async function fetchList() {
    loading.value = true;
    try {
      const res: PaginatedResponse<Ticket> = await apiGetTickets(filters);
      tickets.value = res.tickets;
      total.value = res.total;
    } finally {
      loading.value = false;
    }
  }

  async function fetchDetail(id: number, options: { clearCurrent?: boolean } = {}) {
    const requestId = ++detailRequestId;
    if (options.clearCurrent && currentTicket.value?.id !== id) {
      currentTicket.value = null;
    }
    detailLoading.value = true;
    try {
      const ticket = await apiGetTicket(id);
      if (requestId === detailRequestId) {
        currentTicket.value = ticket;
      }
      return ticket;
    } finally {
      if (requestId === detailRequestId) {
        detailLoading.value = false;
      }
    }
  }

  function clearCurrentTicket() {
    detailRequestId++;
    currentTicket.value = null;
    detailLoading.value = false;
  }

  function syncTicketUpdate(updated: Ticket) {
    if (currentTicket.value?.id === updated.id) currentTicket.value = updated;
    const idx = tickets.value.findIndex((t) => t.id === updated.id);
    if (idx !== -1) tickets.value[idx] = updated;
  }

  async function updateStatus(id: number, status: TicketStatus) {
    syncTicketUpdate(await apiUpdateTicket(id, { status }));
  }

  async function closeTicket(id: number) {
    syncTicketUpdate(await apiCloseTicket(id));
  }

  async function reopenTicket(id: number) {
    syncTicketUpdate(await apiReopenTicket(id));
  }

  async function updateTitle(id: number, title: string) {
    syncTicketUpdate(await apiUpdateTicketTitle(id, title));
  }

  async function updateBody(id: number, body: string) {
    const updated = await apiUpdateTicketBody(id, body);
    if (currentTicket.value?.id === id) currentTicket.value = updated;
  }

  function setFilter(key: keyof TicketFilters, value: string | number | undefined) {
    (filters as Record<string, unknown>)[key] = value;
    filters.page = 1;
  }

  return {
    tickets,
    total,
    currentTicket,
    loading,
    detailLoading,
    filters,
    fetchList,
    fetchDetail,
    clearCurrentTicket,
    updateStatus,
    closeTicket,
    reopenTicket,
    updateTitle,
    updateBody,
    setFilter,
  };
});
