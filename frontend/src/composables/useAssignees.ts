import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useTicketsStore } from '@/stores/tickets';
import { handleError } from '@/utils/error';
import { apiGetAssignableUsers } from '@/api/users';
import { apiSetAssignees } from '@/api/tickets';
import type { AssignableUser } from '@/types/user';
import type { Ticket } from '@/types/ticket';

export function useAssignees(ticket: () => Ticket | null) {
  const auth = useAuthStore();
  const store = useTicketsStore();

  const assignableUsers = ref<AssignableUser[]>([]);
  const showAssignPicker = ref(false);
  const selectedAssigneeIds = ref<number[]>([]);
  const assigning = ref(false);

  async function fetchAssignableUsers() {
    if (!auth.isStaff) return;
    try {
      assignableUsers.value = await apiGetAssignableUsers();
    } catch {
      /* ignore */
    }
  }

  function openAssignPicker() {
    const t = ticket();
    if (t?.assignees) {
      selectedAssigneeIds.value = t.assignees.map((a) => a.userId);
    } else {
      selectedAssigneeIds.value = [];
    }
    showAssignPicker.value = true;
    if (!assignableUsers.value.length) fetchAssignableUsers();
  }

  async function saveAssignees(ids: number[]) {
    const t = ticket();
    if (!t) return;
    assigning.value = true;
    try {
      const updated = await apiSetAssignees(t.id, ids);
      store.currentTicket = updated;
      showAssignPicker.value = false;
    } catch (e) {
      handleError(e);
    } finally {
      assigning.value = false;
    }
  }

  return {
    assignableUsers,
    showAssignPicker,
    selectedAssigneeIds,
    assigning,
    fetchAssignableUsers,
    openAssignPicker,
    saveAssignees,
  };
}
