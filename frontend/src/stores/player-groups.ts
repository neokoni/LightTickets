import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PlayerGroupItemsQuery, PlayerGroupSummary } from '@/types/player-group';
import {
  apiAddPlayerGroupItems,
  apiDeletePlayerGroupItem,
  apiGetPlayerGroupItems,
  apiGetPlayerGroups,
  apiCreatePlayerGroup,
  apiUpdatePlayerGroup,
  apiUpdatePlayerGroupItem,
  apiDeletePlayerGroup,
} from '@/api/player-groups';

export const usePlayerGroupsStore = defineStore('player-groups', () => {
  const groups = ref<PlayerGroupSummary[]>([]);
  const loaded = ref(false);
  const loading = ref(false);

  function replaceGroup(group: PlayerGroupSummary) {
    const index = groups.value.findIndex((item) => item.id === group.id);
    if (index >= 0) groups.value[index] = group;
    else groups.value.push(group);
    groups.value.sort((left, right) => left.id.localeCompare(right.id));
  }

  async function fetchList() {
    loading.value = true;
    try {
      groups.value = await apiGetPlayerGroups();
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }
  async function create(data: { id: string; name?: string; note?: string }) {
    const group = await apiCreatePlayerGroup(data);
    replaceGroup(group);
    return group;
  }
  async function update(id: string, data: { name?: string | null; note?: string | null }) {
    const group = await apiUpdatePlayerGroup(id, data);
    replaceGroup(group);
    return group;
  }
  async function remove(id: string) {
    await apiDeletePlayerGroup(id);
    groups.value = groups.value.filter((item) => item.id !== id);
  }
  async function getItems(id: string, query: PlayerGroupItemsQuery) {
    const result = await apiGetPlayerGroupItems(id, query);
    replaceGroup(result.group);
    return result;
  }
  async function addItems(id: string, values: string[]) {
    const group = await apiAddPlayerGroupItems(id, values);
    replaceGroup(group);
    return group;
  }
  async function updateItem(groupId: string, itemId: string, value: string) {
    return apiUpdatePlayerGroupItem(groupId, itemId, value);
  }
  async function removeItem(groupId: string, itemId: string) {
    await apiDeletePlayerGroupItem(groupId, itemId);
    const group = groups.value.find((item) => item.id === groupId);
    if (group) group._count.items = Math.max(0, group._count.items - 1);
  }
  return {
    groups,
    loaded,
    loading,
    fetchList,
    create,
    update,
    remove,
    getItems,
    addItems,
    updateItem,
    removeItem,
  };
});
