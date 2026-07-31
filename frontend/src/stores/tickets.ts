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
  let sessionVersion = 0;

  const filters = reactive<TicketFilters>({
    page: 1,
    pageSize: 20,
    statuses: undefined,
    type: undefined,
    labelId: undefined,
    serverId: undefined,
    serverName: undefined,
    hasServer: undefined,
    authorName: undefined,
    search: '',
  });

  async function fetchList() {
    const version = sessionVersion;
    loading.value = true;
    try {
      const res: PaginatedResponse<Ticket> = await apiGetTickets(filters);
      if (version === sessionVersion) {
        tickets.value = res.tickets;
        total.value = res.total;
      }
    } finally {
      if (version === sessionVersion) loading.value = false;
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

  function clearSessionState() {
    sessionVersion++;
    detailRequestId++;
    tickets.value = [];
    total.value = 0;
    currentTicket.value = null;
    loading.value = false;
    detailLoading.value = false;
    Object.assign(filters, {
      page: 1,
      pageSize: 20,
      statuses: undefined,
      type: undefined,
      labelId: undefined,
      serverId: undefined,
      serverName: undefined,
      hasServer: undefined,
      authorName: undefined,
      search: '',
    });
  }

  function syncTicketUpdate(updated: Ticket, version: number) {
    if (version !== sessionVersion) return;
    if (currentTicket.value?.id === updated.id) currentTicket.value = updated;
    const idx = tickets.value.findIndex((t) => t.id === updated.id);
    if (idx !== -1) tickets.value[idx] = updated;
  }

  async function updateStatus(id: number, status: TicketStatus) {
    const version = sessionVersion;
    syncTicketUpdate(await apiUpdateTicket(id, { status }), version);
  }

  async function updateVisibility(id: number, hidden: boolean) {
    const version = sessionVersion;
    syncTicketUpdate(await apiUpdateTicket(id, { hidden }), version);
  }

  async function closeTicket(id: number) {
    const version = sessionVersion;
    syncTicketUpdate(await apiCloseTicket(id), version);
  }

  async function reopenTicket(id: number) {
    const version = sessionVersion;
    syncTicketUpdate(await apiReopenTicket(id), version);
  }

  async function updateTitle(id: number, title: string) {
    const version = sessionVersion;
    syncTicketUpdate(await apiUpdateTicketTitle(id, title), version);
  }

  async function updateBody(id: number, body: string) {
    const version = sessionVersion;
    const updated = await apiUpdateTicketBody(id, body);
    if (version === sessionVersion && currentTicket.value?.id === id) {
      currentTicket.value = updated;
    }
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
    clearSessionState,
    updateStatus,
    updateVisibility,
    closeTicket,
    reopenTicket,
    updateTitle,
    updateBody,
    setFilter,
  };
});
