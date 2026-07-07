import { ref, computed } from 'vue';
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
  const assignSearch = ref('');
  const selectedAssigneeIds = ref<number[]>([]);
  const assigning = ref(false);

  const filteredAssignableUsers = computed(() => {
    if (!assignSearch.value) return assignableUsers.value;
    const q = assignSearch.value.toLowerCase();
    return assignableUsers.value.filter((u) => u.username.toLowerCase().includes(q));
  });

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
    assignSearch.value = '';
    showAssignPicker.value = true;
    if (!assignableUsers.value.length) fetchAssignableUsers();
  }

  function toggleAssignee(userId: number) {
    const idx = selectedAssigneeIds.value.indexOf(userId);
    if (idx >= 0) {
      selectedAssigneeIds.value.splice(idx, 1);
    } else {
      selectedAssigneeIds.value.push(userId);
    }
  }

  async function saveAssignees() {
    const t = ticket();
    if (!t) return;
    assigning.value = true;
    try {
      const updated = await apiSetAssignees(t.id, selectedAssigneeIds.value);
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
    assignSearch,
    selectedAssigneeIds,
    assigning,
    filteredAssignableUsers,
    fetchAssignableUsers,
    openAssignPicker,
    toggleAssignee,
    saveAssignees,
  };
}
