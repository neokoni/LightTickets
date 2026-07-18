import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Label } from '@/types/ticket';
import { apiGetLabels, apiCreateLabel, apiUpdateLabel, apiDeleteLabel } from '@/api/labels';

export const useLabelsStore = defineStore('labels', () => {
  const labels = ref<Label[]>([]);
  const loaded = ref(false);
  const loading = ref(false);

  async function fetchList() {
    loading.value = true;
    try {
      labels.value = await apiGetLabels();
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function create(data: { name: string; color: string; description?: string }) {
    const label = await apiCreateLabel(data);
    labels.value.push(label);
    return label;
  }

  async function update(id: string, data: { name?: string; color?: string; description?: string }) {
    const label = await apiUpdateLabel(id, data);
    const idx = labels.value.findIndex((l) => l.id === id);
    if (idx !== -1) labels.value[idx] = label;
    return label;
  }

  async function remove(id: string) {
    await apiDeleteLabel(id);
    labels.value = labels.value.filter((l) => l.id !== id);
  }

  return { labels, loaded, loading, fetchList, create, update, remove };
});
